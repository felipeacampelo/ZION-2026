import logging

from django.contrib.auth import get_user_model

from apps.enrollments.email_service import send_email_message


logger = logging.getLogger(__name__)
User = get_user_model()


def _build_html(title, intro, details, cta=None):
    detail_items = ''.join(f'<li>{item}</li>' for item in details)
    cta_html = ''
    if cta:
        cta_html = f'<p style="margin-top:24px;"><a href="{cta["url"]}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:600;">{cta["label"]}</a></p>'
    return f"""
<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:18px;padding:32px;border:1px solid #e5e7eb;">
    <h1 style="margin:0 0 16px 0;color:#111827;font-size:28px;">{title}</h1>
    <p style="color:#374151;font-size:15px;line-height:1.6;">{intro}</p>
    <ul style="color:#4b5563;line-height:1.7;">{detail_items}</ul>
    {cta_html}
    <p style="margin-top:28px;color:#9ca3af;font-size:12px;">Email automatico do modulo financeiro.</p>
  </div>
</body>
</html>
"""


def _notify(recipients, subject, html_content, text_content):
    for recipient in recipients:
        try:
            send_email_message(recipient, subject, html_content, text_content)
        except Exception as exc:
            logger.error('Erro ao enviar email financeiro para %s: %s', recipient, exc)


def _get_admin_emails():
    return list(
        User.objects.filter(is_staff=True, is_active=True)
        .exclude(email='')
        .values_list('email', flat=True)
    )


def send_finance_request_created_notifications(expense_request):
    requester_email = expense_request.requester.email
    admin_emails = [email for email in _get_admin_emails() if email != requester_email]

    subject_requester = f'Solicitacao recebida: {expense_request.rubric.name}'
    html_requester = _build_html(
        'Solicitacao registrada',
        'Sua solicitacao de despesa foi registrada e entrou na fila de analise.',
        [
            f'Area: {expense_request.area.name}',
            f'Rubrica: {expense_request.rubric.name}',
            f'Valor: R$ {expense_request.amount}',
            f'Descricao: {expense_request.description}',
        ],
    )
    text_requester = (
        'Sua solicitacao de despesa foi registrada.\n'
        f'Area: {expense_request.area.name}\n'
        f'Rubrica: {expense_request.rubric.name}\n'
        f'Valor: R$ {expense_request.amount}\n'
    )
    _notify([requester_email], subject_requester, html_requester, text_requester)

    if admin_emails:
        subject_admin = f'Nova solicitacao financeira: {expense_request.area.name}'
        html_admin = _build_html(
            'Nova solicitacao para analise',
            'Uma nova solicitacao financeira foi criada e aguarda tratamento no painel administrativo.',
            [
                f'Solicitante: {requester_email}',
                f'Area: {expense_request.area.name}',
                f'Rubrica: {expense_request.rubric.name}',
                f'Valor: R$ {expense_request.amount}',
            ],
        )
        text_admin = (
            'Nova solicitacao financeira criada.\n'
            f'Solicitante: {requester_email}\n'
            f'Area: {expense_request.area.name}\n'
            f'Rubrica: {expense_request.rubric.name}\n'
            f'Valor: R$ {expense_request.amount}\n'
        )
        _notify(admin_emails, subject_admin, html_admin, text_admin)


def send_finance_request_approved_notification(expense_request):
    subject = f'Solicitacao aprovada: {expense_request.rubric.name}'
    html = _build_html(
        'Solicitacao aprovada',
        'Sua solicitacao foi aprovada e a verba ficou comprometida para execucao.',
        [
            f'Area: {expense_request.area.name}',
            f'Rubrica: {expense_request.rubric.name}',
            f'Valor: R$ {expense_request.amount}',
        ],
    )
    text = (
        'Sua solicitacao foi aprovada.\n'
        f'Area: {expense_request.area.name}\n'
        f'Rubrica: {expense_request.rubric.name}\n'
        f'Valor: R$ {expense_request.amount}\n'
    )
    _notify([expense_request.requester.email], subject, html, text)


def send_finance_request_rejected_notification(expense_request):
    subject = f'Solicitacao rejeitada: {expense_request.rubric.name}'
    html = _build_html(
        'Solicitacao rejeitada',
        'Sua solicitacao foi rejeitada. Consulte a justificativa abaixo antes de abrir um novo pedido.',
        [
            f'Area: {expense_request.area.name}',
            f'Rubrica: {expense_request.rubric.name}',
            f'Valor: R$ {expense_request.amount}',
            f'Justificativa: {expense_request.rejection_reason}',
        ],
    )
    text = (
        'Sua solicitacao foi rejeitada.\n'
        f'Area: {expense_request.area.name}\n'
        f'Rubrica: {expense_request.rubric.name}\n'
        f'Valor: R$ {expense_request.amount}\n'
        f'Justificativa: {expense_request.rejection_reason}\n'
    )
    _notify([expense_request.requester.email], subject, html, text)

