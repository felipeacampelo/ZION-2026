"""
Email service for transactional and bulk emails using Resend.
"""
import logging
import re
from decimal import Decimal
from threading import Thread
from urllib.parse import quote

import resend
from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone

logger = logging.getLogger(__name__)

resend.api_key = getattr(settings, 'RESEND_API_KEY', None)

PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")
NO_PAYMENT_YET = 'NO_PAYMENT_YET'


def _get_base_styles():
    return """
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #a52cf0 0%, #7c3aed 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0; }
        .header-logo { display: block; margin: 0 auto 18px auto; max-width: 180px; width: 100%; height: auto; }
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


def _get_email_logo_url():
    frontend_url = getattr(settings, 'FRONTEND_URL', '').rstrip('/')
    if not frontend_url:
        return ''
    return f'{frontend_url}/logo.png'


def _get_email_logo_html():
    logo_url = _get_email_logo_url()
    if not logo_url:
        return ''
    return f'<img src="{logo_url}" alt="ZION 2026" class="header-logo" />'


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
    'link_criar_senha',
    'link_convite_lista_espera',
    'prazo_convite',
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
            {_get_email_logo_html()}
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
                <p>© ZION 2026 - Todos os direitos reservados</p>
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
            {_get_email_logo_html()}
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
                <p>© ZION 2026 - Todos os direitos reservados</p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
    'pending_payment': {
        'name': 'Pagamento Pendente',
        'subject': '⚠️ Inscrição Pendente - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Identificamos que o pagamento referente à sua inscrição no {{ produto }} ainda está pendente.\n"
            "Sua vaga ainda não está garantida.\n\n"
            "O prazo para regularização é de mais 3 dias.\n"
            "Caso o pagamento não seja efetuado dentro desse período, a inscrição poderá ser cancelada e a vaga disponibilizada para outra pessoa.\n\n"
            "Realize o pagamento em: {{ link_pagamento }}"
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
        <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);">
            {_get_email_logo_html()}
            <div class="emoji">⚠️</div>
            <h1>Inscrição Pendente</h1>
            <p style="margin-top: 12px; font-size: 16px; opacity: 0.95;">Sua vaga ainda não está garantida.</p>
        </div>
        <div class="content">
            <p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
            <p>
                Identificamos que o pagamento referente à sua inscrição no
                <strong>{{{{ produto }}}}</strong> ainda está pendente. Gostaríamos de lembrar que a confirmação da vaga está
                condicionada à realização do pagamento.
            </p>
            <div class="info-box" style="background: #fef2f2; border-left-color: #dc2626;">
                <h3 style="color: #991b1b;">📌 Atenção</h3>
                <p>O prazo para regularização é de mais <strong>3 dias</strong>.</p>
                <p>
                    Caso o pagamento não seja efetuado dentro desse período, a inscrição será automaticamente cancelada e a vaga
                    poderá ser disponibilizada para outra pessoa.
                </p>
            </div>
            <center>
                <a href="{{{{ link_pagamento }}}}" class="button" style="background: #dc2626;">Realizar Pagamento</a>
            </center>
            <p>Agradecemos a compreensão e ficamos à disposição para qualquer dúvida.</p>
            <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p><strong>Equipe Acampamento Zion</strong></p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
    'enrollment_expired': {
        'name': 'Inscrição Expirada por Falta de Pagamento',
        'subject': '❌ Inscrição Cancelada - prazo de pagamento expirado',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "O prazo para pagamento da sua inscrição em {{ produto }} expirou.\n"
            "Por isso, sua inscrição foi cancelada automaticamente.\n\n"
            "Se ainda houver vagas disponíveis, você poderá realizar uma nova inscrição pelo site.\n"
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
        <div class="header" style="background: linear-gradient(135deg, #6b7280 0%, #374151 100%);">
            {_get_email_logo_html()}
            <div class="emoji">❌</div>
            <h1>Inscrição Cancelada</h1>
            <p style="margin-top: 12px; font-size: 16px; opacity: 0.95;">O prazo para pagamento expirou.</p>
        </div>
        <div class="content">
            <p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
            <p>
                O prazo para pagamento da sua inscrição em <strong>{{{{ produto }}}}</strong> expirou e,
                por isso, a inscrição foi cancelada automaticamente.
            </p>
            <div class="info-box" style="border-left-color: #6b7280;">
                <h3>Prazo encerrado</h3>
                <p>Sua vaga foi liberada e a inscrição não está mais ativa.</p>
                <p>Se ainda houver vagas disponíveis, você poderá realizar uma nova inscrição pelo site.</p>
            </div>
            <center>
                <a href="{{{{ link_minhas_inscricoes }}}}" class="button" style="background: #374151;">Ver Minhas Inscrições</a>
            </center>
            <div class="footer">
                <p>Este é um email automático, por favor não responda.</p>
                <p>© ZION 2026 - Todos os direitos reservados</p>
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
            {_get_email_logo_html()}
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
                <p>© ZION 2026 - Todos os direitos reservados</p>
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
            {_get_email_logo_html()}
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
                <p>© ZION 2026 - Todos os direitos reservados</p>
            </div>
        </div>
    </div>
</body>
</html>
""",
    },
    'waitlist_joined': {
        'name': 'Entrada na Lista de Espera',
        'subject': '🕊️ Você entrou na lista de espera - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Recebemos sua pré-inscrição na lista de espera de {{ produto }}.\n"
            "Assim que uma vaga surgir, enviaremos um convite exclusivo para este email.\n\n"
            "Acompanhe sua conta em: {{ link_minhas_inscricoes }}"
        ),
        'html_content': f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>{_get_base_styles()}</style></head>
