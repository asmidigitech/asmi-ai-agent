# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request


class AsmiTrackingController(http.Controller):

    @http.route('/r/bsa/pdf/<string:token>', type='http', auth='public', website=True)
    def track_pdf(self, token, **kwargs):
        lead = request.env['crm.lead'].sudo().search(
            [('x_tracking_token', '=', token)],
            limit=1
        )

        if not lead or not lead.x_pdf_attachment_id:
            return request.not_found()

        # Log click if helper exists
        if hasattr(lead, 'log_event'):
            lead.log_event('pdf_clicked', source='pdf')

        # Redirect to actual PDF
        pdf_url = f"/web/content/{lead.x_pdf_attachment_id.id}?download=true"
        return request.redirect(pdf_url)
