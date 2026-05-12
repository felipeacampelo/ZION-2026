"""
Enrollments admin configuration.
"""
from datetime import timedelta
from django.contrib import admin
from django.contrib import messages
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from .models import (
    Coupon,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailTemplate,
    Enrollment,
    Settings,
)


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    """Admin for Enrollment model."""
    
    list_display = ['id', 'user_info', 'product', 'batch', 'status_badge', 'payment_method_display', 'final_amount', 'installments', 'shirt_size', 'pg_leader', 'created_at']
    list_filter = ['status', 'payment_method', 'batch__product', 'created_at']
    search_fields = ['user__email', 'user__first_name', 'user__last_name', 'product__name']
    readonly_fields = ['created_at', 'updated_at', 'paid_at', 'total_amount', 'discount_amount', 'final_amount']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        (_('Usuário e Produto'), {
            'fields': ('user', 'product', 'batch')
        }),
        (_('Dados do Formulário'), {
            'fields': ('form_data',),
            'classes': ('collapse',)
        }),
        (_('Pagamento'), {
            'fields': ('payment_method', 'installments', 'total_amount', 'discount_amount', 'final_amount')
        }),
        (_('Status'), {
            'fields': ('status', 'paid_at')
        }),
        (_('Observações do Admin'), {
            'fields': ('admin_notes',)
        }),
        (_('Datas'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    actions = ['mark_as_paid', 'cancel_enrollments', 'export_to_csv', 'reissue_cancelled_pix_installments']
    
    def user_info(self, obj):
        """Display user information with link."""
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html(
            '<a href="{}">{}</a><br><small style="color: gray;">{}</small>',
            url,
            obj.user.get_full_name() or obj.user.email,
            obj.user.email
        )
    user_info.short_description = _('Usuário')
    
    def status_badge(self, obj):
        """Display status with color badge."""
        colors = {
            'PENDING_PAYMENT': 'orange',
            'PAID': 'green',
            'CANCELLED': 'red',
            'EXPIRED': 'gray',
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = _('Status')
    
    def payment_method_display(self, obj):
        """Display payment method with icon."""
        if not obj.payment_method:
            return '-'
        
        icons = {
            'PIX_CASH': '💰',
            'PIX_INSTALLMENT': '📅',
            'CREDIT_CARD': '💳',
        }
        icon = icons.get(obj.payment_method, '')
        return format_html(
            '{} {}',
            icon,
            obj.get_payment_method_display()
        )
    payment_method_display.short_description = _('Método')
    
    def shirt_size(self, obj):
        """Display shirt size from form_data."""
        return obj.form_data.get('tamanho_camiseta', '-')
    shirt_size.short_description = _('Camiseta')
    
    def pg_leader(self, obj):
        """Display PG leader from form_data."""
        return obj.form_data.get('lider_pg', '-')
    pg_leader.short_description = _('Líder PG')
    
    def mark_as_paid(self, request, queryset):
        """Mark selected enrollments as paid."""
        updated = queryset.filter(status='PENDING_PAYMENT').update(
            status='PAID',
            paid_at=timezone.now()
        )
        self.message_user(request, f'{updated} inscrição(ões) marcada(s) como paga(s).')
    mark_as_paid.short_description = _('Marcar como pago')
    
    def cancel_enrollments(self, request, queryset):
        """Cancel selected enrollments."""
        updated = queryset.exclude(status='CANCELLED').update(status='CANCELLED')
        self.message_user(request, f'{updated} inscrição(ões) cancelada(s).')
    cancel_enrollments.short_description = _('Cancelar inscrições')
    
    def export_to_csv(self, request, queryset):
        """Export enrollments to CSV with all form data."""
        import csv
        from django.http import HttpResponse
        
        response = HttpResponse(content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = 'attachment; filename="inscricoes.csv"'
        
        writer = csv.writer(response)
        # Header with all fields
        writer.writerow([
            'ID', 'Nome Completo', 'Email', 'Telefone', 'CPF', 'RG',
            'Data Nascimento', 'Tamanho Camiseta', 'Membro Batista Capital',
            'Igreja', 'Líder PG', 'Produto', 'Lote', 'Status',
            'Método Pagamento', 'Parcelas', 'Valor Total', 'Desconto',
            'Valor Final', 'Data Inscrição', 'Data Pagamento'
        ])
        
        for enrollment in queryset:
            form_data = enrollment.form_data
            writer.writerow([
                enrollment.id,
                form_data.get('nome_completo', ''),
                form_data.get('email', ''),
                form_data.get('telefone', ''),
                form_data.get('cpf', ''),
                form_data.get('rg', ''),
                form_data.get('data_nascimento', ''),
                form_data.get('tamanho_camiseta', ''),
                form_data.get('membro_batista_capital', ''),
                form_data.get('igreja', ''),
                form_data.get('lider_pg', ''),
                enrollment.product.name,
                enrollment.batch.name,
                enrollment.get_status_display(),
                enrollment.get_payment_method_display() if enrollment.payment_method else '',
                enrollment.installments or '',
                enrollment.total_amount,
                enrollment.discount_amount,
                enrollment.final_amount,
                enrollment.created_at.strftime('%d/%m/%Y %H:%M'),
                enrollment.paid_at.strftime('%d/%m/%Y %H:%M') if enrollment.paid_at else ''
            ])
        
        return response
    export_to_csv.short_description = _('Exportar para CSV')

    def reissue_cancelled_pix_installments(self, request, queryset):
        """Recreate cancelled PIX installments for the selected enrollments."""
        from apps.payments.services import PaymentService

        service = PaymentService()
        recreated = 0
        skipped = 0

        for enrollment in queryset:
            cancelled_payments = enrollment.payments.filter(status='CANCELLED').order_by('installment_number')
            if not cancelled_payments.exists():
                skipped += 1
                continue

            for index, payment in enumerate(cancelled_payments):
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

            if enrollment.status != 'PAID':
                enrollment.status = 'PENDING_PAYMENT'
                enrollment.save(update_fields=['status', 'updated_at'])

        self.message_user(
            request,
            f'{recreated} cobrança(s) PIX recriada(s). {skipped} inscrição(ões) sem parcelas canceladas foram ignoradas.'
        )
    reissue_cancelled_pix_installments.short_description = _('Recriar parcelas PIX canceladas')


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    """Admin for Coupon model."""
    
    list_display = ['code', 'discount_display', 'max_installments_display', 'active_badge', 'uses_display', 'valid_period', 'created_at']
    list_filter = ['active', 'discount_type', 'enable_12x_installments', 'created_at']
    search_fields = ['code', 'description']
    readonly_fields = ['uses_count', 'created_at', 'updated_at']
    filter_horizontal = ['products']
    actions = ['bulk_set_discount_value', 'bulk_set_max_installments']
    
    fieldsets = (
        (_('Informações Básicas'), {
            'fields': ('code', 'description', 'active')
        }),
        (_('Desconto'), {
            'fields': ('discount_type', 'discount_value', 'max_discount')
        }),
        (_('Parcelamento'), {
            'fields': ('enable_12x_installments', 'max_installments'),
            'description': 'Se "Habilitar Parcelamento Especial" estiver marcado, o cliente poderá parcelar até o valor definido em "Máximo de Parcelas"'
        }),
        (_('Restrições'), {
            'fields': ('min_purchase', 'max_uses', 'uses_count', 'products')
        }),
        (_('Validade'), {
            'fields': ('valid_from', 'valid_until')
        }),
        (_('Datas'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def discount_display(self, obj):
        """Display discount with formatting."""
        return obj.get_discount_display()
    discount_display.short_description = _('Desconto')
    
    def active_badge(self, obj):
        """Display active status with badge."""
        is_valid, _ = obj.is_valid()
        if is_valid:
            return format_html(
                '<span style="background-color: green; color: white; padding: 3px 10px; border-radius: 3px;">✓ Ativo</span>'
            )
        return format_html(
            '<span style="background-color: red; color: white; padding: 3px 10px; border-radius: 3px;">✗ Inativo</span>'
        )
    active_badge.short_description = _('Status')
    
    def uses_display(self, obj):
        """Display usage count."""
        if obj.max_uses:
            return f'{obj.uses_count}/{obj.max_uses}'
        return f'{obj.uses_count}/∞'
    uses_display.short_description = _('Usos')
    
    def valid_period(self, obj):
        """Display validity period."""
        return format_html(
            '{}<br><small style="color: gray;">até {}</small>',
            obj.valid_from.strftime('%d/%m/%Y'),
            obj.valid_until.strftime('%d/%m/%Y')
        )
    valid_period.short_description = _('Período')
    
    def max_installments_display(self, obj):
        """Display max installments."""
        if obj.enable_12x_installments:
            return format_html(
                '<span style="background-color: #8b5cf6; color: white; padding: 2px 8px; border-radius: 3px;">{}</span>',
                f'{obj.max_installments}x'
            )
        return format_html(
            '<span style="color: gray;">6x (padrão)</span>'
        )
    max_installments_display.short_description = _('Parcelas')
    
    @admin.action(description=_('Alterar valor de desconto dos cupons selecionados'))
    def bulk_set_discount_value(self, request, queryset):
        """Bulk action to set discount value for selected coupons."""
        from django import forms
        from django.shortcuts import render
        from django.http import HttpResponseRedirect
        
        class DiscountForm(forms.Form):
            discount_value = forms.DecimalField(
                label='Novo valor de desconto',
                max_digits=10,
                decimal_places=2,
                min_value=0,
                help_text='Porcentagem (0-100) ou valor fixo em R$'
            )
        
        if 'apply' in request.POST:
            form = DiscountForm(request.POST)
            if form.is_valid():
                discount_value = form.cleaned_data['discount_value']
                updated = queryset.update(discount_value=discount_value)
                self.message_user(request, f'{updated} cupom(ns) atualizado(s) com desconto de {discount_value}.')
                return HttpResponseRedirect(request.get_full_path())
        else:
            form = DiscountForm()
        
        return render(request, 'admin/bulk_edit_form.html', {
            'title': 'Alterar Valor de Desconto',
            'objects': queryset,
            'form': form,
            'action': 'bulk_set_discount_value',
            'field_name': 'valor de desconto',
        })
    
    @admin.action(description=_('Alterar máximo de parcelas dos cupons selecionados'))
    def bulk_set_max_installments(self, request, queryset):
        """Bulk action to set max installments for selected coupons."""
        from django import forms
        from django.shortcuts import render
        from django.http import HttpResponseRedirect
        
        class InstallmentsForm(forms.Form):
            max_installments = forms.IntegerField(
                label='Novo máximo de parcelas',
                min_value=1,
                max_value=12,
                help_text='Número máximo de parcelas (1-12)'
            )
            enable_special = forms.BooleanField(
                label='Habilitar parcelamento especial',
                required=False,
                initial=True,
                help_text='Marque para ativar o parcelamento especial nos cupons selecionados'
            )
        
        if 'apply' in request.POST:
            form = InstallmentsForm(request.POST)
            if form.is_valid():
                max_installments = form.cleaned_data['max_installments']
                enable_special = form.cleaned_data['enable_special']
                updated = queryset.update(
                    max_installments=max_installments,
                    enable_12x_installments=enable_special
                )
                self.message_user(request, f'{updated} cupom(ns) atualizado(s) com máximo de {max_installments}x parcelas.')
                return HttpResponseRedirect(request.get_full_path())
        else:
            form = InstallmentsForm()
        
        return render(request, 'admin/bulk_edit_form.html', {
            'title': 'Alterar Máximo de Parcelas',
            'objects': queryset,
            'form': form,
            'action': 'bulk_set_max_installments',
            'field_name': 'máximo de parcelas',
        })


@admin.register(Settings)
class SettingsAdmin(admin.ModelAdmin):
    """Admin for Settings model."""
    
    def has_add_permission(self, request):
        """Prevent adding new settings (singleton pattern)."""
        return False
    
    def has_delete_permission(self, request, obj=None):
        """Prevent deleting settings."""
        return False
    
    fieldsets = (
        (_('Disponibilidade'), {
            'fields': ('enable_pix_cash', 'enable_pix_installment', 'enable_credit_card', 'enable_shirt_size_field'),
            'description': 'Controla opções visíveis para novas inscrições e novos pagamentos'
        }),
        (_('Parcelamento Padrão'), {
            'fields': ('max_installments',),
            'description': 'Máximo de parcelas permitidas sem cupom especial'
        }),
        (_('Parcelamento com Cupom'), {
            'fields': ('max_installments_with_coupon',),
            'description': 'Máximo de parcelas permitidas quando cupom especial é aplicado'
        }),
        (_('Campos do Formulário'), {
            'fields': ('form_fields_config',),
            'description': 'Configuração estruturada de exibição e obrigatoriedade dos campos'
        }),
    )
    
    readonly_fields = ['updated_at']


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'key', 'is_active', 'updated_at']
    list_filter = ['is_active', 'key']
    search_fields = ['name', 'key', 'subject']
    readonly_fields = ['created_at', 'updated_at']


class EmailCampaignRecipientInline(admin.TabularInline):
    model = EmailCampaignRecipient
    extra = 0
    can_delete = False
    readonly_fields = ['email', 'name', 'status', 'error_message', 'sent_at', 'enrollment']


@admin.register(EmailCampaign)
class EmailCampaignAdmin(admin.ModelAdmin):
    list_display = ['name', 'status', 'recipient_count', 'sent_count', 'failed_count', 'created_by', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['name', 'subject']
    readonly_fields = ['recipient_count', 'sent_count', 'failed_count', 'started_at', 'finished_at', 'created_at', 'updated_at']
    inlines = [EmailCampaignRecipientInline]
