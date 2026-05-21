"""
Email service for transactional and bulk emails using Resend.
"""
import logging
import re
from decimal import Decimal
from threading import Thread

import resend
from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

logger = logging.getLogger(__name__)

resend.api_key = getattr(settings, 'RESEND_API_KEY', None)

PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


def _get_base_styles():
    return """
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a52cf0 0%, #7c3aed 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
        .header-success { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        .content { background: white; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .info-box { background: #f8f9fa; padding: 24px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #a52cf0; }
        .info-box-success { border-left-color: #10b981; }
        .info-box h3 { margin: 0 0 16px 0; color: #1f2937; font-size: 18px; }
        .info-box p { margin: 8px 0; color: #4b5563; }
        .info-box strong { color: #1f2937; }
        .button { display: inline-block; padding: 14px 32px; background: #a52cf0; color: white; text-decoration: none; border-radius: 8px; margin: 24px 0; font-weight: 600; font-size: 16px; }
        .button-success { background: #10b981; }
        .button:hover { opacity: 0.9; }
        .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 13px; }
        .emoji { font-size: 48px; margin-bottom: 16px; }
        ul { padding-left: 20px; }
        li { margin: 8px 0; color: #4b5563; }
    """


DEFAULT_TEMPLATE_TOKENS = [
    'nome',
    'email',
    'produto',
    'lote',
    'valor',
    'forma_pagamento',
    'parcelas',
    'link_minhas_inscricoes',
    'link_pagamento',
    'vencimento',
    'numero_parcela',
    'link_reset_senha',
]


