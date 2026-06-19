from decimal import Decimal

from django.db.models import Q, Sum

from apps.payments.models import Payment

from .models import Area, AreaBudget, BudgetRubric, ExpenseExecution, ExpenseRequest, ExtraContribution


def _get_effective_execution_amount(execution):
    if execution.status != ExpenseExecution.STATUS_EXECUTED:
        return Decimal('0')
    if execution.execution_type != ExpenseExecution.TYPE_ADVANCE:
        return Decimal(str(execution.amount))

    if execution.settlement_status in [
        ExpenseExecution.SETTLEMENT_SETTLED,
        ExpenseExecution.SETTLEMENT_MANUALLY_CLOSED,
    ]:
        if execution.spent_amount is not None:
            return Decimal(str(execution.spent_amount))
        returned = Decimal(str(execution.returned_amount or Decimal('0')))
        return max(Decimal(str(execution.amount)) - returned, Decimal('0'))

    return Decimal(str(execution.amount))


def calculate_asaas_fee(payment_amount, payment_method, installments):
    amount = Decimal(str(payment_amount))

    if payment_method in ['PIX', 'PIX_CASH', 'PIX_INSTALLMENT']:
        return Decimal('1.99')
    if payment_method == 'CREDIT_CARD':
        fixed_fee = Decimal('0.49')
        if installments == 1:
            percentage_fee = amount * Decimal('0.0299')
        elif 2 <= installments <= 6:
            percentage_fee = amount * Decimal('0.0249')
        else:
            percentage_fee = amount * Decimal('0.0299')
        return fixed_fee + percentage_fee

    return Decimal('0')


def normalize_installments(installments):
    try:
        parsed = int(installments or 1)
    except (TypeError, ValueError):
        parsed = 1
    return max(parsed, 1)


def resolve_payment_method(payment):
    webhook_data = payment.raw_webhook_data if isinstance(payment.raw_webhook_data, dict) else {}
    created_data = webhook_data.get('created', {}) if isinstance(webhook_data.get('created'), dict) else {}
    webhook_payment = webhook_data.get('payment', {}) if isinstance(webhook_data.get('payment'), dict) else {}

    if payment.pix_qr_code or payment.pix_copy_paste:
        return 'PIX'

    billing_type = webhook_payment.get('billingType') or created_data.get('billingType')
    if billing_type == 'PIX':
        return 'PIX'
    if billing_type == 'CREDIT_CARD':
        return 'CREDIT_CARD'

    return payment.enrollment.payment_method


def get_realized_net_revenue():
    paid_payments = Payment.objects.select_related('enrollment').filter(status__in=['CONFIRMED', 'RECEIVED'])
    total_revenue = Decimal('0')
    total_fees = Decimal('0')

    for payment in paid_payments:
        total_revenue += Decimal(str(payment.amount))
        total_fees += calculate_asaas_fee(
            payment.amount,
            resolve_payment_method(payment),
            normalize_installments(payment.enrollment.installments),
        )

    return {
        'total_revenue': total_revenue,
        'total_fees': total_fees,
        'net_revenue': total_revenue - total_fees,
        'payments_count': paid_payments.count(),
    }


def sum_allocated_area_budgets(excluding_budget_id=None):
    queryset = AreaBudget.objects.all()
    if excluding_budget_id:
        queryset = queryset.exclude(id=excluding_budget_id)
    return queryset.aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0')


def sum_allocated_rubrics(area, excluding_rubric_id=None):
    queryset = BudgetRubric.objects.filter(area=area)
    if excluding_rubric_id:
        queryset = queryset.exclude(id=excluding_rubric_id)
    return queryset.aggregate(total=Sum('allocated_amount'))['total'] or Decimal('0')


def get_area_budget_amount(area):
    return Decimal(str(getattr(getattr(area, 'budget', None), 'allocated_amount', Decimal('0'))))


def get_area_pending_amount(area):
    return (
        ExpenseRequest.objects.filter(area=area, status__in=[ExpenseRequest.STATUS_PENDING, ExpenseRequest.STATUS_UNDER_REVIEW])
        .aggregate(total=Sum('amount'))['total']
        or Decimal('0')
    )


