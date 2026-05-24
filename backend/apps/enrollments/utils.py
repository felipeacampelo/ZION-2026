import re
from typing import Optional

from .models import Enrollment


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
