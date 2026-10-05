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


# ─── Admin assistant (aggregate data only) ────────────────────────────────────

# Only aggregated dashboard sections are ever sent to the model.
DASHBOARD_AGGREGATE_KEYS = (
    'enrollments',
    'payments',
    'revenue',
    'members',
    'gender',
    'birth_years',
    'empires',
    'payment_methods',
    'batches',
    'social_quota',
)

ADMIN_ASSISTANT_SYSTEM_PROMPT = (
    'Você é o assistente de dados da equipe administrativa do Acampamento Zion e responde em '
    'português do Brasil, de forma direta. Use as ferramentas para responder perguntas sobre '
    'inscrições, pagamentos, lotes, impérios e perfil dos inscritos; nunca invente números. '
    'As ferramentas retornam apenas números agregados: você não tem acesso a nomes, emails, '
    'CPFs ou qualquer dado individual. Se pedirem dados de uma pessoa específica ou uma lista '
    'de pessoas, explique que você só trabalha com números agregados e indique a tela de '
    'Inscritos do painel. Valores em reais devem ser formatados como R$ 1.234,56.'
)

ACTIVE_ENROLLMENT_STATUSES = ['PENDING_PAYMENT', 'PAID']


def build_dashboard_aggregates():
    from .admin_views import build_dashboard_stats

    dashboard = build_dashboard_stats()
    return {key: dashboard[key] for key in DASHBOARD_AGGREGATE_KEYS if key in dashboard}


def count_enrollments(produto=None, lote=None, status=None, forma_pagamento=None,
                      sexo=None, ano_nascimento=None, imperio=None, membro=None):
    """Count enrollments matching the filters, with breakdowns. Never returns individual records."""
    from apps.enrollments.models import Enrollment
    from .admin_views import extract_birth_year, normalize_gender

    queryset = Enrollment.objects.select_related('product', 'batch')
    if status:
        queryset = queryset.filter(status=status)
    else:
        queryset = queryset.filter(status__in=ACTIVE_ENROLLMENT_STATUSES)
    if produto:
        queryset = queryset.filter(product__name__icontains=produto)
    if lote:
        queryset = queryset.filter(batch__name__icontains=lote)
    if forma_pagamento:
        queryset = queryset.filter(payment_method=forma_pagamento)
    if membro:
        queryset = queryset.filter(form_data__membro_batista_capital=membro)

    total = 0
    by_status = {}
    by_payment_method = {}
    by_gender = {'male': 0, 'female': 0, 'unknown': 0}
    final_amount_total = 0
    for enrollment in queryset.iterator():
        form_data = enrollment.form_data or {}
        gender = normalize_gender(form_data) or 'unknown'
        if sexo and gender != sexo:
            continue
        if ano_nascimento and extract_birth_year(form_data.get('data_nascimento')) != ano_nascimento:
            continue
        if imperio and str(form_data.get('imperio_zion') or '').strip().lower() != imperio:
            continue

        total += 1
        by_status[enrollment.status] = by_status.get(enrollment.status, 0) + 1
        method = enrollment.payment_method or 'NAO_SELECIONADA'
        by_payment_method[method] = by_payment_method.get(method, 0) + 1
        by_gender[gender] += 1
        final_amount_total += float(enrollment.final_amount)

    return {
        'total': total,
        'por_status': by_status,
        'por_forma_pagamento': by_payment_method,
        'por_sexo': by_gender,
        'valor_final_total': round(final_amount_total, 2),
    }


