# -*- coding: utf-8 -*-
from odoo import fields, models


class AsmiWhatsappLog(models.Model):
    _name = "asmi.whatsapp.log"
    _description = "Asmi WhatsApp Log"
    _order = "create_date desc"

    lead_id = fields.Many2one("crm.lead", required=True, ondelete="cascade")
    template_id = fields.Many2one("asmi.whatsapp.template", ondelete="set null")
    template_code = fields.Char(index=True)
    request_payload = fields.Text()
    response_body = fields.Text()
    response_status = fields.Integer()
    state = fields.Selection(
        [
            ("pending", "Pending"),
            ("success", "Success"),
            ("failed", "Failed"),
        ],
        default="pending",
        required=True,
        index=True,
    )
    error_message = fields.Text()