EMAIL_TEMPLATE_DEFAULTS = {
    'enrollment_confirmation': {
        'name': 'Confirmação de Inscrição',
        'subject': '✅ Inscrição Confirmada - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Sua inscrição foi registrada com sucesso.\n"
            "Evento: {{ produto }}\n"
            "Lote: {{ lote }}\n"
            "Valor: {{ valor }}\n"
            "Forma de pagamento: {{ forma_pagamento }}\n"
            "Parcelas: {{ parcelas }}\n\n"
            "Acompanhe em: {{ link_minhas_inscricoes }}"
        ),
        'html_content': f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>{_get_base_styles()}</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="emoji">✅</div>
            <h1>Inscrição Confirmada!</h1>
        </div>
        <div class="content">
            <p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
            <p>Sua inscrição foi registrada com sucesso! 🎉</p>
            <div class="info-box">
                <h3>📋 Detalhes da Inscrição</h3>
                <p><strong>Evento:</strong> {{{{ produto }}}}</p>
                <p><strong>Lote:</strong> {{{{ lote }}}}</p>
                <p><strong>Valor:</strong> {{{{ valor }}}}</p>
                <p><strong>Forma de Pagamento:</strong> {{{{ forma_pagamento }}}}</p>
                <p><strong>Parcelas:</strong> {{{{ parcelas }}}}</p>
            </div>
            <p><strong>📌 Próximos Passos:</strong></p>
            <ul>
                <li>Acesse sua área de inscrições para acompanhar o status do pagamento</li>
                <li>Você receberá um email quando o pagamento for confirmado</li>
                <li>Em caso de dúvidas, entre em contato conosco</li>
            </ul>
            <center>
                <a href="{{{{ link_minhas_inscricoes }}}}" class="button">Ver Minhas Inscrições</a>
            </center>
            <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p>© 2025 AreaMais - Todos os direitos reservados</p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
    'payment_confirmation': {
        'name': 'Confirmação de Pagamento',
        'subject': '🎉 Pagamento Confirmado - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Seu pagamento foi confirmado com sucesso.\n"
            "Evento: {{ produto }}\n"
            "Lote: {{ lote }}\n"
            "Valor pago: {{ valor }}\n\n"
            "Veja mais em: {{ link_minhas_inscricoes }}"
        ),
        'html_content': f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>{_get_base_styles()}</style>
</head>
<body>
    <div class="container">
        <div class="header header-success">
            <div class="emoji">🎉</div>
            <h1>Pagamento Confirmado!</h1>
        </div>
        <div class="content">
            <p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
            <p>Ótima notícia! Seu pagamento foi confirmado com sucesso!</p>
            <div class="info-box info-box-success">
                <h3>💳 Detalhes do Pagamento</h3>
                <p><strong>Evento:</strong> {{{{ produto }}}}</p>
                <p><strong>Lote:</strong> {{{{ lote }}}}</p>
                <p><strong>Valor Pago:</strong> {{{{ valor }}}}</p>
                <p><strong>Status:</strong> ✓ Pago</p>
            </div>
            <p><strong>🚀 Próximos Passos:</strong></p>
            <ul>
                <li>Sua inscrição está 100% confirmada!</li>
                <li>Você receberá mais informações sobre o evento em breve</li>
                <li>Acesse sua área de inscrições para ver todos os detalhes</li>
            </ul>
            <center>
                <a href="{{{{ link_minhas_inscricoes }}}}" class="button button-success">Ver Minhas Inscrições</a>
            </center>
            <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p>© 2025 AreaMais - Todos os direitos reservados</p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
    'installment_reminder': {
        'name': 'Lembrete de Parcela',
        'subject': '⏰ Lembrete: Parcela {{ numero_parcela }} - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Este é um lembrete sobre sua próxima parcela.\n"
            "Evento: {{ produto }}\n"
            "Parcela: {{ numero_parcela }}\n"
            "Valor: {{ valor }}\n"
            "Vencimento: {{ vencimento }}\n\n"
            "Pague em: {{ link_pagamento }}"
        ),
        'html_content': f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>{_get_base_styles()}</style>
</head>
<body>
    <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            <div class="emoji">⏰</div>
            <h1>Lembrete de Parcela</h1>
        </div>
        <div class="content">
            <p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
            <p>Este é um lembrete amigável sobre sua próxima parcela.</p>
            <div class="info-box" style="border-left-color: #f59e0b;">
                <h3>📅 Detalhes da Parcela</h3>
                <p><strong>Evento:</strong> {{{{ produto }}}}</p>
                <p><strong>Parcela:</strong> {{{{ numero_parcela }}}}</p>
                <p><strong>Valor:</strong> {{{{ valor }}}}</p>
                <p><strong>Vencimento:</strong> {{{{ vencimento }}}}</p>
            </div>
            <p>Acesse sua área de inscrições para efetuar o pagamento via PIX.</p>
            <center>
                <a href="{{{{ link_pagamento }}}}" class="button" style="background: #f59e0b;">Pagar Agora</a>
            </center>
            <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p>© 2025 AreaMais - Todos os direitos reservados</p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
    'password_reset': {
        'name': 'Recuperação de Senha',
        'subject': '🔐 Recuperação de Senha - AreaMais',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Você solicitou a recuperação de senha da sua conta.\n"
            "Use este link para redefinir sua senha: {{ link_reset_senha }}\n\n"
            "Se você não solicitou esta recuperação, ignore este email."
        ),
        'html_content': f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>{_get_base_styles()}</style>
</head>
<body>
    <div class="container">
        <div class="header" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);">
            <div class="emoji">🔐</div>
            <h1>Recuperação de Senha</h1>
        </div>
        <div class="content">
            <p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
            <p>Você solicitou a recuperação de senha da sua conta.</p>
            <p>Clique no botão abaixo para criar uma nova senha:</p>
            <center>
                <a href="{{{{ link_reset_senha }}}}" class="button" style="background: #6366f1;">Redefinir Senha</a>
            </center>
            <p style="color: #6b7280; font-size: 14px;">
                <strong>⚠️ Importante:</strong> Este link expira em 24 horas.<br>
                Se você não solicitou esta recuperação, ignore este email.
            </p>
            <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p>© 2025 AreaMais - Todos os direitos reservados</p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
}


