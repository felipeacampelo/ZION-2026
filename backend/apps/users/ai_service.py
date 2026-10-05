"""
AI demo features backed by Claude: dashboard insights and a FAQ assistant.

Both are disabled unless ANTHROPIC_API_KEY is set. Only aggregated numbers
(insights) or the logged-in user's own enrollment (FAQ) are ever sent to the API.
"""
import json
import logging
from pathlib import Path

import anthropic
from anthropic import beta_tool
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

MODEL = 'claude-haiku-4-5'
EVENT_INFO_PATH = Path(__file__).resolve().parent / 'ai_event_info.md'

INSIGHTS_SYSTEM_PROMPT = (
    'Você é um analista da equipe do Acampamento Zion. Você recebe estatísticas agregadas '
    'do painel administrativo de inscrições, em JSON. Escreva em português do Brasil um resumo '
    'curto para a liderança: 3 a 5 destaques e, em seguida, pontos de atenção (por exemplo '
    'inadimplência, ocupação dos lotes, formas de pagamento e distribuição por impérios). '
    'Use somente os números recebidos; não invente dados nem faça suposições sobre pessoas. '
    'Formate como texto simples com tópicos usando "-", sem tabelas.'
)

FAQ_SYSTEM_PROMPT = (
    'Você é o assistente virtual do Acampamento Zion e responde em português do Brasil, '
    'de forma simpática e objetiva. Para dúvidas sobre o evento (datas, local, horários, '
    'o que levar, grupo de WhatsApp), use a ferramenta informacoes_evento. Para dúvidas sobre '
    'a inscrição, pagamento ou parcelas de quem está conversando com você, use a ferramenta '
    'minha_inscricao. Nunca invente informações: se a resposta não estiver nos dados das '
    'ferramentas, diga que não sabe e oriente a pessoa a falar com a equipe pelo grupo de '
    'WhatsApp dos responsáveis. Você só tem acesso à inscrição da própria pessoa logada e '
    'não pode consultar dados de outros inscritos.'
)


class AIDisabled(Exception):
    pass


class AIQuotaExceeded(Exception):
    pass


class AIServiceError(Exception):
    pass


def is_ai_enabled():
    return bool(getattr(settings, 'ANTHROPIC_API_KEY', ''))


def _get_client():
    if not is_ai_enabled():
        raise AIDisabled()
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _consume_quota():
    key = f'ai-calls-{timezone.localdate().isoformat()}'
    cache.add(key, 0, timeout=60 * 60 * 24)
    if cache.incr(key) > settings.AI_DAILY_LIMIT:
        raise AIQuotaExceeded()


def _final_text(message):
    if message.stop_reason == 'refusal':
        return 'Desculpe, não consigo ajudar com esse pedido.'
    return '\n'.join(block.text for block in message.content if block.type == 'text').strip()


def _call_claude(fn):
    """Run an API call, translating SDK errors into AIServiceError with a pt-BR message."""
    try:
        return fn()
    except anthropic.AuthenticationError as exc:
        logger.error('Chave da Anthropic inválida: %s', exc)
        raise AIServiceError('A chave da API de IA é inválida.') from exc
    except anthropic.RateLimitError as exc:
        logger.warning('Limite de uso da Anthropic atingido: %s', exc)
        raise AIServiceError('Muitas requisições à IA agora. Tente novamente em instantes.') from exc
    except anthropic.APIStatusError as exc:
        logger.error('Erro da API da Anthropic (%s): %s', exc.status_code, exc)
        raise AIServiceError('A IA retornou um erro. Tente novamente.') from exc
    except anthropic.APIConnectionError as exc:
        logger.error('Falha de conexão com a Anthropic: %s', exc)
        raise AIServiceError('Não foi possível conectar à IA. Tente novamente.') from exc


def generate_dashboard_insights(stats):
    client = _get_client()
    _consume_quota()
    message = _call_claude(lambda: client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=INSIGHTS_SYSTEM_PROMPT,
        messages=[{
            'role': 'user',
            'content': 'Estatísticas agregadas do painel:\n' + json.dumps(stats, ensure_ascii=False, default=str),
        }],
    ))
    return _final_text(message)


