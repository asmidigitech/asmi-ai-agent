# -*- coding: utf-8 -*-
from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    asmi_gallabox_api_key = fields.Char(
        string="Gallabox API Key",
        config_parameter="asmi_whatsapp_engine.gallabox_api_key",
    )
    asmi_gallabox_api_secret = fields.Char(
        string="Gallabox API Secret",
        config_parameter="asmi_whatsapp_engine.gallabox_api_secret",
    )
    asmi_gallabox_channel_id = fields.Char(
        string="Gallabox Channel ID",
        config_parameter="asmi_whatsapp_engine.gallabox_channel_id",
    )
    asmi_gallabox_base_url = fields.Char(
        string="Gallabox Base URL",
        default="https://server.gallabox.com",
        config_parameter="asmi_whatsapp_engine.gallabox_base_url",
    )
    asmi_wa_delay_seconds = fields.Integer(
        string="WA1 to WA499 Delay (sec)",
        default=20,
        config_parameter="asmi_whatsapp_engine.wa_delay_seconds",
    )