def format_currency(value):
    try:
        amount = Decimal(str(value or '0'))
    except Exception:
        amount = Decimal('0')
    return f'R$ {amount:.2f}'.replace('.', ',')


def render_placeholders(content, context):
    if not content:
        return ''

    def replace(match):
        key = match.group(1)
        value = context.get(key, '')
        return '' if value is None else str(value)

    return PLACEHOLDER_PATTERN.sub(replace, content)


def get_email_template_defaults():
    return EMAIL_TEMPLATE_DEFAULTS


def get_email_template_definition(key):
    return EMAIL_TEMPLATE_DEFAULTS[key]


def get_template_tokens(_key):
    return DEFAULT_TEMPLATE_TOKENS


def get_email_template(key):
    from .models import EmailTemplate

    template = EmailTemplate.objects.filter(key=key).first()
    if template:
        return {
            'key': template.key,
            'name': template.name,
            'subject': template.subject,
            'html_content': template.html_content,
            'text_content': template.text_content,
            'is_active': template.is_active,
        }

    default = get_email_template_definition(key)
    return {
        'key': key,
        'name': default['name'],
        'subject': default['subject'],
        'html_content': default['html_content'],
        'text_content': default['text_content'],
        'is_active': True,
    }


def render_email_template(key, context):
    template = get_email_template(key)
    return {
        'key': key,
        'name': template['name'],
        'is_active': template['is_active'],
        'subject': render_placeholders(template['subject'], context),
        'html_content': render_placeholders(template['html_content'], context),
        'text_content': render_placeholders(template['text_content'], context),
    }


def build_email_context(enrollment=None, payment=None, reset_link=''):
    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://areamais.com.br')

    user_name = 'Participante'
    user_email = ''
    product_name = ''
    batch_name = ''
    payment_method = ''
    installments = ''
    amount = ''
    payment_link = f'{frontend_url}/minhas-inscricoes'
    due_date = ''
    installment_number = ''

    if enrollment is not None:
        user_name = enrollment.form_data.get('nome_completo', enrollment.user.get_full_name()) or 'Participante'
        user_email = enrollment.form_data.get('email', enrollment.user.email)
        product_name = enrollment.product.name
        batch_name = enrollment.batch.name
        payment_method = enrollment.get_payment_method_display() if enrollment.payment_method else 'Não selecionado'
        installments = f'{enrollment.installments}x' if enrollment.installments else '1x'
        amount = format_currency(enrollment.final_amount)

    if payment is not None:
        amount = format_currency(payment.amount)
        due_date = payment.due_date.strftime('%d/%m/%Y') if payment.due_date else ''
        installment_number = str(payment.installment_number)
        payment_link = payment.payment_url or f'{frontend_url}/minhas-inscricoes'

    return {
        'nome': user_name,
        'email': user_email,
        'produto': product_name,
        'lote': batch_name,
        'valor': amount,
        'forma_pagamento': payment_method,
        'parcelas': installments,
        'link_minhas_inscricoes': f'{frontend_url}/minhas-inscricoes',
        'link_pagamento': payment_link,
        'vencimento': due_date,
        'numero_parcela': installment_number,
        'link_reset_senha': reset_link,
    }


def get_preview_context_for_template(key):
    preview = {
        'nome': 'Maria da Silva',
        'email': 'maria@example.com',
        'produto': 'Acampamento Área Mais',
        'lote': 'Lote 1',
        'valor': 'R$ 199,90',
        'forma_pagamento': 'PIX Parcelado',
        'parcelas': '3x',
        'link_minhas_inscricoes': 'https://areamais.com.br/minhas-inscricoes',
        'link_pagamento': 'https://areamais.com.br/minhas-inscricoes',
        'vencimento': '20/05/2026',
        'numero_parcela': '2 de 3',
        'link_reset_senha': 'https://areamais.com.br/reset-password/demo/token',
    }
    if key == 'password_reset':
        preview['forma_pagamento'] = ''
        preview['parcelas'] = ''
    return preview


