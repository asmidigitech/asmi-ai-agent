from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    asmi_gallabox_enabled = fields.Boolean(
        string='Enable Gallabox Bridge',
        config_parameter='asmi_gallabox_bridge.enabled',
        default=True,
    )
    asmi_gallabox_api_key = fields.Char(
        string='Gallabox API Key',
        config_parameter='asmi_gallabox_bridge.api_key',
    )
    asmi_gallabox_channel_id = fields.Char(
        string='Gallabox Channel ID',
        config_parameter='asmi_gallabox_bridge.channel_id',
    )
    asmi_gallabox_template_name = fields.Char(
        string='Gallabox Template Name',
        config_parameter='asmi_gallabox_bridge.template_name',
    )
    asmi_payment_link_url = fields.Char(
        string='Payment Link URL',
        config_parameter='asmi_gallabox_bridge.payment_link_url',
    )
    asmi_webhook_secret = fields.Char(
        string='Inbound Webhook Secret',
        config_parameter='asmi_gallabox_bridge.webhook_secret',
        help='Optional shared secret. Send the same value from Odoo Online in header X-Asmi-Webhook-Secret.',
    )
    asmi_gallabox_api_url = fields.Char(
        string='Gallabox API URL',
        config_parameter='asmi_gallabox_bridge.api_url',
        default='https://server.gallabox.com/devapi/messages/whatsapp',
    )
    asmi_odoo_online_url = fields.Char(
        string='Odoo Online URL',
        config_parameter='asmi_gallabox_bridge.odoo_online_url',
        help='Example: https://yourdb.odoo.com',
    )
    asmi_odoo_online_db = fields.Char(
        string='Odoo Online Database',
        config_parameter='asmi_gallabox_bridge.odoo_online_db',
    )
    asmi_odoo_online_username = fields.Char(
        string='Odoo Online Username',
        config_parameter='asmi_gallabox_bridge.odoo_online_username',
    )
    asmi_odoo_online_api_key = fields.Char(
        string='Odoo Online API Key / Password',
        config_parameter='asmi_gallabox_bridge.odoo_online_api_key',
        help='Needed only if you want Odoo.sh to write dispatch status back to Odoo Online.',
    )
