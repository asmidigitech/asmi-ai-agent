# -*- coding: utf-8 -*-
{
    "name": "Asmi WhatsApp Engine",
    "version": "1.0.0",
    "summary": "Direct Gallabox WhatsApp engine for CRM leads",
    "depends": ["crm", "mail"],
    "data": [
        "security/ir.model.access.csv",
        "data/whatsapp_template_data.xml",
        "views/whatsapp_template_views.xml",
        "views/whatsapp_log_views.xml",
        "views/res_config_settings_views.xml",
    ],
    "installable": True,
    "application": False,
    "license": "LGPL-3",
}
