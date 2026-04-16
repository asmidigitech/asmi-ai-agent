# -*- coding: utf-8 -*-
import base64
import json
import logging
import uuid

import requests

from odoo import fields, models

_logger = logging.getLogger(__name__)

x_bsa_test_field = fields.Char(string="BSA Test Field")

class CrmLead(models.Model):
    _inherit = 'crm.lead'

    # New minimal fields only for the new BSA tracking/PDF flow
//    x_tracking_token = fields.Char(string="Tracking Token", copy=False, index=True)
 x_tracking_token = fields.Char(string="Tracking Token")
    x_bsa_test_field = fields.Char(string="BSA Test Field")

    
    x_pdf_attachment_id = fields.Many2one('ir.attachment', string="Score PDF Attachment")
    x_followup_state = fields.Char(string="Follow-up State")
    x_last_event = fields.Char(string="Last Event")
    x_last_event_at = fields.Datetime(string="Last Event At")
    x_paid_499 = fields.Boolean(string="₹499 Paid", default=False)

    def _get_bsa_score(self):
        self.ensure_one()
        return self.x_lg_score or 0

    def _get_bsa_stage(self):
        self.ensure_one()
        return self.x_lg_stage or ''

    def _normalize_phone_for_gallabox(self, phone):
        if not phone:
            return False

        cleaned = ''.join(ch for ch in str(phone) if ch.isdigit())

        if len(cleaned) == 10:
            return '91' + cleaned
        if cleaned.startswith('0') and len(cleaned) == 11:
            return '91' + cleaned[-10:]
        if cleaned.startswith('91') and len(cleaned) == 12:
            return cleaned

        return False

    def _get_base_url(self):
        return self.env['ir.config_parameter'].sudo().get_param('web.base.url', '').rstrip('/')

    def _get_display_name_for_report(self):
        self.ensure_one()
        return self.partner_name or self.contact_name or self.name or f"Lead {self.id}"

    def _get_whatsapp_phone(self):
        self.ensure_one()

        # Prefer your dedicated assessment phone if available, else fallback to phone
        phone = False
        if hasattr(self, 'x_studio_whatsapp_number') and self.x_studio_whatsapp_number:
            phone = str(self.x_studio_whatsapp_number)
        elif self.phone:
            phone = str(self.phone)

        return self._normalize_phone_for_gallabox(phone)

    def log_event(self, event_type, source=None, meta=None):
        self.ensure_one()

        vals = {
            'x_last_event': event_type,
            'x_last_event_at': fields.Datetime.now(),
        }

        if event_type == 'pdf_generated':
            vals['x_followup_state'] = 'pdf_generated'
        elif event_type == 'wa_sent':
            vals['x_followup_state'] = 'wa_sent'
        elif event_type == 'pdf_clicked':
            vals['x_followup_state'] = 'engaged'
        elif event_type == 'payment_clicked':
            vals['x_followup_state'] = 'payment_clicked'
        elif event_type == 'payment_success':
            vals['x_followup_state'] = 'paid'
            vals['x_paid_499'] = True
        elif event_type == 'wa_replied':
            vals['x_followup_state'] = 'active'

        self.write(vals)

        _logger.info(
            "BSA event | lead_id=%s | event=%s | source=%s | meta=%s",
            self.id, event_type, source or '', meta or ''
        )

    def run_bsa_pdf_and_whatsapp(self):
        """
        New flow only.
        Does NOT touch existing wa1 / wa499 logic unless you explicitly call this method.
        """
        self.ensure_one()
        self.x_bsa_test_field = "METHOD WORKING"
        return True
        score = self._get_bsa_score()
        stage = self._get_bsa_stage()
        phone = self._get_whatsapp_phone()

        if not phone:
            _logger.warning("Lead %s skipped: invalid/missing WhatsApp phone", self.id)
            return False

        if not score:
            _logger.warning("Lead %s skipped: missing x_lg_score", self.id)
            return False

        if not stage:
            _logger.warning("Lead %s skipped: missing x_lg_stage", self.id)
            return False

        if not self.x_tracking_token:
            self.x_tracking_token = str(uuid.uuid4())

        try:
            report = self.env.ref('asmi_bsa_system.action_business_score_report')
        except ValueError:
            _logger.exception("Report action not found: asmi_bsa_system.action_business_score_report")
            return False

        try:
            pdf_content, _ = report._render_qweb_pdf(self.id)
        except Exception:
            _logger.exception("Failed to render PDF for lead %s", self.id)
            return False

        if self.x_pdf_attachment_id:
            try:
                self.x_pdf_attachment_id.unlink()
            except Exception:
                _logger.warning("Could not delete old PDF attachment for lead %s", self.id)

        safe_name = self._get_display_name_for_report().replace('/', '-')
        filename = f"Business_Report_{safe_name}_{self.id}.pdf"

        try:
            attachment = self.env['ir.attachment'].create({
                'name': filename,
                'type': 'binary',
                'datas': base64.b64encode(pdf_content),
                'res_model': 'crm.lead',
                'res_id': self.id,
                'mimetype': 'application/pdf',
                'public': True,
            })
        except Exception:
            _logger.exception("Failed to create PDF attachment for lead %s", self.id)
            return False

        self.x_pdf_attachment_id = attachment.id
        self.log_event('pdf_generated', source='odoo', meta=filename)

        base_url = self._get_base_url()
        if not base_url:
            _logger.error("web.base.url not configured")
            return False

        tracked_pdf_url = f"{base_url}/r/bsa/pdf/{self.x_tracking_token}"

        gallabox_url = "https://server.gallabox.com/devapi/messages/whatsapp"
        icp = self.env['ir.config_parameter'].sudo()

        channel_id = icp.get_param('asmi.gallabox_channel_id')
        api_key = icp.get_param('asmi.gallabox_api_key')
        template_name = icp.get_param('asmi.gallabox_score_template', 'wa_score')
        language_code = icp.get_param('asmi.gallabox_language_code', 'en')

        if not channel_id or not api_key:
            _logger.error("Missing Gallabox config")
            return False

        payload = {
            "channelId": channel_id,
            "recipient": phone,
            "type": "template",
            "template": {
                "name": template_name,
                "languageCode": language_code,
                "bodyValues": [
                    self._get_display_name_for_report(),
                    str(score),
                    stage,
                ],
                "headerValues": [
                    tracked_pdf_url
                ]
            }
        }

        headers = {
            "apiKey": api_key,
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                gallabox_url,
                json=payload,
                headers=headers,
                timeout=20,
            )
        except requests.RequestException:
            _logger.exception("Gallabox request failed for lead %s", self.id)
            return False

        _logger.info(
            "Gallabox response | lead_id=%s | status=%s | body=%s",
            self.id, response.status_code, response.text
        )

        if 200 <= response.status_code < 300:
            self.log_event('wa_sent', source='gallabox', meta=response.text)
            return True

        _logger.error("Gallabox send failed for lead %s: %s", self.id, response.text)
        return False

    def mark_bsa_payment_success(self, payment_id=None, payload=None):
        self.ensure_one()
        meta = {
            "payment_id": payment_id or "",
            "payload": payload or {},
        }
        self.log_event('payment_success', source='razorpay', meta=json.dumps(meta, default=str))
        return True
