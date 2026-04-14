# -*- coding: utf-8 -*-
from odoo import fields, models


class AsmiWhatsappTemplate(models.Model):
    _name = "asmi.whatsapp.template"
    _description = "Asmi WhatsApp Template"
    _order = "sequence, id"

    name = fields.Char(required=True)
    code = fields.Char(required=True, index=True)
    active = fields.Boolean(default=True)
    sequence = fields.Integer(default=10)

    gallabox_template_name = fields.Char(required=True)
    route_scope = fields.Selection(
        [
            ("all", "All"),
            ("hot_warm", "Hot + Warm"),
            ("cold_only", "Cold Only"),
        ],
        default="all",
        required=True,
    )

    description = fields.Text()