def send_email_message(to_email, subject, html_content, text_content=''):
    if not resend.api_key:
        logger.warning("RESEND_API_KEY not configured, skipping email")
        return False

    params = {
        'from': settings.DEFAULT_FROM_EMAIL,
        'to': [to_email],
        'subject': subject,
        'html': html_content,
    }
    if text_content:
        params['text'] = text_content

    response = resend.Emails.send(params)
    logger.info('Email enviado para %s: %s', to_email, response)
    return True


def send_template_test_email(key, to_email):
    rendered = render_email_template(key, get_preview_context_for_template(key))
    return send_email_message(
        to_email=to_email,
        subject=rendered['subject'],
        html_content=rendered['html_content'],
        text_content=rendered['text_content'],
    )


def send_campaign_test_email(subject, html_content, text_content, to_email, context=None):
    rendered_context = context or get_preview_context_for_template('enrollment_confirmation')
    return send_email_message(
        to_email=to_email,
        subject=render_placeholders(subject, rendered_context),
        html_content=render_placeholders(html_content, rendered_context),
        text_content=render_placeholders(text_content, rendered_context),
    )


def send_enrollment_confirmation_email(enrollment):
    rendered = render_email_template('enrollment_confirmation', build_email_context(enrollment=enrollment))
    if not rendered['is_active']:
        logger.info('Template enrollment_confirmation desativado; envio ignorado.')
        return False
    try:
        return send_email_message(
            to_email=enrollment.form_data.get('email', enrollment.user.email),
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
        )
    except Exception as exc:
        logger.error('Erro ao enviar email de confirmação de inscrição: %s', exc)
        return False


def send_payment_confirmation_email(enrollment):
    rendered = render_email_template('payment_confirmation', build_email_context(enrollment=enrollment))
    if not rendered['is_active']:
        logger.info('Template payment_confirmation desativado; envio ignorado.')
        return False
    try:
        return send_email_message(
            to_email=enrollment.form_data.get('email', enrollment.user.email),
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
        )
    except Exception as exc:
        logger.error('Erro ao enviar email de confirmação de pagamento: %s', exc)
        return False


def send_installment_reminder_email(enrollment, payment):
    context = build_email_context(enrollment=enrollment, payment=payment)
    context['numero_parcela'] = f'{payment.installment_number} de {enrollment.installments}'
    rendered = render_email_template('installment_reminder', context)
    if not rendered['is_active']:
        logger.info('Template installment_reminder desativado; envio ignorado.')
        return False
    try:
        return send_email_message(
            to_email=enrollment.form_data.get('email', enrollment.user.email),
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
        )
    except Exception as exc:
        logger.error('Erro ao enviar email de lembrete de parcela: %s', exc)
        return False


def send_password_reset_email(user, reset_link):
    context = build_email_context(reset_link=reset_link)
    context['nome'] = user.get_full_name() or user.email
    context['email'] = user.email
    rendered = render_email_template('password_reset', context)
    if not rendered['is_active']:
        logger.info('Template password_reset desativado; envio ignorado.')
        return False
    try:
        return send_email_message(
            to_email=user.email,
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
        )
    except Exception as exc:
        logger.error('Erro ao enviar email de recuperação de senha: %s', exc)
        return False


