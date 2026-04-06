import json

from odoo import api, fields, models


class AsmiGallaboxLog(models.Model):
    _name = 'asmi.gallabox.log'
    _description = 'Gallabox Dispatch Log'
    _order = 'create_date desc'

    name = fields.Char(required=True, default='Gallabox Dispatch')
    webhook_source = fields.Char(default='odoo_online')
    source_ref = fields.Char(index=True)
    lead_name = fields.Char()
    phone = fields.Char(index=True)
    template_name = fields.Char()
    payment_link = fields.Char()
    status = fields.Selection([
        ('received', 'Received'),
        ('duplicate', 'Duplicate'),
        ('invalid', 'Invalid'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
    ], default='received', index=True)
    message = fields.Char()
    request_payload = fields.Text()
    response_payload = fields.Text()
    gallabox_message_id = fields.Char()

    @api.model
    def create_log(self, payload, **vals):
        payload_txt = json.dumps(payload, ensure_ascii=False, default=str)
        values = {
            'request_payload': payload_txt,
            **vals,
        }
        return self.create(values)