<body><div class="container"><div class="header">{_get_email_logo_html()}<div class="emoji">🕊️</div><h1>Você entrou na lista de espera</h1></div><div class="content">
<p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
<p>Recebemos sua pré-inscrição na lista de espera de <strong>{{{{ produto }}}}</strong>.</p>
<div class="info-box"><h3>Próximos passos</h3><p>Se uma vaga surgir, você receberá um convite exclusivo por email.</p></div>
<div class="footer"><p>Este é um email automático, por favor não responda.</p><p>© ZION 2026 - Todos os direitos reservados</p></div>
</div></div></body></html>
""",
    },
    'waitlist_invited': {
        'name': 'Convite da Lista de Espera',
        'subject': '🎟️ Sua vaga foi liberada - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "Sua vaga em {{ produto }} foi liberada.\n"
            "Use este link exclusivo para continuar sua inscrição: {{ link_convite_lista_espera }}\n"
            "Prazo: {{ prazo_convite }}\n\n"
            "Se quiser acompanhar sua inscrição depois pela sua conta, crie sua senha aqui: {{ link_criar_senha }}\n\n"
            "Depois desse prazo, a vaga será passada para a próxima pessoa da fila."
        ),
        'html_content': f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>{_get_base_styles()}</style></head>
<body><div class="container"><div class="header">{_get_email_logo_html()}<div class="emoji">🎟️</div><h1>Sua vaga foi liberada</h1></div><div class="content">
<p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
<p>Uma vaga em <strong>{{{{ produto }}}}</strong> foi reservada exclusivamente para você.</p>
<div class="info-box"><h3>Prazo da reserva</h3><p>Você tem até <strong>{{{{ prazo_convite }}}}</strong> para continuar sua inscrição.</p></div>
<center><a href="{{{{ link_convite_lista_espera }}}}" class="button">Continuar inscrição</a></center>
<p style="margin-top: 24px; text-align: center;">Se quiser acompanhar sua inscrição depois pela sua conta, <a href="{{{{ link_criar_senha }}}}" style="color: #7c3aed; font-weight: 600;">crie sua senha</a>.</p>
<div class="footer"><p>Este é um email automático, por favor não responda.</p><p>© ZION 2026 - Todos os direitos reservados</p></div>
</div></div></body></html>
""",
    },
    'waitlist_expired': {
        'name': 'Expiração da Lista de Espera',
        'subject': '⌛ Sua reserva expirou - {{ produto }}',
        'text_content': (
            "Olá, {{ nome }}!\n\n"
            "O prazo da sua reserva em {{ produto }} expirou e a vaga foi liberada para a próxima pessoa da fila."
        ),
        'html_content': f"""
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>{_get_base_styles()}</style></head>
<body><div class="container"><div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">{_get_email_logo_html()}<div class="emoji">⌛</div><h1>Prazo encerrado</h1></div><div class="content">
<p>Olá, <strong>{{{{ nome }}}}</strong>!</p>
<p>O prazo da sua reserva em <strong>{{{{ produto }}}}</strong> expirou e a vaga foi liberada para a próxima pessoa da fila.</p>
<div class="footer"><p>Este é um email automático, por favor não responda.</p><p>© ZION 2026 - Todos os direitos reservados</p></div>
</div></div></body></html>
""",
    },
}


