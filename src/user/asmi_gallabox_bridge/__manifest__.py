{
    'name': 'Asmi Gallabox Bridge',
    'version': '19.0.1.0.0',
    'summary': 'Receive Odoo Online lead webhooks on Odoo.sh and send Gallabox WhatsApp templates.',
    'category': 'CRM',
    'author': 'OpenAI for Asmi Digitech',
    'license': 'LGPL-3',
    'depends': ['base', 'crm', 'mail'],
    'data': [
        'security/ir.model.access.csv',
        'views/gallabox_log_views.xml',
        'views/res_config_settings_views.xml',
    ],
    'installable': True,
    'application': False,
}
