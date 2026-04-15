from odoo import models, api
import base64

class CrmLead(models.Model):
    _inherit = 'crm.lead'

    def generate_score_pdf(self):
        report = self.env.ref('asmi_ai_voice_agent.action_business_score_report')

        pdf_content, _ = report._render_qweb_pdf(self.id)

        attachment = self.env['ir.attachment'].create({
            'name': f"Business_Report_{self.partner_name}.pdf",
            'type': 'binary',
            'datas': base64.b64encode(pdf_content),
            'res_model': 'crm.lead',
            'res_id': self.id,
            'mimetype': 'application/pdf'
        })

        return attachment