def get_recipient_contact(enrollment, target='participant'):
    """Return (email, name) for an enrollment, targeting either the participant
    or the responsible party they registered with."""
    form_data = enrollment.form_data or {}
    participant_name = form_data.get('nome_completo') or enrollment.user.get_full_name() or enrollment.user.email

    if target == 'responsible':
        responsible = form_data.get('responsavel') or {}
        if not isinstance(responsible, dict):
            responsible = {}
        email = (responsible.get('email_responsavel') or '').strip().lower()
        name = responsible.get('nome_responsavel') or participant_name
        return email, name

    email = (form_data.get('email') or enrollment.user.email or '').strip().lower()
    return email, participant_name


def build_attachment_payload(campaign):
    if not campaign or not campaign.attachment:
        return None
    try:
        campaign.attachment.open('rb')
        content = list(campaign.attachment.read())
    finally:
        campaign.attachment.close()
    filename = campaign.attachment_name or campaign.attachment.name.rsplit('/', 1)[-1]
    return [{'filename': filename, 'content': content}]


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
    frontend_url = getattr(settings, 'FRONTEND_URL', 'https://jumpibcapital.com.br')

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
    waitlist_invite_link = ''
    invite_deadline = ''
    create_password_link = ''

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

    if enrollment is not None and getattr(enrollment, 'reservation_token', ''):
        waitlist_invite_link = f'{frontend_url}/lista-espera/convite/{enrollment.reservation_token}'
        if enrollment.reservation_expires_at:
            invite_deadline = timezone.localtime(enrollment.reservation_expires_at).strftime('%d/%m/%Y às %H:%M')

    if user_email:
        create_password_link = f'{frontend_url}/criar-senha?email={quote(user_email)}'

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
        'link_criar_senha': create_password_link,
        'link_convite_lista_espera': waitlist_invite_link,
        'prazo_convite': invite_deadline,
    }


def get_preview_context_for_template(key):
    preview = {
        'nome': 'Maria da Silva',
        'email': 'maria@example.com',
        'produto': 'Acampamento Zion',
        'lote': 'Lote 1',
        'valor': 'R$ 199,90',
        'forma_pagamento': 'PIX Parcelado',
        'parcelas': '3x',
        'link_minhas_inscricoes': 'https://jumpibcapital.com.br/minhas-inscricoes',
        'link_pagamento': 'https://jumpibcapital.com.br/minhas-inscricoes',
        'vencimento': '20/05/2026',
        'numero_parcela': '2 de 3',
        'link_reset_senha': 'https://jumpibcapital.com.br/reset-password/demo/token',
        'link_criar_senha': 'https://jumpibcapital.com.br/criar-senha?email=maria%40example.com',
        'link_convite_lista_espera': 'https://jumpibcapital.com.br/lista-espera/convite/demo-token',
        'prazo_convite': '21/06/2026 às 20:00',
    }
    if key == 'password_reset':
        preview['forma_pagamento'] = ''
        preview['parcelas'] = ''
    return preview


def send_email_message(to_email, subject, html_content, text_content='', attachments=None):
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
    if attachments:
        params['attachments'] = attachments

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