def build_event_info():
    from apps.enrollments.models import Settings
    from apps.products.models import Batch, Product

    site_settings = Settings.get_settings()
    products = []
    for product in Product.objects.filter(is_active=True).order_by('name'):
        batches = Batch.objects.filter(
            product=product,
            is_visible_on_site=True,
        ).exclude(status='ENDED').order_by('start_date')
        products.append({
            'nome': product.name,
            'data_evento': timezone.localtime(product.event_date).strftime('%d/%m/%Y') if product.event_date else '',
            'lotes': [
                {
                    'nome': batch.name,
                    'preco_pix_a_vista': str(batch.price),
                    'inicio': timezone.localtime(batch.start_date).strftime('%d/%m/%Y'),
                    'fim': timezone.localtime(batch.end_date).strftime('%d/%m/%Y'),
                    'status': batch.get_status_display(),
                }
                for batch in batches
            ],
        })

    return {
        'descricao': site_settings.home_description,
        'data': site_settings.home_date_text,
        'local': site_settings.home_location_text,
        'local_complemento': site_settings.home_location_subtext,
        'produtos': products,
        'informacoes_gerais': EVENT_INFO_PATH.read_text(encoding='utf-8') if EVENT_INFO_PATH.exists() else '',
    }


def build_user_enrollments(user):
    """The logged-in user's own enrollments, without personal documents or contacts."""
    from apps.enrollments.models import Enrollment

    enrollments = Enrollment.objects.filter(user=user).select_related('product', 'batch').order_by('-created_at')
    result = []
    for enrollment in enrollments:
        responsible = (enrollment.form_data or {}).get('responsavel') or {}
        result.append({
            'participante': enrollment.participant_name,
            'evento': enrollment.product.name,
            'lote': enrollment.batch.name,
            'status': enrollment.get_status_display(),
            'forma_pagamento': enrollment.get_payment_method_display() if enrollment.payment_method else 'Não selecionada',
            'parcelas': enrollment.installments,
            'valor_total': str(enrollment.final_amount),
            'responsavel_cadastrado': bool(isinstance(responsible, dict) and responsible.get('email_responsavel')),
            'pagamentos': [
                {
                    'parcela': payment.installment_number,
                    'valor': str(payment.amount),
                    'vencimento': payment.due_date.strftime('%d/%m/%Y') if payment.due_date else '',
                    'status': payment.get_status_display(),
                }
                for payment in enrollment.payments.order_by('installment_number')
            ],
        })
    return result


def answer_faq(user, messages):
    client = _get_client()
    _consume_quota()

    @beta_tool
    def informacoes_evento() -> str:
        """Informações públicas do Acampamento Zion: datas, local, lotes, horários, o que levar e grupo de WhatsApp."""
        return json.dumps(build_event_info(), ensure_ascii=False)

    @beta_tool
    def minha_inscricao() -> str:
        """Inscrições da pessoa logada: status, lote, forma de pagamento e parcelas com vencimentos."""
        enrollments = build_user_enrollments(user)
        if not enrollments:
            return 'A pessoa logada não tem nenhuma inscrição.'
        return json.dumps(enrollments, ensure_ascii=False)

    def run():
        runner = client.beta.messages.tool_runner(
            model=MODEL,
            max_tokens=1500,
            max_iterations=4,
            system=FAQ_SYSTEM_PROMPT,
            tools=[informacoes_evento, minha_inscricao],
            messages=messages,
        )
        tools_used = []
        last_message = None
        for last_message in runner:
            for block in last_message.content:
                if block.type == 'tool_use' and block.name not in tools_used:
                    tools_used.append(block.name)
        return last_message, tools_used

    last_message, tools_used = _call_claude(run)
    if last_message is None:
        raise AIServiceError('A IA não retornou resposta.')
    return {'reply': _final_text(last_message), 'tools_used': tools_used}
