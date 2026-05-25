import re
from decimal import Decimal
from typing import Optional

from .models import Enrollment

SOCIAL_QUOTA_COUPON_PREFIX = 'COTASOCIAL'
CONFIRMED_PAYMENT_STATUSES = {'CONFIRMED', 'RECEIVED'}


def normalize_digits(value: Optional[str]) -> str:
    if value is None:
        return ''
    return re.sub(r'\D', '', str(value))


def find_duplicate_enrollment_by_cpf(*, product, cpf: str, exclude_enrollment_id: Optional[int] = None):
    normalized_cpf = normalize_digits(cpf)
    if not normalized_cpf:
        return None

    queryset = Enrollment.objects.filter(product=product)
    if exclude_enrollment_id:
        queryset = queryset.exclude(id=exclude_enrollment_id)

    for enrollment in queryset.only('id', 'form_data', 'product'):
        enrollment_cpf = normalize_digits((enrollment.form_data or {}).get('cpf'))
        if enrollment_cpf and enrollment_cpf == normalized_cpf:
            return enrollment

    return None


def is_social_quota_coupon(code: Optional[str]) -> bool:
    if not code:
        return False
    return str(code).strip().upper().startswith(SOCIAL_QUOTA_COUPON_PREFIX)


def is_social_quota_enrollment(enrollment: Enrollment) -> bool:
    coupon = getattr(enrollment, 'coupon', None)
    if coupon is None:
        return False
    return is_social_quota_coupon(getattr(coupon, 'code', ''))


def build_social_quota_summary(enrollment: Enrollment) -> dict:
    payments = getattr(enrollment, '_prefetched_objects_cache', {}).get('payments')
    if payments is None:
        payments = enrollment.payments.all()

    contributions = getattr(enrollment, '_prefetched_objects_cache', {}).get('social_quota_contributions')
    if contributions is None:
        contributions = enrollment.social_quota_contributions.all()

    paid_amount = sum(
        (Decimal(str(payment.amount)) for payment in payments if payment.status in CONFIRMED_PAYMENT_STATUSES),
        Decimal('0.00'),
    )
    raised_amount = sum(
        (Decimal(str(contribution.amount)) for contribution in contributions),
        Decimal('0.00'),
    )
    goal_amount = Decimal(str(enrollment.final_amount or '0.00'))
    total_progress = paid_amount + raised_amount
    remaining_amount = max(goal_amount - total_progress, Decimal('0.00'))

    return {
        'is_social_quota': is_social_quota_enrollment(enrollment),
        'social_coupon_code': getattr(getattr(enrollment, 'coupon', None), 'code', '') or '',
        'social_goal_amount': str(goal_amount),
        'social_paid_amount': str(paid_amount),
        'social_raised_amount': str(raised_amount),
        'social_total_progress': str(total_progress),
        'social_remaining_amount': str(remaining_amount),
        'social_is_completed': total_progress >= goal_amount and goal_amount > Decimal('0.00'),
    }