def send_campaign_test_email(subject, html_content, text_content, to_email, context=None, attachments=None):
    rendered_context = context or get_preview_context_for_template('enrollment_confirmation')
    return send_email_message(
        to_email=to_email,
        subject=render_placeholders(subject, rendered_context),
        html_content=render_placeholders(html_content, rendered_context),
        text_content=render_placeholders(text_content, rendered_context),
        attachments=attachments,
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


def send_enrollment_expired_email(enrollment):
    context = build_email_context(enrollment=enrollment)
    rendered = render_email_template('enrollment_expired', context)
    if not rendered['is_active']:
        logger.info('Template enrollment_expired desativado; envio ignorado.')
        return False
    try:
        return send_email_message(
            to_email=enrollment.form_data.get('email', enrollment.user.email),
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
        )
    except Exception as exc:
        logger.error('Erro ao enviar email de inscrição expirada: %s', exc)
        return False


def _send_waitlist_email(key, entry, enrollment=None):
    context = build_email_context(enrollment=enrollment)
    context['nome'] = (entry.form_data or {}).get('nome_completo') or entry.user.get_full_name() or entry.user.email
    context['email'] = (entry.form_data or {}).get('email') or entry.user.email
    context['produto'] = entry.product.name
    if entry.reference_batch:
        context['lote'] = entry.reference_batch.name
    rendered = render_email_template(key, context)
    if not rendered['is_active']:
        logger.info('Template %s desativado; envio ignorado.', key)
        return False
    try:
        return send_email_message(
            to_email=context['email'],
            subject=rendered['subject'],
            html_content=rendered['html_content'],
            text_content=rendered['text_content'],
        )
    except Exception as exc:
        logger.error('Erro ao enviar email %s: %s', key, exc)
        return False


def send_waitlist_joined_email(entry):
    return _send_waitlist_email('waitlist_joined', entry)


def send_waitlist_invited_email(entry, enrollment):
    return _send_waitlist_email('waitlist_invited', entry, enrollment=enrollment)


def send_waitlist_expired_email(entry):
    return _send_waitlist_email('waitlist_expired', entry)


def get_campaign_recipients_queryset(filters):
    from django.db.models import Exists, OuterRef, Q
    from .models import Enrollment
    from apps.payments.models import Payment

    queryset = Enrollment.objects.select_related('product', 'batch', 'user').order_by('-created_at')

    enrollment_ids = filters.get('enrollment_ids') or []
    status_filter = filters.get('status')
    product_filter = filters.get('product')
    payment_method_filter = filters.get('payment_method')
    payment_state_filter = filters.get('payment_state')
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
    if payment_state_filter == NO_PAYMENT_YET:
        paid_payments = Payment.objects.filter(
            enrollment_id=OuterRef('pk'),
            status__in=['CONFIRMED', 'RECEIVED'],
        )
        queryset = queryset.annotate(
            has_paid_payment=Exists(paid_payments),
        ).exclude(
            status__in=['CANCELLED', 'EXPIRED'],
        ).filter(
            Q(payment_method__isnull=True) |
            Q(payment_method='') |
            Q(has_paid_payment=False)
        )
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
    target = (campaign.filters or {}).get('recipient_target', 'participant')

    deduped = {}
    for enrollment in get_campaign_recipients_queryset(campaign.filters).iterator():
        email, name = get_recipient_contact(enrollment, target)
        if not email or email in deduped:
            continue
        deduped[email] = (enrollment, name)

    recipients = [
        EmailCampaignRecipient(
            campaign=campaign,
            enrollment=enrollment,
            email=email,
            name=name or email,
        )
        for email, (enrollment, name) in deduped.items()
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

    attachments = build_attachment_payload(campaign)

    for recipient in EmailCampaignRecipient.objects.filter(campaign=campaign).order_by('id').iterator():
        try:
            context = build_email_context(enrollment=recipient.enrollment) if recipient.enrollment else get_preview_context_for_template('enrollment_confirmation')
            send_email_message(
                to_email=recipient.email,
                subject=render_placeholders(campaign.subject, context),
                html_content=render_placeholders(campaign.html_content, context),
                text_content=render_placeholders(campaign.text_content, context),
                attachments=attachments,
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
