import json
import re
from datetime import timedelta

import pytz

from odoo import api, fields, models
from odoo.exceptions import UserError


class CrmLead(models.Model):
    _inherit = 'crm.lead'

    x_ai_agent_enabled = fields.Boolean(string="AI Agent Enabled", default=False)

    x_ai_call_status = fields.Selection([
        ('pending', 'Pending'),
        ('queued', 'Queued'),
        ('calling', 'Calling'),
        ('answered', 'Answered'),
        ('no_answer', 'No Answer'),
        ('busy', 'Busy'),
        ('callback_requested', 'Callback Requested'),
        ('payment_sent', 'Payment Sent'),
        ('paid', 'Paid'),
        ('booked', 'Booked'),
        ('failed', 'Failed'),
        ('disqualified', 'Disqualified'),
    ], string="AI Call Status", default='pending')

    x_ai_call_attempts = fields.Integer(string="AI Call Attempts", default=0)
    x_ai_call_due_at = fields.Datetime(string="AI Call Due At")
    x_ai_next_retry_at = fields.Datetime(string="AI Next Retry At")

    x_rzp_payment_link = fields.Char(string="Razorpay Payment Link")
    x_rzp_payment_link_id = fields.Char(string="Razorpay Payment Link ID")
    x_rzp_payment_reference = fields.Char(string="Razorpay Payment Reference")
    x_rzp_payment_id = fields.Char(string="Razorpay Payment ID")
    x_rzp_paid_at = fields.Datetime(string="Razorpay Paid At")

    x_rzp_payment_status = fields.Selection([
        ('not_created', 'Not Created'),
        ('created', 'Created'),
        ('sent', 'Sent'),
        ('paid', 'Paid'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
        ('failed', 'Failed'),
    ], string="Razorpay Payment Status", default='not_created')

    x_ai_call_summary = fields.Text(string="AI Call Summary")
    x_strategy_call_booked = fields.Boolean(string="Strategy Call Booked", default=False)

    x_lead_temperature = fields.Selection([
        ('hot', 'Hot'),
        ('warm', 'Warm'),
        ('cold', 'Cold'),
    ], string="Lead Temperature")

    x_ai_call_result = fields.Selection([
        ('interested', 'Interested'),
        ('payment_link_sent', 'Payment Link Sent'),
        ('payment_completed', 'Payment Completed'),
        ('callback_later', 'Call Back Later'),
        ('not_interested', 'Not Interested'),
        ('wrong_number', 'Wrong Number'),
    ], string="AI Call Result")

    x_ai_call_recording_url = fields.Char(string="AI Call Recording URL")

    x_499_interested = fields.Boolean(string="₹499 Interested", default=False)
    x_business_niche = fields.Char(string="Business / Niche")
    x_business_model = fields.Selection([
        ('service', 'Service'),
        ('product', 'Product'),
    ], string="Business Model")
    x_ai_ready = fields.Boolean(string="AI Ready", default=False)

    x_source_crm_lead_id = fields.Char(string="Source CRM Lead ID")
    x_external_call_id = fields.Char(string="External Call ID")
    x_preferred_language = fields.Selection([
        ('english', 'English'),
        ('hindi', 'Hindi'),
        ('hinglish', 'Hinglish'),
    ], string="Preferred Language", default='hinglish')
    x_whatsapp_sent = fields.Boolean(string="WhatsApp Sent", default=False)
    x_callback_requested_at = fields.Datetime(string="Callback Requested Time")

    x_ai_dispatch_payload = fields.Text(string="AI Dispatch Payload")
    x_ai_dispatch_status = fields.Selection([
        ('not_prepared', 'Not Prepared'),
        ('prepared', 'Prepared'),
        ('sent', 'Sent'),
        ('acknowledged', 'Acknowledged'),
        ('failed', 'Failed'),
    ], string="AI Dispatch Status", default='not_prepared')
    x_ai_last_dispatch_at = fields.Datetime(string="Last Dispatch At")

    x_ai_dispatch_lock_token = fields.Char(string="Dispatch Lock Token")
    x_ai_worker_name = fields.Char(string="AI Worker Name")
    x_ai_dispatch_ack_at = fields.Datetime(string="Dispatch Acknowledged At")
    x_ai_last_error = fields.Text(string="AI Last Error")
    x_ai_last_result_payload = fields.Text(string="AI Last Result Payload")

    # ---------------------------------------------------------
    # Config helpers
    # ---------------------------------------------------------

    @api.model
    def _get_icp(self):
        return self.env['ir.config_parameter'].sudo()

    @api.model
    def _get_config_bool(self, key, default=False):
        value = self._get_icp().get_param(key, default='1' if default else '0')
        return str(value).strip().lower() in ('1', 'true', 'yes', 'y', 'on')

    @api.model
    def _get_config_int(self, key, default=0):
        value = self._get_icp().get_param(key, default=str(default))
        try:
            return int(value)
        except Exception:
            return default

    @api.model
    def _get_config_str(self, key, default=''):
        return self._get_icp().get_param(key, default=default)

    @api.model
    def _get_worker_mode(self):
        return self._get_config_str('asmi_ai_voice_agent.worker_mode', 'test')

    @api.model
    def _get_queue_delay_minutes(self):
        return self._get_config_int('asmi_ai_voice_agent.queue_delay_minutes', 0)

    @api.model
    def _get_batch_limit(self):
        return self._get_config_int('asmi_ai_voice_agent.batch_limit', 5)

    @api.model
    def _get_max_attempts(self):
        return self._get_config_int('asmi_ai_voice_agent.max_attempts', 3)

    @api.model
    def _get_stale_minutes(self):
        return self._get_config_int('asmi_ai_voice_agent.stale_minutes', 15)

    @api.model
    def _get_retry_gap_minutes(self):
        return self._get_config_int('asmi_ai_voice_agent.retry_gap_minutes', 10)

    @api.model
    def _worker_enabled(self):
        return self._get_config_bool('asmi_ai_voice_agent.worker_enabled', True)

    @api.model
    def _get_business_timezone(self):
        return self._get_config_str('asmi_ai_voice_agent.business_tz', 'Asia/Kolkata')

    @api.model
    def _get_business_start_hour(self):
        return self._get_config_int('asmi_ai_voice_agent.business_start_hour', 10)

    @api.model
    def _get_business_end_hour(self):
        return self._get_config_int('asmi_ai_voice_agent.business_end_hour', 19)

    @api.model
    def _is_within_business_hours(self):
        tz_name = self._get_business_timezone()
        start_hour = self._get_business_start_hour()
        end_hour = self._get_business_end_hour()

        try:
            tz = pytz.timezone(tz_name)
        except Exception:
            tz = pytz.timezone('Asia/Kolkata')

        now_utc = fields.Datetime.now().replace(tzinfo=pytz.utc)
        local_now = now_utc.astimezone(tz)
        return start_hour <= local_now.hour < end_hour

    # ---------------------------------------------------------
    # Formatting helpers
    # ---------------------------------------------------------

    def _get_selection_label(self, field_name, value):
        if not value:
            return ''
        return dict(self._fields[field_name].selection).get(value, '')

    def _normalize_phone_for_ai(self, phone):
        if not phone:
            return ''

        phone = phone.strip()
        had_plus = phone.startswith('+')
        digits = re.sub(r'\D', '', phone)

        if not digits:
            return ''

        if digits.startswith('91') and len(digits) == 12:
            return f"+{digits}"

        if len(digits) == 10:
            return f"+91{digits}"

        if had_plus:
            return f"+{digits}"

        return digits

    # ---------------------------------------------------------
    # Payload helpers
    # ---------------------------------------------------------

    def _build_ai_dispatch_payload(self):
        self.ensure_one()

        payload = {
            "lead_id": self.id,
            "lead_name": self.name or '',
            "contact_name": self.partner_name or '',
            "phone": self._normalize_phone_for_ai(self.phone),
            "raw_phone": self.phone or '',
            "email": self.email_from or '',
            "business_niche": self.x_business_niche or '',
            "business_model": self._get_selection_label('x_business_model', self.x_business_model),
            "preferred_language": self._get_selection_label('x_preferred_language', self.x_preferred_language),
            "lead_temperature": self._get_selection_label('x_lead_temperature', self.x_lead_temperature),
            "is_499_interested": bool(self.x_499_interested),
            "script_mode": "semi_guided",
            "worker_mode": self._get_worker_mode(),
            "objective": "send_payment_link",
            "telephony_provider": "exotel",
            "call_type": "outbound",
            "worker_instructions": {
                "ask_interest_confirmation": True,
                "explain_strategy_call_fee": True,
                "confirm_payment_link_permission": True
            },
            "source_crm_lead_id": self.x_source_crm_lead_id or '',
            "existing_summary": self.x_ai_call_summary or '',
        }
        return json.dumps(payload, indent=2)

    def _append_ai_summary_note(self, note):
        for lead in self:
            existing = lead.x_ai_call_summary or ''
            updated = f"{existing}\n\n{note}" if existing else note
            lead.write({'x_ai_call_summary': updated})

    # ---------------------------------------------------------
    # Lead readiness and queue
    # ---------------------------------------------------------

    def action_mark_ai_ready(self):
        for lead in self:
            if not lead.phone:
                raise UserError("Phone number is required before marking lead as AI Ready.")
            if not lead.x_499_interested:
                raise UserError("Please confirm ₹499 Interested before marking lead as AI Ready.")
            if not lead.x_business_niche:
                raise UserError("Please fill Business / Niche before marking lead as AI Ready.")
            if not lead.x_business_model:
                raise UserError("Please select Business Model before marking lead as AI Ready.")

            temperature = lead.x_lead_temperature
            if not temperature:
                if lead.x_499_interested:
                    temperature = 'hot'
                elif lead.x_business_niche and lead.x_business_model:
                    temperature = 'warm'
                else:
                    temperature = 'cold'

            lead.write({
                'x_ai_ready': True,
                'x_lead_temperature': temperature,
            })

    def action_send_to_ai_queue(self):
        delay_minutes = self._get_queue_delay_minutes()

        for lead in self:
            if not lead.x_ai_ready:
                raise UserError("This lead is not AI Ready. Please click 'Mark AI Ready' first.")

            starter_summary = (
                "Lead is interested in ₹499 strategy call.\n"
                f"Business / Niche: {lead.x_business_niche or ''}\n"
                f"Business Model: {lead._get_selection_label('x_business_model', lead.x_business_model)}\n"
                f"Lead Temperature: {lead._get_selection_label('x_lead_temperature', lead.x_lead_temperature)}\n"
                f"Preferred Language: {lead._get_selection_label('x_preferred_language', lead.x_preferred_language)}"
            )

            lead.write({
                'x_ai_agent_enabled': True,
                'x_ai_call_status': 'queued',
                'x_ai_call_attempts': 0,
                'x_ai_call_due_at': fields.Datetime.now() + timedelta(minutes=delay_minutes),
                'x_ai_call_summary': starter_summary,
                'x_ai_dispatch_status': 'not_prepared',
                'x_ai_dispatch_payload': False,
                'x_ai_last_dispatch_at': False,
                'x_ai_dispatch_lock_token': False,
                'x_ai_worker_name': False,
                'x_ai_dispatch_ack_at': False,
                'x_ai_last_error': False,
                'x_ai_last_result_payload': False,
            })

    # ---------------------------------------------------------
    # Payment and manual actions
    # ---------------------------------------------------------

    def action_generate_razorpay_link(self):
        for lead in self:
            now = fields.Datetime.now()
            stamp = now.strftime("%Y%m%d%H%M%S")
            payment_reference = f"CRMLEAD-{lead.id}-{stamp}"
            payment_link_id = f"demo_link_{lead.id}_{stamp}"
            live_page_link = (
                f"https://pages.razorpay.com/pl_QwOnETFScro4Lt/view"
                f"?lead_id={lead.id}&ref={payment_reference}"
            )

            lead.write({
                'x_rzp_payment_link': live_page_link,
                'x_rzp_payment_link_id': payment_link_id,
                'x_rzp_payment_reference': payment_reference,
                'x_rzp_payment_id': False,
                'x_rzp_payment_status': 'created',
            })

    def action_mark_payment_link_sent(self):
        for lead in self:
            if not lead.x_rzp_payment_link:
                raise UserError("Please generate Razorpay Payment Link first.")

            lead.write({
                'x_rzp_payment_status': 'sent',
                'x_ai_call_status': 'payment_sent',
                'x_ai_call_result': 'payment_link_sent',
                'x_whatsapp_sent': True,
            })

    def action_mark_payment_completed(self):
        for lead in self:
            if not lead.x_rzp_payment_link:
                raise UserError("No Razorpay Payment Link found.")

            now = fields.Datetime.now()
            stamp = now.strftime("%Y%m%d%H%M%S")

            lead.write({
                'x_rzp_payment_status': 'paid',
                'x_ai_call_status': 'paid',
                'x_ai_call_result': 'payment_completed',
                'x_rzp_payment_id': f"demo_pay_{lead.id}_{stamp}",
                'x_rzp_paid_at': now,
            })

    def action_request_callback(self):
        for lead in self:
            lead.write({
                'x_ai_call_status': 'callback_requested',
                'x_ai_call_result': 'callback_later',
                'x_callback_requested_at': fields.Datetime.now() + timedelta(hours=4),
            })

    def action_mark_not_interested(self):
        for lead in self:
            lead.write({
                'x_ai_call_status': 'disqualified',
                'x_ai_call_result': 'not_interested',
                'x_ai_agent_enabled': False,
            })

    def action_mark_wrong_number(self):
        for lead in self:
            lead.write({
                'x_ai_call_status': 'disqualified',
                'x_ai_call_result': 'wrong_number',
                'x_ai_agent_enabled': False,
            })

    # ---------------------------------------------------------
    # AI helper methods
    # ---------------------------------------------------------

    def action_ai_send_payment_link(self):
        for lead in self:
            if not lead.x_rzp_payment_link:
                lead.action_generate_razorpay_link()
            lead.action_mark_payment_link_sent()

    def action_ai_request_callback(self):
        for lead in self:
            lead.action_request_callback()

    def action_ai_mark_not_interested(self):
        for lead in self:
            lead.action_mark_not_interested()

    def action_ai_mark_wrong_number(self):
        for lead in self:
            lead.action_mark_wrong_number()

    # ---------------------------------------------------------
    # Queue processing and recovery
    # ---------------------------------------------------------

    @api.model
    def cron_recover_stale_ai_calls(self):
        stale_minutes = self._get_stale_minutes()
        max_attempts = self._get_max_attempts()
        retry_gap_minutes = self._get_retry_gap_minutes()
        now = fields.Datetime.now()
        stale_before = now - timedelta(minutes=stale_minutes)

        stale_leads = self.search([
            ('x_ai_agent_enabled', '=', True),
            ('x_ai_call_status', '=', 'calling'),
            ('x_ai_last_dispatch_at', '!=', False),
            ('x_ai_last_dispatch_at', '<=', stale_before),
        ], limit=50)

        for lead in stale_leads:
            attempts = lead.x_ai_call_attempts or 0

            if attempts >= max_attempts:
                lead.write({
                    'x_ai_call_status': 'failed',
                    'x_ai_dispatch_status': 'failed',
                    'x_ai_last_error': f"Lead exceeded max attempts ({max_attempts}) during stale recovery.",
                })
                lead._append_ai_summary_note(
                    f"Stale recovery marked lead as failed.\n"
                    f"Attempts: {attempts}\n"
                    f"Max Attempts: {max_attempts}\n"
                    f"Recovered At: {now}"
                )
            else:
                next_retry = now + timedelta(minutes=retry_gap_minutes)
                lead.write({
                    'x_ai_call_status': 'queued',
                    'x_ai_dispatch_status': 'not_prepared',
                    'x_ai_call_due_at': next_retry,
                    'x_ai_next_retry_at': next_retry,
                    'x_ai_dispatch_lock_token': False,
                    'x_ai_worker_name': False,
                    'x_ai_last_error': f"Recovered stale calling lead. Requeued for retry {attempts + 1}.",
                })
                lead._append_ai_summary_note(
                    f"Stale recovery requeued the lead.\n"
                    f"Current Attempts: {attempts}\n"
                    f"Next Retry At: {next_retry}\n"
                    f"Recovered At: {now}"
                )

        return True

    @api.model
    def cron_process_ai_queue(self, force=False):
        if not self._worker_enabled():
            return True

        self.cron_recover_stale_ai_calls()

        if not force and not self._is_within_business_hours():
            return True

        now = fields.Datetime.now()
        max_attempts = self._get_max_attempts()

        leads = self.search([
            ('x_ai_agent_enabled', '=', True),
            ('x_ai_call_status', '=', 'queued'),
            ('x_ai_call_due_at', '!=', False),
            ('x_ai_call_due_at', '<=', now),
            ('x_ai_call_attempts', '<', max_attempts),
        ], order='x_ai_call_due_at asc, id asc', limit=50)

        for lead in leads:
            next_attempt = (lead.x_ai_call_attempts or 0) + 1
            external_call_id = f"queued_call_{lead.id}_{now.strftime('%Y%m%d%H%M%S')}"
            dispatch_payload = lead._build_ai_dispatch_payload()

            lead.write({
                'x_ai_call_status': 'calling',
                'x_ai_call_attempts': next_attempt,
                'x_external_call_id': external_call_id,
                'x_ai_dispatch_payload': dispatch_payload,
                'x_ai_dispatch_status': 'prepared',
                'x_ai_last_dispatch_at': now,
                'x_ai_dispatch_lock_token': False,
                'x_ai_worker_name': False,
                'x_ai_dispatch_ack_at': False,
                'x_ai_last_error': False,
                'x_ai_last_result_payload': False,
            })

            lead._append_ai_summary_note(
                f"Queue processor picked the lead for AI dispatch.\n"
                f"Attempt: {next_attempt}\n"
                f"External Call ID: {external_call_id}\n"
                f"Dispatch Status: Prepared\n"
                f"Processed At: {now}"
            )

        return True

    def action_run_ai_queue_processor(self):
        self.env['crm.lead'].cron_process_ai_queue(force=True)
        return True

    def action_run_ai_stale_recovery(self):
        self.env['crm.lead'].cron_recover_stale_ai_calls()
        return True
