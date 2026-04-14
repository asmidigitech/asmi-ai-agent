# -*- coding: utf-8 -*-
import json
import logging
import re
import time

import requests

from odoo import api, fields, models

_logger = logging.getLogger(__name__)


class CrmLead(models.Model):
    _inherit = "crm.lead"

    x_whatsapp_phone_norm = fields.Char(
        string="WhatsApp Phone Normalized",
        compute="_compute_whatsapp_phone_norm",
        store=True,
        index=True,
    )

    @api.depends("phone", "phone_sanitized", "mobile")
    def _compute_whatsapp_phone_norm(self):
        for lead in self:
            source = lead.phone_sanitized or lead.phone or lead.mobile or ""
            lead.x_whatsapp_phone_norm = self._normalize_indian_phone(source)

    @api.model
    def _normalize_indian_phone(self, value):
        if not value:
            return False

        digits = re.sub(r"\D", "", str(value or ""))

        if not digits:
            return False

        if len(digits) == 12 and digits.startswith("91"):
            candidate = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            candidate = digits[1:]
        elif len(digits) == 10:
            candidate = digits
        elif len(digits) > 10:
            candidate = digits[-10:]
        else:
            return False

        if len(candidate) == 10 and candidate[0] in {"6", "7", "8", "9"}:
            return f"91{candidate}"

        return False

    def _asmi_get_param(self, key, default=False):
        return self.env["ir.config_parameter"].sudo().get_param(key, default=default)

    def _asmi_gallabox_headers(self):
        api_key = self._asmi_get_param("asmi_whatsapp_engine.gallabox_api_key")
        api_secret = self._asmi_get_param("asmi_whatsapp_engine.gallabox_api_secret")

        if not api_key or not api_secret:
            raise ValueError("Gallabox API credentials are not configured in Settings.")

        return {
            "apikey": api_key,
            "apiSecret": api_secret,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _asmi_gallabox_url(self):
        base_url = self._asmi_get_param(
            "asmi_whatsapp_engine.gallabox_base_url",
            default="https://server.gallabox.com",
        )
        return f"{base_url.rstrip('/')}/devapi/messages/whatsapp"

    def _asmi_channel_id(self):
        channel_id = self._asmi_get_param("asmi_whatsapp_engine.gallabox_channel_id")
        if not channel_id:
            raise ValueError("Gallabox Channel ID is not configured in Settings.")
        return channel_id

    def _asmi_safe_name(self):
        self.ensure_one()
        value = self.contact_name or self.name or "Founder"
        return str(value).replace('"', "").strip()

    def _asmi_report_id(self):
        self.ensure_one()
        return f"BSA-2026-{self.id}"

    def _asmi_score_string(self):
        self.ensure_one()
        return str(int(self.x_lg_score or 0))

    def _asmi_route(self):
        self.ensure_one()
        route = (self.x_make_route or "").strip().lower()
        if route in ("hot", "warm", "cold"):
            return route

        heat = (self.x_lg_heat or "").strip().lower()
        if heat in ("hot", "warm", "cold"):
            return heat

        return "warm"

    def _asmi_has_whatsapp_consent(self):
        self.ensure_one()
        return bool(self.x_whatsapp_auto) or (self.x_open_499_call == "yes_send_link")

    def _asmi_is_whatsapp_ready(self):
        self.ensure_one()
        return bool(
            self._asmi_has_whatsapp_consent()
            and self.x_whatsapp_phone_norm
            and not self.x_make_lock
        )

    def _asmi_template_by_code(self, code):
        template = self.env["asmi.whatsapp.template"].sudo().search(
            [("code", "=", code), ("active", "=", True)],
            limit=1,
        )
        if not template:
            raise ValueError(f"WhatsApp template config not found for code: {code}")
        return template

    def _asmi_build_template_payload(self, template_code):
        self.ensure_one()

        safe_name = self._asmi_safe_name()
        clean_phone = self.x_whatsapp_phone_norm
        if not clean_phone:
            raise ValueError("Normalized WhatsApp phone is missing.")

        template = self._asmi_template_by_code(template_code)

        if template_code == "wa1":
            body_values = {
                "name": safe_name,
                "score": self._asmi_score_string(),
                "report_id": self._asmi_report_id(),
            }
        elif template_code == "wa499":
            body_values = {
                "name": safe_name,
                "payment_link": "https://rzp.io/rzp/s5izYcy",
            }
        else:
            raise ValueError(f"Unsupported template code: {template_code}")

        payload = {
            "channelId": self._asmi_channel_id(),
            "channelType": "whatsapp",
            "recipient": {
                "name": safe_name,
                "phone": clean_phone,
                "rawPhone": clean_phone,
            },
            "whatsapp": {
                "type": "template",
                "template": {
                    "templateName": template.gallabox_template_name,
                    "bodyValues": body_values,
                },
            },
        }
        return template, payload

    def _asmi_log_whatsapp(self, template_code, template, payload, response=None, error=None):
        self.ensure_one()

        values = {
            "lead_id": self.id,
            "template_id": template.id if template else False,
            "template_code": template_code,
            "request_payload": json.dumps(payload, ensure_ascii=False, indent=2),
            "state": "pending",
        }

        if response is not None:
            values.update({
                "response_status": response.status_code,
                "response_body": response.text,
                "state": "success" if 200 <= response.status_code < 300 else "failed",
            })

        if error:
            values.update({
                "error_message": str(error),
                "state": "failed",
            })

        self.env["asmi.whatsapp.log"].sudo().create(values)

    def action_asmi_send_whatsapp_template(self, template_code):
        for lead in self:
            template = None
            payload = {}
            try:
                template, payload = lead._asmi_build_template_payload(template_code)
                response = requests.post(
                    lead._asmi_gallabox_url(),
                    headers=lead._asmi_gallabox_headers(),
                    json=payload,
                    timeout=20,
                )
                lead._asmi_log_whatsapp(template_code, template, payload, response=response)

                if not (200 <= response.status_code < 300):
                    raise ValueError(
                        f"Gallabox send failed for {template_code}. "
                        f"Status={response.status_code} Body={response.text}"
                    )

                if template_code == "wa1":
                    lead.sudo().write({"x_wa1_sent": True})
                elif template_code == "wa499":
                    lead.sudo().write({"x_wa499_sent": True})

            except Exception as e:
                lead._asmi_log_whatsapp(template_code, template, payload, error=e)
                raise

        return True

    def action_asmi_run_whatsapp_flow(self):
        delay_seconds = int(
            self._asmi_get_param("asmi_whatsapp_engine.wa_delay_seconds", default="20") or 20
        )

        for lead in self:
            if not lead._asmi_is_whatsapp_ready():
                continue

            route = lead._asmi_route()

            lead.sudo().write({"x_make_lock": True})

            try:
                lead.action_asmi_send_whatsapp_template("wa1")

                if route in ("hot", "warm"):
                    time.sleep(delay_seconds)
                    lead.action_asmi_send_whatsapp_template("wa499")

                lead.sudo().write({
                    "x_make_sent": True,
                    "x_make_sent_at": fields.Datetime.now(),
                    "x_whatsapp_auto": False,
                    "x_make_lock": False,
                    "x_outreach_status": "whatsapp_sent",
                })

            except Exception:
                lead.sudo().write({"x_make_lock": False})
                raise

        return True

    @api.model_create_multi
    def create(self, vals_list):
        leads = super().create(vals_list)
        leads._asmi_try_auto_whatsapp()
        return leads

    def write(self, vals):
        res = super().write(vals)
        trigger_fields = {
            "phone",
            "phone_sanitized",
            "mobile",
            "x_whatsapp_auto",
            "x_open_499_call",
            "x_make_route",
            "x_lg_heat",
            "x_lg_score",
            "x_niche",
            "x_decision_maker",
        }
        if trigger_fields.intersection(vals.keys()):
            self._asmi_try_auto_whatsapp()
        return res

    def _asmi_try_auto_whatsapp(self):
        for lead in self:
            try:
                if lead._asmi_is_whatsapp_ready() and not lead.x_make_sent:
                    lead.action_asmi_run_whatsapp_flow()
            except Exception:
                _logger.exception("WhatsApp flow failed for CRM Lead %s", lead.id)
        return True
