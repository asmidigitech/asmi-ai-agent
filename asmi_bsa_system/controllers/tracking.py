# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request


class AsmiBsaTrackingController(http.Controller):

    @http.route('/r/bsa/pdf/<string:token>', type='http', auth='public', website=True, csrf=False)
    def track_pdf(self, token, **kwargs):
        lead = request.env['crm.lead'].sudo().search(
            [('x_tracking_token', '=', token)],
            limit=1
        )

        if not lead or not lead.x_pdf_attachment_id:
            return request.not_found()

        # Track click
        if hasattr(lead, 'log_event'):
            lead.log_event('pdf_clicked', source='pdf')

        # Redirect to actual PDF
        pdf_url = '/web/content/%s?download=true' % lead.x_pdf_attachment_id.id
        return request.redirect(pdf_url)

    @http.route('/r/bsa/pay/<string:token>', type='http', auth='public', website=True, csrf=False)
    def track_payment(self, token, **kwargs):
        lead = request.env['crm.lead'].sudo().search(
            [('x_tracking_token', '=', token)],
            limit=1
        )

        if not lead:
            return request.not_found()

        if hasattr(lead, 'log_event'):
            lead.log_event('payment_clicked', source='payment')

        # Put your real Razorpay / payment URL field here later
        payment_link = request.env['ir.config_parameter'].sudo().get_param('asmi.bsa_payment_link')

        if not payment_link:
            return "Payment link not configured."

        return request.redirect(payment_link)
