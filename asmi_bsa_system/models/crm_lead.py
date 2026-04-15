# -*- coding: utf-8 -*-
import base64
import json
import logging
import uuid

import requests

from odoo import fields, models

_logger = logging.getLogger(__name__)


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    # Reuse your existing live score/stage fields if already present in DB.
    # If your actual fields are x_lg_score and x_lg_stage, keep using those in code below.
    # These two are added here only if you want them in this module.
    x_score = fields.Integer(string="Business Score")
    x_stage = fields.Char(string="Business Stage")

    # Minimal tracking fields
    x_tracking_token = fields.Char(string="Tracking Token", copy=False, index=True)
    x_pdf_attachment_id = fields.Many2one('ir.attachment', string="Score PDF Attachment")
    x_followup_state = fields.Char(string="Follow-up State")
    x_last_event = fields.Char(string="Last Event")
    x_last_event_at = fields.Datetime(string="Last Event At")
    x_paid_499 = fields.Boolean(string="₹499 Paid", default=False)

    # ----------------------------
    # Utility helpers
    # ----------------------------
    def _get_bsa_score(self):
        self.ensure_one()
        # Change priority here if your live field is x_lg_score
        return self.x_score or getattr(self, 'x_lg_score', 0)

    def _get_bsa_stage(self):
        self.ensure_one()
        # Change priority here if your live field is x_lg_stage
        return self.x_stage or getattr(self, 'x_lg_stage', '')

    def _normalize_phone_for_gallabox(self, phone):
        """Return phone in 91XXXXXXXXXX format."""
        if not phone:
            return False

        cleaned = ''.join(ch for ch in phone if ch.isdigit())

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

    def log_event(self, event_type, source=None, meta=None):
        """Minimal state tracking on lead itself."""
        self.ensure_one()

        self.write({
            'x_last_event': event_type,
            'x_last_event_at': fields.Datetime.now(),
        })

        followup_state = self.x_followup_state
        paid_499 = self.x_paid_499

        if event_type == 'pdf_generated':
            followup_state = 'pdf_generated'
        elif event_type == 'wa_sent':
            followup_state = 'wa_sent'
        elif event_type == 'pdf_clicked':
            followup_state = 'engaged'
        elif event_type == 'payment_clicked':
            followup_state = 'payment_clicked'
        elif event_type == 'payment_success':
            followup_state = 'paid'
            paid_499 = True
        elif event_type == 'wa_replied':
            followup_state = 'active'

        self.write({
            'x_followup_state': followup_state,
            'x_paid_499': paid_499,
        })

        _logger.info(
            "BSA event | lead_id=%s | event=%s | source=%s | meta=%s",
            self.id, event_type, source or '', meta or ''
        )

    # ----------------------------
    # Main combined flow
    # ----------------------------
    def run_bsa_pdf_and_whatsapp(self):
        """
        Final combined flow:
        1. Validate lead data
        2. Ensure token
        3. Generate PDF from QWeb report
        4. Save attachment
        5. Build tracked PDF link
        6. Send Gallabox template with document header
        """
        self.ensure_one()

        score = self._get_bsa_score()
        stage = self._get_bsa_stage()
        phone = self._normalize_phone_for_gallabox(self.phone)

        if not phone:
            _logger.warning("Lead %s skipped: invalid or missing phone", self.id)
            return False

        if not score:
            _logger.warning("Lead %s skipped: missing score", self.id)
            return False

        if not stage:
            _logger.warning("Lead %s skipped: missing stage", self.id)
            return False

        # Ensure token
        if not self.x_tracking_token:
            self.x_tracking_token = str(uuid.uuid4())

        # Render PDF
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

        # Replace old attachment if exists
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

        # Build tracked PDF link
        base_url = self._get_base_url()
        if not base_url:
            _logger.error("web.base.url not configured")
            return False

        tracked_pdf_url = f"{base_url}/r/bsa/pdf/{self.x_tracking_token}"

        # Gallabox config from system parameters
        gallabox_url = "https://server.gallabox.com/devapi/messages/whatsapp"
        icp = self.env['ir.config_parameter'].sudo()

        channel_id = icp.get_param('asmi.gallabox_channel_id')
        api_key = icp.get_param('asmi.gallabox_api_key')
        template_name = icp.get_param('asmi.gallabox_score_template', 'wa_score')
        language_code = icp.get_param('asmi.gallabox_language_code', 'en')

        if not channel_id or not api_key:
            _logger.error("Missing Gallabox config: asmi.gallabox_channel_id / asmi.gallabox_api_key")
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
                # Gallabox template header must be DOCUMENT
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

        _logger.info("Gallabox response | lead_id=%s | status=%s | body=%s",
                     self.id, response.status_code, response.text)

        if 200 <= response.status_code < 300:
            self.log_event('wa_sent', source='gallabox', meta=response.text)
            return True

        _logger.error("Gallabox send failed for lead %s: %s", self.id, response.text)
        return False

    # ----------------------------
    # Optional helper for payment success webhook use later
    # ----------------------------
    def mark_bsa_payment_success(self, payment_id=None, payload=None):
        self.ensure_one()
        meta = {
            "payment_id": payment_id or "",
            "payload": payload or {},
        }
        self.log_event('payment_success', source='razorpay', meta=json.dumps(meta, default=str))
        return True
