from __future__ import annotations

from datetime import timedelta, datetime
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.products.models import Product, Batch

from .email_service import (
    send_waitlist_expired_email,
    send_waitlist_invited_email,
    send_waitlist_joined_email,
)
from .models import Enrollment, Settings, WaitlistEntry


RESERVATION_WINDOW_HOURS = 48


def _get_latest_sold_out_batch(product: Product) -> Optional[Batch]:
    now = timezone.now()
    sold_out_batches = product.batches.filter(start_date__lte=now).order_by('-start_date', '-end_date')
    for batch in sold_out_batches:
        batch.sync_status(now)
        if batch.is_full:
            return batch
    return sold_out_batches.first()


def is_waitlist_open_for_product(product: Product) -> bool:
    settings = Settings.get_settings()
    if settings.get_enrollment_window_status() != 'open':
        return False
    if not settings.is_waitlist_publicly_open():
        return False

    product.sync_batch_transitions()
    active_batch = product.get_active_batch()
    if active_batch:
        return False

    return _get_latest_sold_out_batch(product) is not None


def get_waitlist_display_state(product: Product) -> str:
    settings = Settings.get_settings()
    status = settings.get_enrollment_window_status()
    if status != 'open':
        return status

    if product.has_waitlist_demand():
        return 'sold_out_with_waitlist'

    if product.get_active_batch(ignore_waitlist=True):
        return 'open_with_slots'

    if is_waitlist_open_for_product(product):
        return 'sold_out_with_waitlist'

    return 'closed'


def get_batch_snapshot(batch: Optional[Batch]) -> dict:
    if not batch:
        return {}

    return {
        'batch_id': batch.id,
        'name': batch.name,
        'price': str(batch.price),
        'pix_installment_price': str(batch.pix_installment_price),
        'credit_card_price': str(batch.credit_card_price),
        'start_date': batch.start_date.isoformat(),
        'end_date': batch.end_date.isoformat(),
    }


def normalize_waitlist_positions(product: Product) -> None:
    entries = list(
        WaitlistEntry.objects.filter(product=product, status__in=['WAITING', 'INVITED']).order_by('position', 'created_at')
    )
    for index, entry in enumerate(entries, start=1):
        if entry.position != index:
            entry.position = index
            entry.save(update_fields=['position', 'updated_at'])


def build_waitlist_invite_url(token: str) -> str:
    from django.conf import settings

    base_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
    return f'{base_url}/lista-espera/convite/{token}'


@transaction.atomic
def create_waitlist_entry(*, product: Product, user, form_data: dict, coupon_code: str = '') -> WaitlistEntry:
    sold_out_batch = _get_latest_sold_out_batch(product)
    next_position = (
        WaitlistEntry.objects.filter(product=product, status__in=['WAITING', 'INVITED']).count() + 1
    )
    entry = WaitlistEntry.objects.create(
        product=product,
        user=user,
        form_data=form_data,
        coupon_code=(coupon_code or '').strip().upper(),
        position=next_position,
        reference_batch=sold_out_batch,
        batch_snapshot=get_batch_snapshot(sold_out_batch),
    )
    send_waitlist_joined_email(entry)
    return entry


def get_invitable_entry(product: Product) -> Optional[WaitlistEntry]:
    purge_expired_waitlist_reservations(product=product)
    return (
        WaitlistEntry.objects.filter(product=product, status='WAITING')
        .order_by('position', 'created_at')
        .first()
    )


@transaction.atomic
def invite_waitlist_entry(entry: WaitlistEntry, batch: Optional[Batch] = None) -> Optional[Enrollment]:
    if entry.status != 'WAITING':
        return None

    batch = batch or entry.product.get_active_batch(ignore_waitlist=True)
    if not batch:
        return None

    now = timezone.now()
    reservation_expires_at = now + timedelta(hours=RESERVATION_WINDOW_HOURS)
    enrollment = Enrollment.objects.create(
        user=entry.user,
        product=entry.product,
        batch=batch,
        form_data=entry.form_data,
        status='PENDING_PAYMENT',
        source='WAITLIST',
        waitlist_entry=entry,
        pricing_snapshot=entry.batch_snapshot,
        total_amount=batch.price,
        discount_amount=0,
        final_amount=batch.price,
        reservation_expires_at=reservation_expires_at,
    )
    enrollment.issue_reservation_token()
    enrollment.save(update_fields=['reservation_token', 'updated_at'])

    entry.status = 'INVITED'
    entry.invited_at = now
    entry.invite_expires_at = reservation_expires_at
    entry.save(update_fields=['status', 'invited_at', 'invite_expires_at', 'updated_at'])

    send_waitlist_invited_email(entry, enrollment)
    normalize_waitlist_positions(entry.product)
    return enrollment


