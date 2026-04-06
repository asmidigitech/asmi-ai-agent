import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
import xmlrpc.client

from odoo import http
from odoo.http import request, Response

_logger = logging.getLogger(__name__)


class AsmiGallaboxBridgeController(http.Controller):

    @http.route('/asmi/gallabox/health', type='http', auth='public', methods=['GET'], csrf=False)
    def health(self, **kwargs):
        payload = {'ok': True, 'service': 'asmi_gallabox_bridge'}
        return Response(json.dumps(payload), content_type='application/json', status=200)

    @http.route('/asmi/gallabox/lead_webhook', type='http', auth='public', methods=['POST'], csrf=False)
    def lead_webhook(self, **kwargs):
        icp = request.env['ir.config_parameter'].sudo()
        enabled = icp.get_param('asmi_gallabox_bridge.enabled', 'True')
        if str(enabled).lower() not in ('1', 'true', 'yes', 'y'):
            return self._json({'ok': False, 'message': 'Bridge disabled'}, status=503)

        expected_secret = (icp.get_param('asmi_gallabox_bridge.webhook_secret') or '').strip()
        provided_secret = (request.httprequest.headers.get('X-Asmi-Webhook-Secret') or '').strip()

        # Odoo Online webhook usually won't send custom headers.
        # Only validate if a secret header is actually present.
        if expected_secret and provided_secret:
            if provided_secret != expected_secret:
                return self._json({'ok': False, 'message': 'Invalid secret'}, status=401)

        payload = self._parse_payload(kwargs)
        lead_id = payload.get('id') or payload.get('lead_id') or payload.get('record_id')
        lead_name = payload.get('name') or payload.get('partner_name') or 'Lead'
        raw_phone = payload.get('mobile') or payload.get('phone') or ''
        phone = self._normalize_indian_phone(raw_phone)
        payment_already_sent = self._as_bool(payload.get('payment_link_sent'))

        log_model = request.env['asmi.gallabox.log'].sudo()
        log_rec = log_model.create_log(
            payload,
            name=f'Lead {lead_id or "unknown"}',
            source_ref=str(lead_id or ''),
            lead_name=lead_name,
            phone=phone or raw_phone,
            status='received',
        )

        if payment_already_sent:
            log_rec.write({
                'status': 'duplicate',
                'message': 'payment_link_sent already true in source payload',
            })
            return self._json(
                {'ok': True, 'message': 'Skipped. payment_link_sent already true.'},
                status=200,
            )

        if not phone:
            log_rec.write({
                'status': 'invalid',
                'message': f'Invalid or missing phone: {raw_phone}',
            })
            return self._json({'ok': False, 'message': 'Invalid or missing phone'}, status=400)

        if lead_id:
            duplicate = log_model.search([
                ('source_ref', '=', str(lead_id)),
                ('status', '=', 'sent'),
            ], limit=1)
            if duplicate:
                log_rec.write({
                    'status': 'duplicate',
                    'message': 'Already sent earlier for this lead',
                })
                return self._json({'ok': True, 'message': 'Duplicate skipped'}, status=200)

        try:
            lead = request.env['crm.lead'].sudo().browse(int(lead_id)) if lead_id else None

            if lead and lead.exists():
                send_result = self._send_gallabox_template(lead.name or lead_name, phone, lead)
            else:
                raise ValueError('Lead not found for WhatsApp send')

            log_rec.write({
                'status': 'sent',
                'template_name': send_result.get('template_name'),
                'payment_link': send_result.get('payment_link', ''),
                'response_payload': json.dumps(
                    send_result.get('response_json'),
                    ensure_ascii=False,
                    default=str,
                ),
                'gallabox_message_id': send_result.get('message_id') or '',
                'message': 'WhatsApp template sent',
            })

            writeback_result = None
            if lead_id:
                writeback_result = self._writeback_to_odoo_online(int(lead_id), phone)

            return self._json({
                'ok': True,
                'message': 'WhatsApp template sent',
                'lead_id': lead_id,
                'phone': phone,
                'writeback': writeback_result,
            }, status=200)

        except Exception as exc:  # pylint: disable=broad-except
            _logger.exception('Gallabox bridge failed')
            log_rec.write({'status': 'failed', 'message': str(exc)[:500]})
            return self._json({'ok': False, 'message': str(exc)}, status=500)

    def _send_gallabox_template(self, lead_name, phone, lead):
        icp = request.env['ir.config_parameter'].sudo()

        api_key = (icp.get_param('asmi_gallabox_bridge.api_key') or '').strip()
        api_secret = (icp.get_param('asmi_gallabox_bridge.api_secret') or '').strip()
        channel_id = (icp.get_param('asmi_gallabox_bridge.channel_id') or '').strip()
        template_name = (icp.get_param('asmi_gallabox_bridge.template_name') or '').strip()
        api_url = (
            icp.get_param('asmi_gallabox_bridge.api_url')
            or 'https://server.gallabox.com/devapi/messages/whatsapp'
        ).strip()

        missing = []
        if not api_key:
            missing.append('Gallabox API Key')
        if not api_secret:
            missing.append('Gallabox API Secret')
        if not channel_id:
            missing.append('Gallabox Channel ID')
        if not template_name:
            missing.append('Gallabox Template Name')
        if missing:
            raise ValueError('Missing settings: %s' % ', '.join(missing))

        score = int(getattr(lead, 'x_assessment_score', 0) or 0)
        niche = (getattr(lead, 'x_niche', '') or 'business owner').strip()
        problems = (getattr(lead, 'x_problem_summary', '') or '').strip()

        if score < 40:
            score_text = "🚨 Aapka business risk zone mein hai."
        elif score < 70:
            score_text = "⚠️ Aapke business mein systems weak hai."
        else:
            score_text = "✅ Aapka foundation strong hai."

        analysis = f"""{score_text}

As a {niche}, yeh gaps dikhe:

{problems}

👉 Agar yeh fix ho jaye toh growth 2-3x faster ho sakta hai
""".strip()

        body = {
            'channelId': channel_id,
            'channelType': 'whatsapp',
            'recipient': {
                'name': lead_name,
                'phone': phone.replace('+', ''),
            },
            'whatsapp': {
                'type': 'template',
                'template': {
                    'templateName': template_name,
                    'bodyValues': {
                        'name': lead_name,
                        'score': str(score),
                        'analysis': analysis,
                    },
                },
            },
        }

        data = json.dumps(body).encode('utf-8')
        request_id = str(uuid.uuid4())

        req = urllib.request.Request(
            api_url,
            data=data,
            method='POST',
            headers={
                'apiKey': api_key,
                'apiSecret': api_secret,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'AsmiGallaboxBridge/1.0',
                'X-Request-Id': request_id,
            },
        )

        _logger.info(
            'Gallabox send start | request_id=%s | phone=%s | template=%s | channel_id=%s | body=%s',
            request_id, phone, template_name, channel_id, json.dumps(body, ensure_ascii=False)
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode('utf-8')
                response_json = json.loads(raw) if raw else {}
                _logger.info(
                    'Gallabox send success | request_id=%s | status=%s | response=%s',
                    request_id, getattr(resp, 'status', 200), raw
                )
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode('utf-8', errors='ignore')
            _logger.error(
                'Gallabox send HTTP error | request_id=%s | status=%s | response=%s',
                request_id, exc.code, raw
            )
            raise ValueError(f'Gallabox HTTP {exc.code}: {raw}') from exc
        except urllib.error.URLError as exc:
            _logger.error(
                'Gallabox connection error | request_id=%s | error=%s',
                request_id, exc
            )
            raise ValueError(f'Gallabox connection error: {exc}') from exc

        message_id = (
            response_json.get('messageId')
            or response_json.get('id')
            or response_json.get('data', {}).get('messageId')
            or response_json.get('data', {}).get('id')
        )

        return {
            'template_name': template_name,
            'payment_link': '',
            'message_id': message_id,
            'response_json': response_json,
        }

    def _writeback_to_odoo_online(self, lead_id, phone):
        icp = request.env['ir.config_parameter'].sudo()
        url = (icp.get_param('asmi_gallabox_bridge.odoo_online_url') or '').rstrip('/')
        db = (icp.get_param('asmi_gallabox_bridge.odoo_online_db') or '').strip()
        username = (icp.get_param('asmi_gallabox_bridge.odoo_online_username') or '').strip()
        api_key = (icp.get_param('asmi_gallabox_bridge.odoo_online_api_key') or '').strip()

        if not (url and db and username and api_key and lead_id):
            return {'ok': False, 'skipped': True, 'message': 'Writeback settings incomplete'}

        common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
        uid = common.authenticate(db, username, api_key, {})
        if not uid:
            return {'ok': False, 'skipped': True, 'message': 'Odoo Online authentication failed'}

        models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')
        result = models.execute_kw(
            db,
            uid,
            api_key,
            'crm.lead',
            'write',
            [[lead_id], {
                'x_payment_link_sent': True,
                'x_whatsapp_dispatch_status': 'sent',
                'x_whatsapp_dispatch_error': False,
            }],
        )
        return {'ok': bool(result), 'lead_id': lead_id, 'phone': phone}

    def _parse_payload(self, kwargs):
        raw = request.httprequest.get_data(cache=False, as_text=True) or ''
        content_type = (request.httprequest.content_type or '').lower()

        if 'application/json' in content_type and raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                pass

        if raw and '=' in raw and ('application/x-www-form-urlencoded' in content_type or not content_type):
            parsed = urllib.parse.parse_qs(raw, keep_blank_values=True)
            return {
                k: v[0] if isinstance(v, list) and len(v) == 1 else v
                for k, v in parsed.items()
            }

        if kwargs:
            return kwargs

        return {}

    def _normalize_indian_phone(self, value):
        digits = re.sub(r'\D+', '', value or '')
        if not digits:
            return ''
        if digits.startswith('91') and len(digits) == 12:
            return '+' + digits
        if len(digits) == 10 and digits[0] in '6789':
            return '+91' + digits
        if digits.startswith('0') and len(digits) == 11:
            digits = digits[1:]
            if len(digits) == 10 and digits[0] in '6789':
                return '+91' + digits
        return ''

    def _as_bool(self, value):
        return str(value).strip().lower() in ('1', 'true', 'yes', 'y')

    def _json(self, payload, status=200):
        return Response(json.dumps(payload), content_type='application/json', status=status)
