"""
Enrollments admin configuration.
"""
from datetime import timedelta
from decimal import Decimal
from django.contrib import admin
from django.contrib import messages
from django.http import HttpResponseRedirect
from django import forms
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html
from django.urls import reverse
from django.utils import timezone
from django.shortcuts import render
from .waitlist_service import invite_waitlist_entry, remove_waitlist_entry
from .models import (
    Coupon,
    EmailCampaign,
    EmailCampaignRecipient,
    EmailTemplate,
    Enrollment,
    Settings,
    WaitlistEntry,
)


def extract_enrollment_gender(form_data):
    if not isinstance(form_data, dict):
        return ''
    return str(form_data.get('sexo') or '').strip()


def update_enrollment_gender(form_data, gender):
    normalized_form_data = dict(form_data or {})
    if gender:
        normalized_form_data['sexo'] = gender
    else:
        normalized_form_data.pop('sexo', None)
    return normalized_form_data


class EnrollmentAdminForm(forms.ModelForm):
    financial_fields = {'coupon', 'payment_method', 'installments', 'batch'}
    GENDER_CHOICES = (
        ('', '---------'),
        ('Masculino', 'Masculino'),
        ('Feminino', 'Feminino'),
    )

    sexo = forms.ChoiceField(
        label='Sexo',
        choices=GENDER_CHOICES,
        required=False,
    )

    class Meta:
        model = Enrollment
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['sexo'].initial = extract_enrollment_gender(self.instance.form_data)

    def clean(self):
        cleaned_data = super().clean()
        if self.instance.pk and any(field in self.changed_data for field in self.financial_fields):
            payments = self.instance.payments.exclude(status__in=['CANCELLED', 'REFUNDED'])
            if payments.filter(status__in=['CONFIRMED', 'RECEIVED']).exists():
                raise forms.ValidationError(
                    'Não é possível alterar cupom, lote ou forma de pagamento após pagamento confirmado para esta inscrição.'
                )

            if payments.exclude(status__in=['CREATED', 'PENDING']).exists():
                raise forms.ValidationError(
                    'Só é possível alterar cupom ou valores quando as cobranças existentes ainda estiverem em aberto.'
                )

        coupon = cleaned_data.get('coupon')
        product = cleaned_data.get('product') or self.instance.product
        batch = cleaned_data.get('batch') or self.instance.batch
        payment_method = cleaned_data.get('payment_method') or self.instance.payment_method
        installments = cleaned_data.get('installments') or self.instance.installments or 1

        if not batch:
            return cleaned_data

        pricing_source = self.instance.pricing_snapshot if isinstance(self.instance.pricing_snapshot, dict) else {}
        pix_cash_price = Decimal(str(pricing_source.get('price', batch.price)))
        pix_installment_price = Decimal(str(pricing_source.get('pix_installment_price', batch.pix_installment_price)))
        credit_card_price = Decimal(str(pricing_source.get('credit_card_price', batch.credit_card_price)))

        if payment_method == 'PIX_INSTALLMENT':
            total_amount = pix_installment_price
        elif payment_method == 'CREDIT_CARD':
            total_amount = credit_card_price
        else:
            total_amount = pix_cash_price

        if coupon:
            is_valid, message = coupon.is_valid()
            if not is_valid:
                self.add_error('coupon', message)
                return cleaned_data

            if product and not coupon.can_apply_to_product(product):
                self.add_error('coupon', 'Este cupom não é válido para este produto.')
                return cleaned_data

            can_apply_payment, payment_message = coupon.can_apply_to_payment(payment_method, installments)
            if not can_apply_payment:
                self.add_error('coupon', payment_message)
                return cleaned_data

            if total_amount < coupon.min_purchase:
                self.add_error('coupon', f'Valor mínimo para este cupom é R$ {coupon.min_purchase}.')

        return cleaned_data

    def save(self, commit=True):
        instance = super().save(commit=False)
        sexo = self.cleaned_data.get('sexo')
        instance.form_data = update_enrollment_gender(instance.form_data, sexo)

        if commit:
            instance.save()
            self.save_m2m()

        return instance


