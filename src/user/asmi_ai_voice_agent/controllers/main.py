import json
import logging
import uuid

from odoo import http, fields
from odoo.http import request

_logger = logging.getLogger(__name__)


class AsmiAIVoiceAgentController(http.Controller):

    def _json_response(self, data, status=200):
        return request.make_json_response(data, status=status)

    def _check_api_key(self):
        expected_key = request.env['ir.config_parameter'].sudo().get_param(
            'asmi_ai_voice_agent.api_key', default=''
        )
        if not expected_key:
            return True

        provided_key = request.httprequest.headers.get('X-AI-API-Key', '')
        return provided_key == expected_key

    def _get_batch_limit(self):
        icp = request.env['ir.config_parameter'].sudo()
        value = icp.get_param('asmi_ai_voice_agent.batch_limit', default='5')
        try:
            return int(value)
        except Exception:
            return 5

    @http.route('/asmi_ai_voice_agent/dispatch/next', type='http', auth='public', methods=['GET'], csrf=False)
    def dispatch_next(self, **kwargs):
        if not self._check_api_key():
            return self._json_response({'status': 'error', 'message': 'Unauthorized'}, status=401)

        worker_name = kwargs.get('worker_name') or request.httprequest.headers.get('X-Worker-Name', 'worker-default')
        response = self._dispatch_batch_internal(limit=1, worker_name=worker_name)

        if response.get('status') == 'ok' and response.get('items'):
            item = response['items'][0]
            return self._json_response({
                'status': 'ok',
                'lead_id': item.get('lead_id'),
                'external_call_id': item.get('external_call_id'),
                'dispatch_status': item.get('dispatch_status'),
                'lock_token': item.get('lock_token'),
                'payload': item.get('payload'),
            })

        return self._json_response({
            'status': 'empty',
            'message': 'No prepared dispatch available',
        })

    @http.route('/asmi_ai_voice_agent/dispatch/batch', type='http', auth='public', methods=['GET'], csrf=False)
    def dispatch_batch(self, **kwargs):
        if not self._check_api_key():
            return self._json_response({'status': 'error', 'message': 'Unauthorized'}, status=401)

        worker_name = kwargs.get('worker_name') or request.httprequest.headers.get('X-Worker-Name', 'worker-default')
        try:
            limit = int(kwargs.get('limit', self._get_batch_limit()))
        except Exception:
            limit = self._get_batch_limit()

        limit = max(1, min(limit, 20))
        response = self._dispatch_batch_internal(limit=limit, worker_name=worker_name)
        return self._json_response(response)

    def _dispatch_batch_internal(self, limit, worker_name):
        lead_model = request.env['crm.lead'].sudo()
        now = fields.Datetime.now()

        leads = lead_model.search([
            ('x_ai_dispatch_status', '=', 'prepared'),
            ('x_ai_call_status', '=', 'calling'),
            ('x_ai_agent_enabled', '=', True),
        ], order='x_ai_last_dispatch_at asc, id asc', limit=limit)

        if not leads:
            return {
                'status': 'empty',
                'message': 'No prepared dispatch available',
                'items': [],
            }

        items = []
        for lead in leads:
            lock_token = str(uuid.uuid4())

            payload = {}
            if lead.x_ai_dispatch_payload:
                try:
                    payload = json.loads(lead.x_ai_dispatch_payload)
                except Exception:
                    payload = {'raw_payload': lead.x_ai_dispatch_payload}

            lead.write({
                'x_ai_dispatch_status': 'sent',
                'x_ai_last_dispatch_at': now,
                'x_ai_dispatch_lock_token': lock_token,
                'x_ai_worker_name': worker_name,
            })

            lead._append_ai_summary_note(
                f"Dispatch payload sent to worker.\n"
                f"Worker: {worker_name}\n"
                f"Lock Token: {lock_token}\n"
                f"Sent At: {now}"
            )

            items.append({
                'lead_id': lead.id,
                'external_call_id': lead.x_external_call_id,
                'dispatch_status': 'sent',
                'lock_token': lock_token,
                'worker_name': worker_name,
                'payload': payload,
            })

        return {
            'status': 'ok',
            'count': len(items),
            'items': items,
        }

    @http.route('/asmi_ai_voice_agent/dispatch/result', type='http', auth='public', methods=['POST'], csrf=False)
    def dispatch_result(self, **kwargs):
        if not self._check_api_key():
            return self._json_response({'status': 'error', 'message': 'Unauthorized'}, status=401)

        payload = request.httprequest.get_json(silent=True) or {}
        _logger.info("AI DISPATCH RESULT RECEIVED: %s", json.dumps(payload))

        lead_id = payload.get('lead_id')
        external_call_id = payload.get('external_call_id')
        call_status = payload.get('call_status')
        call_result = payload.get('call_result')
        recording_url = payload.get('recording_url')
        callback_requested_at = payload.get('callback_requested_at')
        action_name = payload.get('action_name')
        lock_token = payload.get('lock_token')
        worker_name = payload.get('worker_name') or request.httprequest.headers.get('X-Worker-Name', '')
        error_message = payload.get('error_message')

        if not lead_id:
            return self._json_response({'status': 'error', 'message': 'lead_id is required'}, status=400)

        lead = request.env['crm.lead'].sudo().browse(int(lead_id))
        if not lead.exists():
            return self._json_response({'status': 'error', 'message': 'Lead not found'}, status=404)

        if lead.x_ai_dispatch_status == 'acknowledged':
            return self._json_response({
                'status': 'ok',
                'message': 'Result already acknowledged',
                'lead_id': lead.id,
                'idempotent': True,
            })

        if lead.x_ai_dispatch_lock_token and lock_token and lead.x_ai_dispatch_lock_token != lock_token:
            return self._json_response({
                'status': 'error',
                'message': 'Lock token mismatch',
                'lead_id': lead.id,
            }, status=409)

        values = {
            'x_ai_dispatch_status': 'acknowledged',
            'x_ai_last_dispatch_at': fields.Datetime.now(),
            'x_ai_dispatch_ack_at': fields.Datetime.now(),
            'x_ai_last_result_payload': json.dumps(payload, indent=2),
        }

        if worker_name:
            values['x_ai_worker_name'] = worker_name
        if external_call_id:
            values['x_external_call_id'] = external_call_id
        if call_status:
            values['x_ai_call_status'] = call_status
        if call_result:
            values['x_ai_call_result'] = call_result
        if recording_url:
            values['x_ai_call_recording_url'] = recording_url
        if callback_requested_at:
            values['x_callback_requested_at'] = callback_requested_at
        if error_message:
            values['x_ai_last_error'] = error_message

        lead.write(values)

        if action_name == 'send_payment_link':
            lead.action_ai_send_payment_link()
        elif action_name == 'request_callback':
            lead.action_ai_request_callback()
        elif action_name == 'mark_not_interested':
            lead.action_ai_mark_not_interested()
        elif action_name == 'mark_wrong_number':
            lead.action_ai_mark_wrong_number()

        lead._append_ai_summary_note(
            f"AI worker result received.\n"
            f"Worker: {worker_name or ''}\n"
            f"Action: {action_name or ''}\n"
            f"Call Status: {call_status or ''}\n"
            f"Call Result: {call_result or ''}"
        )

        return self._json_response({
            'status': 'ok',
            'message': 'Dispatch result processed',
            'lead_id': lead.id,
        })

    @http.route('/asmi_ai_voice_agent/vapi/webhook', type='jsonrpc', auth='public', methods=['POST'], csrf=False)
    def vapi_webhook(self, **kwargs):
        payload = request.httprequest.get_json(silent=True) or {}
        _logger.info("VAPI WEBHOOK RECEIVED: %s", json.dumps(payload))

        lead_id = payload.get('lead_id')
        call_status = payload.get('call_status')
        call_result = payload.get('call_result')
        recording_url = payload.get('recording_url')
        external_call_id = payload.get('external_call_id')
        callback_requested_at = payload.get('callback_requested_at')
        action_name = payload.get('action_name')

        if lead_id:
            lead = request.env['crm.lead'].sudo().browse(int(lead_id))
            if lead.exists():
                values = {}

                if external_call_id:
                    values['x_external_call_id'] = external_call_id
                if call_status:
                    values['x_ai_call_status'] = call_status
                if call_result:
                    values['x_ai_call_result'] = call_result
                if recording_url:
                    values['x_ai_call_recording_url'] = recording_url
                if callback_requested_at:
                    values['x_callback_requested_at'] = callback_requested_at

                if values:
                    lead.write(values)

                if action_name == 'send_payment_link':
                    lead.action_ai_send_payment_link()
                elif action_name == 'request_callback':
                    lead.action_ai_request_callback()
                elif action_name == 'mark_not_interested':
                    lead.action_ai_mark_not_interested()
                elif action_name == 'mark_wrong_number':
                    lead.action_ai_mark_wrong_number()

        return {'status': 'ok', 'message': 'Vapi webhook processed'}

    def _find_lead_for_exotel(self, call_sid=None, from_number=None, to_number=None):
        lead_model = request.env['crm.lead'].sudo()

        if call_sid:
            lead = lead_model.search([('x_external_call_id', '=', call_sid)], limit=1)
            if lead:
                return lead

        normalized_from = ''.join(ch for ch in (from_number or '') if ch.isdigit())
        if normalized_from:
            variants = {normalized_from}
            if len(normalized_from) == 10:
                variants.add('91' + normalized_from)
            if normalized_from.startswith('91') and len(normalized_from) == 12:
                variants.add(normalized_from[-10:])

            for variant in variants:
                lead = lead_model.search([
                    '|', '|',
                    ('phone', 'ilike', variant),
                    ('mobile', 'ilike', variant),
                    ('partner_phone', 'ilike', variant),
                ], limit=1)
                if lead:
                    return lead

        return lead_model.browse()

    @http.route('/asmi_ai_voice_agent/exotel/status', type='http', auth='public', methods=['GET', 'POST'], csrf=False)
    def exotel_status(self, **kwargs):
        payload = dict(request.params)
        _logger.info("EXOTEL STATUS RECEIVED: %s", json.dumps(payload))

        call_sid = payload.get('CallSid') or payload.get('CallUUID') or payload.get('Sid')
        call_status = payload.get('CallStatus') or payload.get('Status')
        recording_url = payload.get('RecordingUrl') or payload.get('RecordingUrlMp3')
        call_duration = payload.get('CallDuration') or payload.get('DialCallDuration')
        from_number = payload.get('From') or payload.get('Caller')
        to_number = payload.get('To')

        lead = self._find_lead_for_exotel(call_sid=call_sid, from_number=from_number, to_number=to_number)
        if not lead:
            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        values = {}
        if call_sid and not lead.x_external_call_id:
            values['x_external_call_id'] = call_sid

        if call_status in ('completed', 'answered'):
            values['x_ai_call_status'] = 'answered'
        elif call_status in ('busy', 'failed', 'no-answer', 'canceled'):
            values['x_ai_call_status'] = 'failed'

        if recording_url:
            values['x_ai_call_recording_url'] = recording_url

        if values:
            lead.write(values)

        lead._append_ai_summary_note(
            f"Exotel status event received.\n"
            f"Call SID: {call_sid or ''}\n"
            f"Status: {call_status or ''}\n"
            f"Duration: {call_duration or ''}\n"
            f"From: {from_number or ''}\n"
            f"To: {to_number or ''}"
        )

        return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

    @http.route('/asmi_ai_voice_agent/exotel/flow', type='http', auth='public', methods=['GET', 'POST'], csrf=False)
    def exotel_flow(self, **kwargs):
        payload = dict(request.params)
        _logger.info("EXOTEL FLOW RECEIVED: %s", json.dumps(payload))

        call_sid = payload.get('CallSid') or payload.get('CallUUID') or payload.get('Sid')
        from_number = payload.get('From') or payload.get('Caller')
        to_number = payload.get('To')
        digits = (payload.get('Digits') or '').strip()
        speech = (
            payload.get('Speech')
            or payload.get('speech')
            or payload.get('Text')
            or payload.get('text')
            or ''
        ).strip()

        user_input = speech or digits
        lead = self._find_lead_for_exotel(
            call_sid=call_sid,
            from_number=from_number,
            to_number=to_number,
        )

        if not lead:
            _logger.warning(
                "EXOTEL FLOW: No lead found. call_sid=%s from=%s to=%s input=%s",
                call_sid, from_number, to_number, user_input
            )
            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        if call_sid and not lead.x_external_call_id:
            lead.write({'x_external_call_id': call_sid})

        history = []
        if lead.x_ai_last_result_payload:
            try:
                history = json.loads(lead.x_ai_last_result_payload)
                if not isinstance(history, list):
                    history = []
            except Exception:
                history = []

        def normalize_model(text):
            t = (text or '').lower()
            service_words = [
                'service', 'services', 'service based', 'service-based',
                'agency', 'consultant', 'coach', 'broker', 'advisor',
                'real estate consultant', 'marketing agency'
            ]
            product_words = [
                'product', 'products', 'product based', 'product-based',
                'ecommerce', 'retail', 'manufacturing', 'saas', 'software',
                'store', 'd2c'
            ]
            if any(w in t for w in service_words):
                return 'service'
            if any(w in t for w in product_words):
                return 'product'
            return ''

        def detect_special(text):
            t = (text or '').lower()
            if any(w in t for w in ['wrong number', 'galat number', 'not me']):
                return 'wrong_number'
            if any(w in t for w in ['not interested', 'no need', 'nahi chahiye', "don't call"]):
                return 'not_interested'
            if any(w in t for w in ['busy', 'later', 'call later', 'callback', 'baad']):
                return 'callback'
            return ''

        special = detect_special(user_input)

        if special == 'wrong_number':
            lead.write({
                'x_ai_call_status': 'failed',
                'x_ai_call_result': 'wrong_number',
                'x_ai_last_result_payload': json.dumps(history, indent=2),
            })
            lead.action_ai_mark_wrong_number()
            lead._append_ai_summary_note(
                f"Wrong number detected from Exotel flow.\n"
                f"Input: {user_input}\n"
                f"Call SID: {call_sid or ''}"
            )
            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        if special == 'not_interested':
            lead.write({
                'x_ai_call_status': 'answered',
                'x_ai_call_result': 'not_interested',
                'x_ai_last_result_payload': json.dumps(history, indent=2),
            })
            lead.action_ai_mark_not_interested()
            lead._append_ai_summary_note(
                f"Not interested detected from Exotel flow.\n"
                f"Input: {user_input}\n"
                f"Call SID: {call_sid or ''}"
            )
            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        if special == 'callback':
            lead.write({
                'x_ai_call_status': 'answered',
                'x_ai_call_result': 'callback_requested',
                'x_callback_requested_at': fields.Datetime.now(),
                'x_ai_last_result_payload': json.dumps(history, indent=2),
            })
            lead.action_ai_request_callback()
            lead._append_ai_summary_note(
                f"Callback requested from Exotel flow.\n"
                f"Input: {user_input}\n"
                f"Call SID: {call_sid or ''}"
            )
            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        if len(history) == 0:
            niche_value = user_input or ''
            history.append({
                'question': 'niche',
                'answer': niche_value,
            })

            lead.write({
                'x_ai_call_status': 'answered',
                'x_ai_last_result_payload': json.dumps(history, indent=2),
            })

            lead._append_ai_summary_note(
                f"Exotel Q1 captured.\n"
                f"Niche: {niche_value}\n"
                f"Call SID: {call_sid or ''}"
            )

            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        if len(history) >= 1:
            model_value = normalize_model(user_input)
            final_model = model_value or user_input or ''

            history.append({
                'question': 'business_model',
                'answer': final_model,
            })

            lead.write({
                'x_ai_call_status': 'answered',
                'x_ai_call_result': 'qualified',
                'x_ai_last_result_payload': json.dumps(history, indent=2),
            })

            lead._append_ai_summary_note(
                f"Exotel qualification complete.\n"
                f"Niche: {history[0].get('answer', '')}\n"
                f"Business Model: {final_model}\n"
                f"Call SID: {call_sid or ''}"
            )

            return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

        return request.make_response('ok', headers=[('Content-Type', 'text/plain')])

    @http.route('/asmi_ai_voice_agent/razorpay/webhook', type='jsonrpc', auth='public', methods=['POST'], csrf=False)
    def razorpay_webhook(self, **kwargs):
        payload = request.httprequest.get_json(silent=True) or {}
        _logger.info("RAZORPAY WEBHOOK RECEIVED: %s", json.dumps(payload))

        event = payload.get('event')
        payment_link_entity = payload.get('payload', {}).get('payment_link', {}).get('entity', {})
        payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})

        payment_link_id = payment_link_entity.get('id')
        payment_reference = payment_link_entity.get('reference_id')
        payment_link_url = payment_link_entity.get('short_url') or payment_link_entity.get('payment_link')
        payment_id = payment_entity.get('id')

        lead_model = request.env['crm.lead'].sudo()
        matched_lead = False

        if payment_link_id:
            matched_lead = lead_model.search([('x_rzp_payment_link_id', '=', payment_link_id)], limit=1)

        if not matched_lead and payment_reference:
            matched_lead = lead_model.search([('x_rzp_payment_reference', '=', payment_reference)], limit=1)

        if not matched_lead and payment_link_url:
            matched_lead = lead_model.search([('x_rzp_payment_link', '=', payment_link_url)], limit=1)

        if matched_lead and event == 'payment_link.paid':
            values = {
                'x_rzp_payment_status': 'paid',
                'x_ai_call_status': 'paid',
                'x_ai_call_result': 'payment_completed',
                'x_rzp_paid_at': fields.Datetime.now(),
            }

            if payment_id:
                values['x_rzp_payment_id'] = payment_id

            matched_lead.write(values)

        return {'status': 'ok', 'message': 'Razorpay webhook processed'}