def build_overdue_aggregates():
    from apps.payments.models import Payment

    today = timezone.localdate()
    payments = Payment.objects.select_related('enrollment__product').filter(
        due_date__lt=today,
        status__in=['CREATED', 'PENDING', 'OVERDUE'],
        enrollment__status__in=ACTIVE_ENROLLMENT_STATUSES,
    )

    enrollment_ids = set()
    total_amount = 0
    aging = {'ate_7_dias': 0, '8_a_30_dias': 0, 'mais_de_30_dias': 0}
    by_product = {}
    for payment in payments.iterator():
        enrollment_ids.add(payment.enrollment_id)
        total_amount += float(payment.amount)
        days_overdue = (today - payment.due_date).days
        if days_overdue <= 7:
            aging['ate_7_dias'] += 1
        elif days_overdue <= 30:
            aging['8_a_30_dias'] += 1
        else:
            aging['mais_de_30_dias'] += 1
        product_name = payment.enrollment.product.name
        by_product[product_name] = by_product.get(product_name, 0) + 1

    return {
        'inscricoes_com_atraso': len(enrollment_ids),
        'parcelas_atrasadas': sum(aging.values()),
        'valor_total_atrasado': round(total_amount, 2),
        'parcelas_por_tempo_de_atraso': aging,
        'parcelas_por_produto': by_product,
    }


def build_products_and_batches():
    from apps.enrollments.models import Enrollment
    from apps.products.models import Batch

    batches = Batch.objects.select_related('product').order_by('product__name', 'start_date')
    return [
        {
            'produto': batch.product.name,
            'lote': batch.name,
            'status': batch.get_status_display(),
            'vagas': batch.max_enrollments,
            'inscricoes_ativas': Enrollment.objects.filter(
                batch=batch, status__in=ACTIVE_ENROLLMENT_STATUSES,
            ).count(),
        }
        for batch in batches
    ]


@beta_tool
def resumo_geral() -> str:
    """Números gerais do painel: inscrições, pagamentos, receita, membros, sexo, anos de nascimento, impérios, formas de pagamento, lotes e cota social."""
    return json.dumps(build_dashboard_aggregates(), ensure_ascii=False, default=str)


@beta_tool
def contar_inscricoes(
    produto: str | None = None,
    lote: str | None = None,
    status: str | None = None,
    forma_pagamento: str | None = None,
    sexo: str | None = None,
    ano_nascimento: int | None = None,
    imperio: str | None = None,
    membro: str | None = None,
) -> str:
    """Conta inscrições que atendem aos filtros e devolve totais por status, forma de pagamento e sexo. Sem filtro de status, conta só inscrições ativas (aguardando pagamento ou pagas).

    Args:
        produto: Parte do nome do produto/evento.
        lote: Parte do nome do lote.
        status: PENDING_PAYMENT, PAID, CANCELLED ou EXPIRED.
        forma_pagamento: PIX_CASH, PIX_INSTALLMENT ou CREDIT_CARD.
        sexo: male ou female.
        ano_nascimento: Ano de nascimento, ex.: 2010.
        imperio: egito, persia, grecia ou roma.
        membro: sim ou nao (membro da Batista Capital).
    """
    return json.dumps(count_enrollments(
        produto=produto, lote=lote, status=status, forma_pagamento=forma_pagamento,
        sexo=sexo, ano_nascimento=ano_nascimento, imperio=imperio, membro=membro,
    ), ensure_ascii=False)


@beta_tool
def resumo_atrasos() -> str:
    """Pagamentos em atraso: quantas inscrições e parcelas estão atrasadas, valor total e tempo de atraso."""
    return json.dumps(build_overdue_aggregates(), ensure_ascii=False)


@beta_tool
def listar_lotes() -> str:
    """Produtos e lotes com status, vagas e quantidade de inscrições ativas em cada um."""
    return json.dumps(build_products_and_batches(), ensure_ascii=False)


ADMIN_ASSISTANT_TOOLS = [resumo_geral, contar_inscricoes, resumo_atrasos, listar_lotes]


def answer_admin_question(messages):
    client = _get_client()
    _consume_quota()

    def run():
        runner = client.beta.messages.tool_runner(
            model=MODEL,
            max_tokens=1500,
            max_iterations=5,
            system=ADMIN_ASSISTANT_SYSTEM_PROMPT,
            tools=ADMIN_ASSISTANT_TOOLS,
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