class EnrollmentGenderFilter(admin.SimpleListFilter):
    title = _('Sexo')
    parameter_name = 'sexo'

    def lookups(self, request, model_admin):
        return (
            ('Masculino', _('Masculino')),
            ('Feminino', _('Feminino')),
            ('missing', _('Sem sexo informado')),
        )

    def queryset(self, request, queryset):
        value = self.value()
        if value == 'Masculino':
            return queryset.filter(form_data__sexo='Masculino')
        if value == 'Feminino':
            return queryset.filter(form_data__sexo='Feminino')
        if value == 'missing':
            return queryset.exclude(form_data__sexo__in=['Masculino', 'Feminino'])
        return queryset


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    """Admin for Enrollment model."""

    form = EnrollmentAdminForm
    list_display = ['id', 'participant_info', 'gender_badge', 'product', 'batch', 'status_badge', 'payment_method_display', 'final_amount', 'installments', 'shirt_size', 'pg_leader', 'created_at']
    list_filter = ['status', 'payment_method', 'batch__product', EnrollmentGenderFilter, 'created_at']
    search_fields = ['form_data__nome_completo', 'user__email', 'user__first_name', 'user__last_name', 'product__name']
    readonly_fields = ['created_at', 'updated_at', 'paid_at', 'total_amount', 'discount_amount', 'final_amount']
    date_hierarchy = 'created_at'
    
    fieldsets = (
        (_('Usuário e Produto'), {
            'fields': ('user', 'product', 'batch')
        }),
        (_('Dados principais'), {
            'fields': ('sexo',)
        }),
        (_('Dados do Formulário'), {
            'fields': ('form_data',),
            'classes': ('collapse',)
        }),
        (_('Pagamento'), {
            'fields': ('payment_method', 'installments', 'coupon', 'total_amount', 'discount_amount', 'final_amount')
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
    
    actions = ['mark_as_paid', 'cancel_enrollments', 'bulk_set_gender', 'export_to_csv', 'reissue_cancelled_pix_installments']

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = list(super().get_readonly_fields(request, obj))
        if obj and obj.payments.filter(status__in=['CONFIRMED', 'RECEIVED']).exists():
            readonly_fields.extend(['coupon', 'payment_method', 'installments', 'batch'])
        return readonly_fields

    def save_model(self, request, obj, form, change):
        previous_enrollment = Enrollment.objects.filter(pk=obj.pk).select_related('coupon').first() if change else None
        financial_fields_changed = any(
            field in form.changed_data for field in EnrollmentAdminForm.financial_fields
        )

        if previous_enrollment and financial_fields_changed:
            from apps.payments.services import PaymentService

            payments_to_cancel = list(
                previous_enrollment.payments.filter(status__in=['CREATED', 'PENDING']).order_by('installment_number')
            )
            if payments_to_cancel:
                service = PaymentService()
                for payment in payments_to_cancel:
                    service.cancel_payment(payment)
                self.message_user(
                    request,
                    f'{len(payments_to_cancel)} cobrança(s) pendente(s) foram canceladas para recalcular a inscrição.',
                    level=messages.WARNING,
                )

        obj.calculate_amounts()
        super().save_model(request, obj, form, change)

        previous_coupon = previous_enrollment.coupon if previous_enrollment else None
        current_coupon = obj.coupon

        if previous_coupon and previous_coupon != current_coupon and previous_coupon.uses_count > 0:
            previous_coupon.uses_count -= 1
            previous_coupon.save(update_fields=['uses_count'])

        if current_coupon and previous_coupon != current_coupon:
            current_coupon.increment_uses()
    
    def participant_info(self, obj):
        """Display participant name and the account email linked to the enrollment."""
        url = reverse('admin:users_user_change', args=[obj.user.id])
        return format_html(
            '<a href="{}">{}</a><br><small style="color: gray;">{}</small>',
            url,
            obj.participant_name,
            obj.user.email
        )
    participant_info.short_description = _('Inscrito')
    
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

    def gender_badge(self, obj):
        gender = extract_enrollment_gender(obj.form_data)
        if gender == 'Masculino':
            return format_html(
                '<span style="background-color: #dbeafe; color: #1d4ed8; padding: 3px 10px; border-radius: 999px;">Masculino</span>'
            )
        if gender == 'Feminino':
            return format_html(
                '<span style="background-color: #fce7f3; color: #be185d; padding: 3px 10px; border-radius: 999px;">Feminino</span>'
            )
        return format_html(
            '<span style="background-color: #fef3c7; color: #92400e; padding: 3px 10px; border-radius: 999px;">Falta informar</span>'
        )
    gender_badge.short_description = _('Sexo')
    
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

    @admin.action(description=_('Definir sexo das inscrições selecionadas'))
    def bulk_set_gender(self, request, queryset):
        class GenderBulkForm(forms.Form):
            sexo = forms.ChoiceField(
                label='Sexo para aplicar',
                choices=EnrollmentAdminForm.GENDER_CHOICES[1:],
                required=True,
            )

        if 'apply' in request.POST:
            form = GenderBulkForm(request.POST)
            if form.is_valid():
                sexo = form.cleaned_data['sexo']
                updated = 0
                for enrollment in queryset.iterator():
                    updated_form_data = update_enrollment_gender(enrollment.form_data, sexo)
                    if updated_form_data == (enrollment.form_data or {}):
                        continue
                    enrollment.form_data = updated_form_data
                    enrollment.save(update_fields=['form_data', 'updated_at'])
                    updated += 1

                self.message_user(request, f'{updated} inscrição(ões) atualizada(s) com sexo {sexo}.')
                return HttpResponseRedirect(request.get_full_path())
        else:
            form = GenderBulkForm()

        return render(request, 'admin/bulk_edit_form.html', {
            'title': 'Definir sexo das inscrições',
            'objects': queryset,
            'form': form,
            'action': 'bulk_set_gender',
            'field_name': 'sexo',
            'object_name_plural': 'inscrições',
            'cancel_url': request.get_full_path(),
        })
    
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
            'Valor Final', 'Observações', 'Data Inscrição', 'Data Pagamento'
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
                form_data.get('observacoes', ''),
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


@admin.register(WaitlistEntry)
class WaitlistEntryAdmin(admin.ModelAdmin):
    """Admin for waitlist entries."""

    list_display = [
        'id',
        'attendee_name',
        'attendee_email',
        'product',
        'status_badge',
        'position',
        'reference_batch',
        'coupon_code',
        'invited_at',
        'invite_expires_at',
        'created_at',
    ]
    list_filter = ['status', 'product', 'reference_batch', 'created_at']
    search_fields = ['form_data', 'user__email', 'user__first_name', 'user__last_name', 'product__name', 'coupon_code']
    readonly_fields = [
        'created_at',
        'updated_at',
        'invited_at',
        'invite_expires_at',
        'converted_at',
        'removed_at',
    ]
    actions = ['invite_selected_entries', 'remove_selected_entries']

    fieldsets = (
        (_('Participante'), {
            'fields': ('user', 'product', 'status', 'position')
        }),
        (_('Dados da Pré-inscrição'), {
            'fields': ('form_data', 'coupon_code')
        }),
        (_('Referência Comercial'), {
            'fields': ('reference_batch', 'batch_snapshot'),
            'classes': ('collapse',)
        }),
        (_('Convocação'), {
            'fields': ('invited_at', 'invite_expires_at', 'converted_at')
        }),
        (_('Remoção'), {
            'fields': ('removed_at', 'removal_reason')
        }),
        (_('Datas'), {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def attendee_name(self, obj):
        return obj.form_data.get('nome_completo') or obj.user.get_full_name() or '-'
    attendee_name.short_description = _('Nome')

    def attendee_email(self, obj):
        return obj.form_data.get('email') or obj.user.email or '-'
    attendee_email.short_description = _('Email')

    def status_badge(self, obj):
        colors = {
            'WAITING': '#b45309',
            'INVITED': '#1d4ed8',
            'CONVERTED': '#15803d',
            'EXPIRED': '#6b7280',
            'REMOVED': '#b91c1c',
        }
        color = colors.get(obj.status, '#6b7280')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; border-radius: 3px;">{}</span>',
            color,
            obj.get_status_display()
        )
    status_badge.short_description = _('Status')

    def invite_selected_entries(self, request, queryset):
        invited = 0
        skipped = 0

        for entry in queryset.select_related('product'):
            enrollment = invite_waitlist_entry(entry)
            if enrollment:
                invited += 1
            else:
                skipped += 1

        if invited:
            self.message_user(request, f'{invited} entrada(s) da fila convocada(s).')
        if skipped:
            self.message_user(
                request,
                f'{skipped} entrada(s) não puderam ser convocadas porque não havia vaga elegível ou o status não permitia.',
                level=messages.WARNING
            )
    invite_selected_entries.short_description = _('Convocar selecionadas')

    def remove_selected_entries(self, request, queryset):
        removed = 0

        for entry in queryset.select_related('product'):
            if entry.status == 'REMOVED':
                continue
            remove_waitlist_entry(entry, reason='removed_by_admin')
            removed += 1

        self.message_user(request, f'{removed} entrada(s) removida(s) da lista de espera.')
    remove_selected_entries.short_description = _('Remover da lista de espera')


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
            'fields': (
                'enable_pix_cash',
                'enable_pix_installment',
                'enable_credit_card',
                'enable_shirt_size_field',
                'enable_waitlist_public',
                'waitlist_public_start_at',
            ),
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