def get_area_committed_amount(area):
    return (
        ExpenseRequest.objects.filter(
            area=area,
            status=ExpenseRequest.STATUS_APPROVED,
        ).filter(
            Q(execution__isnull=True) | Q(execution__status=ExpenseExecution.STATUS_NOT_EXECUTED)
        ).aggregate(total=Sum('amount'))['total']
        or Decimal('0')
    )


def get_rubric_committed_amount(rubric):
    return (
        ExpenseRequest.objects.filter(
            rubric=rubric,
            status=ExpenseRequest.STATUS_APPROVED,
        ).filter(
            Q(execution__isnull=True) | Q(execution__status=ExpenseExecution.STATUS_NOT_EXECUTED)
        ).aggregate(total=Sum('amount'))['total']
        or Decimal('0')
    )


def get_area_executed_amount(area):
    executions = ExpenseExecution.objects.filter(
        expense_request__area=area,
        status=ExpenseExecution.STATUS_EXECUTED,
    )
    return sum((_get_effective_execution_amount(execution) for execution in executions), Decimal('0'))


def get_area_summary(area):
    allocated = get_area_budget_amount(area)
    pending = get_area_pending_amount(area)
    committed = get_area_committed_amount(area)
    executed = get_area_executed_amount(area)
    available = allocated - committed - executed
    return {
        'allocated_amount': allocated,
        'pending_amount': pending,
        'committed_amount': committed,
        'executed_amount': executed,
        'available_amount': available,
    }


def get_rubric_summary(rubric):
    pending = (
        ExpenseRequest.objects.filter(
            rubric=rubric,
            status__in=[ExpenseRequest.STATUS_PENDING, ExpenseRequest.STATUS_UNDER_REVIEW],
        ).aggregate(total=Sum('amount'))['total']
        or Decimal('0')
    )
    committed = get_rubric_committed_amount(rubric)
    executed = sum(
        (
            _get_effective_execution_amount(execution)
            for execution in ExpenseExecution.objects.filter(
                expense_request__rubric=rubric,
                status=ExpenseExecution.STATUS_EXECUTED,
            )
        ),
        Decimal('0'),
    )
    allocated = Decimal(str(rubric.allocated_amount))
    return {
        'allocated_amount': allocated,
        'pending_amount': pending,
        'committed_amount': committed,
        'executed_amount': executed,
        'available_amount': allocated - committed - executed,
    }


def get_extra_contributions_total():
    return ExtraContribution.objects.aggregate(total=Sum('amount'))['total'] or Decimal('0')


def build_finance_report():
    areas_payload = []
    rubrics_payload = []
    advance_settlement = {
        'pending_proof_count': 0,
        'pending_proof_amount': Decimal('0'),
        'pending_return_count': 0,
        'pending_return_amount': Decimal('0'),
    }
    for area in Area.objects.prefetch_related('rubrics').all():
        area_summary = get_area_summary(area)
        areas_payload.append({
            'id': area.id,
            'name': area.name,
            **{key: str(value) for key, value in area_summary.items()},
        })
        for rubric in area.rubrics.all():
            rubric_summary = get_rubric_summary(rubric)
            rubrics_payload.append({
                'id': rubric.id,
                'name': rubric.name,
                'area_id': area.id,
                'area_name': area.name,
                **{key: str(value) for key, value in rubric_summary.items()},
            })
    for execution in ExpenseExecution.objects.filter(
        status=ExpenseExecution.STATUS_EXECUTED,
        execution_type=ExpenseExecution.TYPE_ADVANCE,
    ):
        if execution.settlement_status == ExpenseExecution.SETTLEMENT_PENDING_PROOF:
            advance_settlement['pending_proof_count'] += 1
            advance_settlement['pending_proof_amount'] += Decimal(str(execution.amount))
        if execution.settlement_status == ExpenseExecution.SETTLEMENT_PENDING_RETURN:
            advance_settlement['pending_return_count'] += 1
            advance_settlement['pending_return_amount'] += Decimal(str(execution.returned_amount or Decimal('0')))
    return {
        'areas': areas_payload,
        'rubrics': rubrics_payload,
        'advance_settlement': {key: str(value) if isinstance(value, Decimal) else value for key, value in advance_settlement.items()},
    }