@transaction.atomic
def extend_waitlist_invite_deadline(entry: WaitlistEntry, expires_at: datetime) -> Optional[Enrollment]:
    if entry.status not in ['INVITED', 'EXPIRED']:
        return None

    now = timezone.now()
    if entry.status == 'INVITED':
        enrollment = (
            Enrollment.objects.filter(
                waitlist_entry=entry,
                source='WAITLIST',
                status='PENDING_PAYMENT',
                reservation_consumed_at__isnull=True,
            )
            .order_by('-created_at')
            .first()
        )
        if not enrollment:
            return None

        enrollment.reservation_expires_at = expires_at
        enrollment.save(update_fields=['reservation_expires_at', 'updated_at'])

        entry.invite_expires_at = expires_at
        entry.save(update_fields=['invite_expires_at', 'updated_at'])
        return enrollment

    batch = entry.product.get_active_batch(ignore_waitlist=True)
    if not batch:
        return None

    enrollment = Enrollment.objects.create(
        user=entry.user,
        product=entry.product,
        batch=batch,
        form_data=entry.form_data,
        status='PENDING_PAYMENT',
        source='WAITLIST',
        waitlist_entry=entry,
        pricing_snapshot=entry.batch_snapshot,
        total_amount=batch.price,
        discount_amount=0,
        final_amount=batch.price,
        reservation_expires_at=expires_at,
    )
    enrollment.issue_reservation_token()
    enrollment.save(update_fields=['reservation_token', 'updated_at'])

    entry.status = 'INVITED'
    entry.invited_at = now
    entry.invite_expires_at = expires_at
    entry.removed_at = None
    entry.removal_reason = ''
    entry.save(update_fields=['status', 'invited_at', 'invite_expires_at', 'removed_at', 'removal_reason', 'updated_at'])

    send_waitlist_invited_email(entry, enrollment)
    normalize_waitlist_positions(entry.product)
    return enrollment


def process_waitlist_for_product(product: Product) -> Optional[Enrollment]:
    settings = Settings.get_settings()
    if not settings.waitlist_auto_invite_enabled:
        return None

    product.sync_batch_transitions()
    first_invitation = None

    while True:
        batch = product.get_active_batch(ignore_waitlist=True)
        if not batch:
            break

        entry = get_invitable_entry(product)
        if not entry:
            break

        enrollment = invite_waitlist_entry(entry, batch=batch)
        if not enrollment:
            break
        if first_invitation is None:
            first_invitation = enrollment

    return first_invitation


@transaction.atomic
def expire_waitlist_reservation(enrollment: Enrollment, reason: str = 'expired') -> None:
    entry = enrollment.waitlist_entry
    if entry:
        entry.status = 'EXPIRED'
        entry.removed_at = timezone.now()
        entry.removal_reason = reason
        entry.save(update_fields=['status', 'removed_at', 'removal_reason', 'updated_at'])
        send_waitlist_expired_email(entry)

    enrollment.delete()

    if entry:
        normalize_waitlist_positions(entry.product)
        process_waitlist_for_product(entry.product)


def purge_expired_waitlist_reservations(product: Optional[Product] = None) -> int:
    queryset = Enrollment.objects.filter(
        source='WAITLIST',
        status='PENDING_PAYMENT',
        reservation_expires_at__isnull=False,
        reservation_expires_at__lt=timezone.now(),
    ).select_related('waitlist_entry', 'product')
    if product is not None:
        queryset = queryset.filter(product=product)

    enrollment_ids = list(queryset.values_list('id', flat=True))
    for enrollment in queryset:
        expire_waitlist_reservation(enrollment)
    return len(enrollment_ids)


def get_reserved_enrollment_by_token(token: str) -> Optional[Enrollment]:
    if not token:
        return None

    purge_expired_waitlist_reservations()
    enrollment = (
        Enrollment.objects.select_related('product', 'batch', 'user', 'waitlist_entry')
        .prefetch_related('payments')
        .filter(reservation_token=token, source='WAITLIST')
        .first()
    )
    if not enrollment or not enrollment.reservation_is_active:
        return None
    return enrollment


@transaction.atomic
def complete_waitlist_conversion(enrollment: Enrollment) -> None:
    if enrollment.waitlist_entry_id:
        WaitlistEntry.objects.filter(pk=enrollment.waitlist_entry_id).update(
            status='CONVERTED',
            converted_at=timezone.now(),
        )
    enrollment.reservation_consumed_at = timezone.now()
    enrollment.save(update_fields=['reservation_consumed_at', 'updated_at'])


@transaction.atomic
def sync_waitlist_entry_conversion(enrollment: Enrollment) -> bool:
    """
    Heal stale waitlist entries when a WAITLIST enrollment advanced outside the
    dedicated invite payment flow.
    """
    if enrollment.source != 'WAITLIST' or not enrollment.waitlist_entry_id:
        return False

    has_paid_payment = enrollment.payments.filter(status__in=['CONFIRMED', 'RECEIVED']).exists()
    if enrollment.status != 'PAID' and not has_paid_payment and enrollment.reservation_consumed_at is None:
        return False

    complete_waitlist_conversion(enrollment)
    return True


@transaction.atomic
def remove_waitlist_entry(entry: WaitlistEntry, reason: str = 'removed') -> None:
    product = entry.product
    entry.status = 'REMOVED'
    entry.removed_at = timezone.now()
    entry.removal_reason = reason
    entry.save(update_fields=['status', 'removed_at', 'removal_reason', 'updated_at'])
    Enrollment.objects.filter(waitlist_entry=entry, source='WAITLIST').delete()
    normalize_waitlist_positions(product)
    process_waitlist_for_product(product)


@transaction.atomic
def reorder_waitlist(product: Product, ordered_ids: list[int]) -> None:
    entries = {
        entry.id: entry
        for entry in WaitlistEntry.objects.filter(product=product, status='WAITING')
    }
    position = 1
    for entry_id in ordered_ids:
        entry = entries.pop(entry_id, None)
        if not entry:
            continue
        if entry.position != position:
            entry.position = position
            entry.save(update_fields=['position', 'updated_at'])
        position += 1

    for entry in sorted(entries.values(), key=lambda current: (current.position, current.created_at)):
        if entry.position != position:
            entry.position = position
            entry.save(update_fields=['position', 'updated_at'])
        position += 1
