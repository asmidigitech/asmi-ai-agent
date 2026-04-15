# -*- coding: utf-8 -*-
import base64
import logging
import uuid
import requests

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    # Minimal fields assumed to exist
    x_score = fields.Integer(string="Business Score")
    x_stage = fields.Char(string="Business Stage")
    x_tracking_token = fields.Char(string="Tracking Token", copy=False, index=True)
    x_pdf_attachment_id = fields.Many2one('ir.attachment', string="Score PDF")
    x_followup_state = fields.Char(string="Followup State")
    x_last_event = fields.Char(string="Last Event")
    x_last_event_at = fields.Datetime(string="Last Event At")
    x_paid_499 = fields.Boolean(string="₹499 Paid")

    def log_event(self, event_type, source=None, meta=None):
        """Lightweight event logger. Safe even if asmi.event.log is not installed yet."""
        self.ensure_one()

        # Keep lead summary updated
        self.x_last_event = event_type
        self.x_last_event_at = fields.Datetime.now()

        if event_type == 'payment_success':
            self.x_paid_499 = True
            self.x_followup_state = 'paid'
        elif event_type == 'pdf_generated':
            self.x_followup_state = 'pdf_generated'
        elif event_type == 'wa_sent':
            self.x_followup_state = 'wa_sent'
        elif event_type == 'pdf_clicked':
            self.x_followup_state = 'engaged'
        elif event_type == 'wa_replied':
            self.x_followup_state = 'active'

        # Optional event table
        if 'asmi.event.log' in self.env:
            self.env['asmi.event.log'].create({
                'lead_id': self.id,
                'event_type': event_type,
                'source': source or '',
                'meta': meta or '',
            })

    def _normalize_phone_for_gallabox(self, phone):
        """Convert phone into 91XXXXXXXXXX format."""
        if not phone:
            return False

        cleaned = ''.join(ch for ch in phone if ch.isdigit())

        if cleaned.startswith('91') and len(cleaned) == 12:
            return cleaned
        if cleaned.startswith('0') and len(cleaned) == 11:
            return '91' + cleaned[-10:]
        if len(cleaned) == 10:
            return '91' + cleaned

        return cleaned if len(cleaned) >= 10 else False

    def run_bsa_pdf_and_whatsapp(self):
        """
        Final combined method:
        1) Validate lead data
        2) Generate QWeb PDF
        3) Store as ir.attachment
        4) Save attachment on lead
        5) Build tracked PDF link
        6) Send Gallabox template with document header
        """
        self.ensure_one()

        # ----------------------------
        # A. Validate required data
        # ----------------------------
        phone = self._normalize_phone_for_gallabox(self.phone)
        if not phone:
            _logger.warning("Lead %s has no valid phone. Skipping WhatsApp.", self.id)
            return False

        if not self.x_score:
            _logger.warning("Lead %s has no score yet. Skipping PDF/WhatsApp.", self.id)
            return False

        if not self.x_stage:
            _logger.warning("Lead %s has no stage yet. Skipping PDF/WhatsApp.", self.id)
            return False

        # ----------------------------
        # B. Ensure tracking token
        # ----------------------------
        if not self.x_tracking_token:
            self.x_tracking_token = str(uuid.uuid4())

        # ----------------------------
        # C. Generate PDF via QWeb report
        # ----------------------------
        try:
            report = self.env.ref('asmi_ai_voice_agent.action_business_score_report')
        except ValueError:
            _logger.exception("Report action not found: asmi_ai_voice_agent.action_business_score_report")
            return False

        try:
            pdf_content, _ = report._render_qweb_pdf(self.id)
        except Exception:
            _logger.exception("Failed to render QWeb PDF for lead %s", self.id)
            return False

        # ----------------------------
        # D. Create / replace attachment
        # ----------------------------
        filename = f"Business_Report_{(self.partner_name or 'Lead').replace('/', '-')}_{self.id}.pdf"

        # Optional: remove old PDF attachment to avoid duplicates
        if self.x_pdf_attachment_id:
            try:
                self.x_pdf_attachment_id.unlink()
            except Exception:
                _logger.warning("Could not delete old PDF attachment for lead %s", self.id)

        try:
            attachment = self.env['ir.attachment'].create({
                'name': filename,
                'type': 'binary',
                'datas': base64.b64encode(pdf_content),
                'res_model': 'crm.lead',
                'res_id': self.id,
                'mimetype': 'application/pdf',
                'public': True,  # Important if external access is needed
            })
        except Exception:
            _logger.exception("Failed to create PDF attachment for lead %s", self.id)
            return False

        self.x_pdf_attachment_id = attachment.id
        self.log_event('pdf_generated', source='odoo', meta=filename)

        # ----------------------------
        # E. Build tracked PDF link
        # ----------------------------
        base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url', '').rstrip('/')
        tracked_pdf_url = f"{base_url}/r/bsa/pdf/{self.x_tracking_token}"

        # ----------------------------
        # F. Send Gallabox template
        # ----------------------------
        gallabox_url = "https://server.gallabox.com/devapi/messages/whatsapp"
        channel_id = self.env['ir.config_parameter'].sudo().get_param('asmi.gallabox_channel_id')
        api_key = self.env['ir.config_parameter'].sudo().get_param('asmi.gallabox_api_key')
        template_name = self.env['ir.config_parameter'].sudo().get_param('asmi.gallabox_score_template', 'wa_score')

        if not channel_id or not api_key:
            _logger.error("Gallabox config missing. Set asmi.gallabox_channel_id and asmi.gallabox_api_key")
            return False

        payload = {
            "channelId": channel_id,
            "recipient": phone,
            "type": "template",
            "template": {
                "name": template_name,
                "languageCode": "en",
                # Body placeholders in Gallabox template
                "bodyValues": [
                    self.partner_name or "Founder",
                    str(self.x_score),
                    self.x_stage,
                ],
                # Header type in Gallabox template must be DOCUMENT
                "headerValues": [
                    tracked_pdf_url
                ]
            }
        }

        headers = {
            "apiKey": api_key,
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(
                gallabox_url,
                json=payload,
                headers=headers,
                timeout=20
            )
        except requests.RequestException:
            _logger.exception("Gallabox request failed for lead %s", self.id)
            return False

        _logger.info("Gallabox response for lead %s: %s", self.id, response.text)

        if 200 <= response.status_code < 300:
            self.log_event('wa_sent', source='gallabox', meta=response.text)
            return True

        _logger.error("Gallabox send failed for lead %s: %s", self.id, response.text)
        return False