def get_campaign_recipients_queryset(filters):
    from django.db.models import Q
    from .models import Enrollment

    queryset = Enrollment.objects.select_related('product', 'batch', 'user').order_by('-created_at')

    enrollment_ids = filters.get('enrollment_ids') or []
    status_filter = filters.get('status')
    product_filter = filters.get('product')
    payment_method_filter = filters.get('payment_method')
    search = (filters.get('search') or '').strip()
    enrollment_ids = filters.get('enrollment_ids') or []

    if enrollment_ids:
        queryset = queryset.filter(id__in=enrollment_ids)
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    if product_filter:
        queryset = queryset.filter(product_id=product_filter)
    if payment_method_filter:
        queryset = queryset.filter(payment_method=payment_method_filter)
    if enrollment_ids:
        queryset = queryset.filter(id__in=enrollment_ids)
    if search:
        queryset = queryset.filter(
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(user__email__icontains=search) |
            Q(form_data__nome_completo__icontains=search) |
            Q(form_data__email__icontains=search) |
            Q(form_data__cpf__icontains=search)
        )

    return queryset


def build_campaign_snapshot(campaign):
    from .models import EmailCampaignRecipient

    campaign.recipients.all().delete()

    deduped = {}
    for enrollment in get_campaign_recipients_queryset(campaign.filters).iterator():
        email = (enrollment.form_data.get('email') or enrollment.user.email or '').strip().lower()
        if not email or email in deduped:
            continue
        deduped[email] = enrollment

    recipients = [
        EmailCampaignRecipient(
            campaign=campaign,
            enrollment=enrollment,
            email=email,
            name=enrollment.form_data.get('nome_completo', enrollment.user.get_full_name()) or email,
        )
        for email, enrollment in deduped.items()
    ]

    EmailCampaignRecipient.objects.bulk_create(recipients)
    campaign.recipient_count = len(recipients)
    campaign.sent_count = 0
    campaign.failed_count = 0
    campaign.save(update_fields=['recipient_count', 'sent_count', 'failed_count', 'updated_at'])
    return recipients


def _final_campaign_status(campaign):
    if campaign.recipient_count == 0:
        return 'FAILED'
    if campaign.sent_count == campaign.recipient_count and campaign.failed_count == 0:
        return 'SENT'
    if campaign.sent_count == 0 and campaign.failed_count > 0:
        return 'FAILED'
    return 'PARTIAL'


def process_campaign_send(campaign_id):
    from .models import EmailCampaign, EmailCampaignRecipient

    close_old_connections()
    campaign = EmailCampaign.objects.get(pk=campaign_id)
    campaign.status = 'SENDING'
    campaign.started_at = timezone.now()
    campaign.finished_at = None
    campaign.sent_count = 0
    campaign.failed_count = 0
    campaign.save(update_fields=['status', 'started_at', 'finished_at', 'sent_count', 'failed_count', 'updated_at'])

    for recipient in EmailCampaignRecipient.objects.filter(campaign=campaign).order_by('id').iterator():
        try:
            context = build_email_context(enrollment=recipient.enrollment) if recipient.enrollment else get_preview_context_for_template('enrollment_confirmation')
            send_email_message(
                to_email=recipient.email,
                subject=render_placeholders(campaign.subject, context),
                html_content=render_placeholders(campaign.html_content, context),
                text_content=render_placeholders(campaign.text_content, context),
            )
            recipient.status = 'SENT'
            recipient.sent_at = timezone.now()
            recipient.error_message = ''
            recipient.save(update_fields=['status', 'sent_at', 'error_message', 'updated_at'])
            campaign.sent_count += 1
        except Exception as exc:
            recipient.status = 'FAILED'
            recipient.error_message = str(exc)
            recipient.sent_at = None
            recipient.save(update_fields=['status', 'error_message', 'sent_at', 'updated_at'])
            campaign.failed_count += 1

        campaign.save(update_fields=['sent_count', 'failed_count', 'updated_at'])

    campaign.status = _final_campaign_status(campaign)
    campaign.finished_at = timezone.now()
    campaign.save(update_fields=['status', 'finished_at', 'updated_at'])
    close_old_connections()


def start_campaign_send(campaign):
    thread = Thread(target=process_campaign_send, args=(campaign.id,), daemon=True)
    thread.start()
    return thread
