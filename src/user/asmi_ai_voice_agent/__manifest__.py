{
    'name': 'Asmi AI Voice Agent',
    'version': '1.0',
    'summary': 'AI Agent for Asmi Digitech Lead Automation',
    'description': 'AI calling agent and automation for DigiTL Elev8 leads.',
    'author': 'Asmi Digitech LLP',
    'website': 'https://www.asmidigitech.com',
    'category': 'Automation',
    'depends': ['crm', 'mail', 'web'],
    'data': [
        'views/crm_lead_views.xml',
        'data/ir_cron_data.xml',
      
       
    ],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
