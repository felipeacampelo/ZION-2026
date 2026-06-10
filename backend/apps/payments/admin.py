"""
Payments admin configuration.
"""
from django.contrib import admin
from django.contrib import messages
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Admin for Payment model."""
    
    list_display = ['id', 'enrollment_link', 'installment_info', 'amount', 'status_badge', 'due_date', 'paid_at', 'created_at']
    list_filter = ['status', 'created_at', 'due_date']
    search_fields = ['enrollment__user__email', 'asaas_payment_id', 'asaas_subscription_id']
    readonly_fields = ['asaas_payment_id', 'asaas_subscription_id', 'created_at', 'updated_at', 'raw_webhook_data']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        (_('Inscrição'), {
            'fields': ('enrollment',)
        }),
        (_('Asaas'), {
            'fields': ('asaas_payment_id', 'asaas_subscription_id')
        }),
        (_('Detalhes do Pagamento'), {
            'fields': ('installment_number', 'amount', 'status', 'due_date', 'paid_at')
        }),
        (_('Informações de Pagamento'), {
            'fields': ('payment_url', 'pix_qr_code', 'pix_copy_paste'),
            'classes': ('collapse',)
        }),
        (_('Webhook Data'), {
            'fields': ('raw_webhook_data',),
            'classes': ('collapse',)
        }),
        (_('Datas'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    actions = ['mark_as_confirmed', 'cancel_payments', 'reissue_selected_pix_payments', 'sync_selected_with_asaas']
    
    def enrollment_link(self, obj):
        """Display enrollment with link."""
        url = reverse('admin:enrollments_enrollment_change', args=[obj.enrollment.id])
        return format_html(
            '<a href="{}">#{}</a><br><small style="color: gray;">{}</small>',
            url,
            obj.enrollment.id,
            obj.enrollment.user.email
        )
    enrollment_link.short_description = _('Inscrição')
    
    def installment_info(self, obj):
        """Display installment information."""
        total = obj.enrollment.installments
        if total > 1:
            return format_html(
                '<strong>{}/{}</strong>',
                obj.installment_number,
                total
            )
        return format_html('<span style="color: green;">À vista</span>')
    installment_info.short_description = _('Parcela')
    
    def status_badge(self, obj):
        """Display status with color badge."""
        colors = {
            'CREATED': 'gray',
            'PENDING': 'orange',
            'CONFIRMED': 'blue',
            'RECEIVED': 'green',
            'OVERDUE': 'red',
            'REFUNDED': 'purple',
            'CANCELLED': 'darkgray',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = _('Status')
    
    def mark_as_confirmed(self, request, queryset):
        """Mark selected payments as confirmed."""
        from django.utils import timezone
        updated = 0
        for payment in queryset.filter(status__in=['CREATED', 'PENDING']):
            payment.status = 'CONFIRMED'
            payment.paid_at = timezone.now()
            payment.save()
            
            # Update enrollment if all payments are confirmed
            enrollment = payment.enrollment
            all_paid = all(p.is_paid for p in enrollment.payments.all())
            if all_paid and enrollment.status != 'PAID':
                enrollment.status = 'PAID'
                enrollment.paid_at = timezone.now()
                enrollment.save()
            
            updated += 1
        
        self.message_user(request, f'{updated} pagamento(s) confirmado(s).')
    mark_as_confirmed.short_description = _('Marcar como confirmado')
    
    def cancel_payments(self, request, queryset):
        """Cancel selected payments."""
        updated = queryset.filter(status__in=['CREATED', 'PENDING']).update(status='CANCELLED')
        self.message_user(request, f'{updated} pagamento(s) cancelado(s).')
    cancel_payments.short_description = _('Cancelar pagamentos')

    def reissue_selected_pix_payments(self, request, queryset):
        """Recreate selected cancelled PIX payments with fresh QR codes."""
        from apps.payments.services import PaymentService

        payments = queryset.filter(status='CANCELLED').order_by('enrollment_id', 'installment_number')
        if not payments.exists():
            self.message_user(request, 'Nenhum pagamento cancelado foi selecionado.')
            return

        enrollment_ids = list(payments.values_list('enrollment_id', flat=True).distinct())
        if len(enrollment_ids) != 1:
            self.message_user(request, 'Selecione apenas pagamentos da mesma inscrição.')
            return

        service = PaymentService()
        recreated = 0

        for index, payment in enumerate(payments):
            due_date = timezone.now().date() + timedelta(days=3 + 30 * index)
            try:
                service.recreate_pix_payment(payment, due_date=due_date)
            except Exception as exc:
                self.message_user(
                    request,
                    f'Erro ao recriar o PIX da parcela {payment.installment_number}: {exc}',
                    level=messages.ERROR
                )
                return
            recreated += 1

        enrollment = payments.first().enrollment
        if enrollment.status != 'PAID':
            enrollment.status = 'PENDING_PAYMENT'
            enrollment.save(update_fields=['status', 'updated_at'])

        self.message_user(request, f'{recreated} cobrança(s) PIX recriada(s) para a inscrição #{enrollment.id}.')
    reissue_selected_pix_payments.short_description = _('Recriar PIX selecionados')

    def sync_selected_with_asaas(self, request, queryset):
        """Refresh selected payments using the current status from Asaas."""
        from apps.payments.services.asaas_service import AsaasService

        status_mapping = {
            'PENDING': 'PENDING',
            'RECEIVED': 'RECEIVED',
            'CONFIRMED': 'CONFIRMED',
            'OVERDUE': 'OVERDUE',
            'REFUNDED': 'REFUNDED',
            'RECEIVED_IN_CASH': 'RECEIVED',
            'REFUND_REQUESTED': 'REFUNDED',
        }

        asaas = AsaasService()
        updated = 0
        unchanged = 0

        for payment in queryset.select_related('enrollment'):
            if not payment.asaas_payment_id:
                self.message_user(
                    request,
                    f'Pagamento #{payment.id} não possui asaas_payment_id.',
                    level=messages.WARNING
                )
                continue

            try:
                asaas_payment = asaas.get_payment(payment.asaas_payment_id)
            except Exception as exc:
                self.message_user(
                    request,
                    f'Erro ao sincronizar pagamento #{payment.id}: {exc}',
                    level=messages.ERROR
                )
                continue

            gateway_status = asaas_payment.get('status', 'PENDING')
            mapped_status = status_mapping.get(gateway_status, gateway_status)
            old_status = payment.status
            changed = old_status != mapped_status

            payment.status = mapped_status
            payment.raw_webhook_data = {
                **(payment.raw_webhook_data or {}),
                'manual_sync': asaas_payment,
            }

            if mapped_status in ['CONFIRMED', 'RECEIVED'] and not payment.paid_at:
                payment.paid_at = timezone.now()

            payment.save()

            enrollment = payment.enrollment
            total_payments = enrollment.payments.count()
            paid_payments = enrollment.payments.filter(status__in=['CONFIRMED', 'RECEIVED']).count()

            if total_payments > 0 and paid_payments == total_payments and enrollment.status != 'PAID':
                enrollment.status = 'PAID'
                if not enrollment.paid_at:
                    enrollment.paid_at = timezone.now()
                enrollment.save()

            if changed:
                updated += 1
            else:
                unchanged += 1

        if updated:
            self.message_user(request, f'{updated} pagamento(s) sincronizado(s) com o Asaas.')
        if unchanged:
            self.message_user(request, f'{unchanged} pagamento(s) já estavam atualizados.', level=messages.INFO)
    sync_selected_with_asaas.short_description = _('Sincronizar com Asaas')
