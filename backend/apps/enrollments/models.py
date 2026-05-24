"""
Enrollment models with clean architecture.
"""
from decimal import Decimal
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone


DEFAULT_FORM_FIELDS_CONFIG = {
    'nome_completo': {'enabled': True, 'required': True, 'label': 'Nome Completo'},
    'email': {'enabled': True, 'required': True, 'label': 'Email'},
    'telefone': {'enabled': True, 'required': True, 'label': 'Telefone'},
    'data_nascimento': {'enabled': True, 'required': True, 'label': 'Data de Nascimento'},
    'cpf': {'enabled': True, 'required': True, 'label': 'CPF'},
    'rg': {'enabled': True, 'required': True, 'label': 'RG'},
    'cep': {'enabled': True, 'required': True, 'label': 'CEP'},
    'tamanho_camiseta': {'enabled': False, 'required': False, 'label': 'Tamanho da Camiseta'},
    'membro_batista_capital': {'enabled': True, 'required': True, 'label': 'Membro Batista Capital'},
    'igreja': {'enabled': True, 'required': True, 'label': 'Igreja'},
    'lider_pg': {'enabled': True, 'required': True, 'label': 'Líder de PG'},
    'ja_participou_zion': {'enabled': True, 'required': True, 'label': 'Você já participou do ZION?'},
    'imperio_zion': {'enabled': True, 'required': True, 'label': 'Qual o seu império?'},
    'observacoes': {'enabled': True, 'required': False, 'label': 'Observações'},
}

RESPONSIBLE_FIELD_TYPES = {
    'text',
    'textarea',
    'email',
    'phone',
    'cpf',
    'date',
    'select',
    'checkbox',
}

DEFAULT_RESPONSIBLE_CONTACT_FIELDS = {
    'nome_responsavel': {'label': 'Nome do Responsável'},
    'email_responsavel': {'label': 'Email do Responsável'},
    'telefone_responsavel': {'label': 'Telefone do Responsável'},
}


class Enrollment(models.Model):
    """
    Represents a user enrollment in a product/batch.
    """
    STATUS_CHOICES = [
        ('PENDING_PAYMENT', _('Aguardando Pagamento')),
        ('PAID', _('Pago')),
        ('CANCELLED', _('Cancelado')),
        ('EXPIRED', _('Expirado')),
    ]
    
    PAYMENT_METHOD_CHOICES = [
        ('PIX_CASH', _('PIX à Vista')),
        ('PIX_INSTALLMENT', _('PIX Parcelado')),
        ('CREDIT_CARD', _('Cartão de Crédito')),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='enrollments',
        verbose_name=_('Usuário')
    )
    
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='enrollments',
        verbose_name=_('Produto')
    )
    
    batch = models.ForeignKey(
        'products.Batch',
        on_delete=models.PROTECT,
        related_name='enrollments',
        verbose_name=_('Lote')
    )
    
    form_data = models.JSONField(
        _('Dados do Formulário'),
        default=dict,
        blank=True,
        help_text=_('Dados adicionais coletados no formulário de inscrição')
    )
    
    status = models.CharField(
        _('Status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='PENDING_PAYMENT'
    )
    
    payment_method = models.CharField(
        _('Método de Pagamento'),
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        null=True,
        blank=True
    )
    
    installments = models.IntegerField(
        _('Número de Parcelas'),
        default=1,
        help_text=_('1 para pagamento à vista')
    )
    
    total_amount = models.DecimalField(
        _('Valor Total'),
        max_digits=10,
        decimal_places=2,
        help_text=_('Valor original do lote')
    )
    
    coupon = models.ForeignKey(
        'Coupon',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enrollments',
        verbose_name=_('Cupom de Desconto')
    )
    
    coupon_discount = models.DecimalField(
        _('Desconto do Cupom'),
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=_('Valor do desconto aplicado pelo cupom')
    )
    
    discount_amount = models.DecimalField(
        _('Valor do Desconto'),
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text=_('Desconto total (PIX + Cupom)')
    )
    
    final_amount = models.DecimalField(
        _('Valor Final'),
        max_digits=10,
        decimal_places=2,
        help_text=_('Valor após desconto')
    )
    
    admin_notes = models.TextField(
        _('Observações do Admin'),
        blank=True,
        help_text=_('Notas internas visíveis apenas para administradores')
    )
    
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)
    paid_at = models.DateTimeField(_('Pago em'), null=True, blank=True)
    
    class Meta:
        verbose_name = _('Inscrição')
        verbose_name_plural = _('Inscrições')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['batch', 'status']),
        ]
    
    def __str__(self):
        return f'{self.user.email} - {self.product.name}'
    
    @property
    def installment_value(self):
        """Calculate value per installment."""
        if self.installments <= 0:
            return self.final_amount
        return self.final_amount / self.installments
    
    @property
    def is_paid(self):
        """Check if enrollment is paid."""
        return self.status == 'PAID'
    
    def calculate_amounts(self):
        """Calculate total, discount and final amounts based on batch, payment method and coupon."""
        # Determine base price based on payment method
        if self.payment_method == 'PIX_CASH':
            self.total_amount = self.batch.price  # PIX à vista
        elif self.payment_method == 'PIX_INSTALLMENT':
            self.total_amount = self.batch.pix_installment_price  # PIX parcelado
        elif self.payment_method == 'CREDIT_CARD':
            self.total_amount = self.batch.credit_card_price  # Cartão de crédito
        else:
            # Fallback to PIX cash price
            self.total_amount = self.batch.price
        
        # Apply coupon discount if exists
        if self.coupon:
            coupon_discount_value = self.coupon.calculate_discount(self.total_amount)
            self.coupon_discount = Decimal(str(coupon_discount_value))
            self.discount_amount = self.coupon_discount
        else:
            self.coupon_discount = Decimal('0.00')
            self.discount_amount = Decimal('0.00')
        
        # Final amount
        self.final_amount = self.total_amount - self.discount_amount
    
    def save(self, *args, **kwargs):
        """Auto-calculate amounts before saving."""
        if self.batch and self.total_amount is None:
            self.calculate_amounts()
        super().save(*args, **kwargs)

        if self.batch and self.batch.max_enrollments is not None and self.batch.is_full and self.batch.status != 'FULL':
            self.batch.status = 'FULL'
            self.batch.save(update_fields=['status', 'updated_at'])


class Coupon(models.Model):
    """
    Discount coupon model.
    """
    DISCOUNT_TYPE_CHOICES = [
        ('PERCENTAGE', 'Porcentagem'),
        ('FIXED', 'Valor Fixo'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('PIX_CASH', 'PIX à vista'),
        ('PIX_INSTALLMENT', 'PIX parcelado'),
        ('CREDIT_CARD', 'Cartão de crédito'),
    ]
    
    code = models.CharField(
        max_length=50,
        unique=True,
        verbose_name='Código do Cupom',
        help_text='Código único do cupom (ex: PROMO2024)'
    )
    
    discount_type = models.CharField(
        max_length=20,
        choices=DISCOUNT_TYPE_CHOICES,
        default='PERCENTAGE',
        verbose_name='Tipo de Desconto'
    )
    
    discount_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        verbose_name='Valor do Desconto',
        help_text='Porcentagem (0-100) ou valor fixo em R$'
    )
    
    max_discount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name='Desconto Máximo',
        help_text='Limite máximo de desconto (apenas para porcentagem)'
    )
    
    min_purchase = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Compra Mínima',
        help_text='Valor mínimo para usar o cupom'
    )
    
    max_uses = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        verbose_name='Usos Máximos',
        help_text='Número máximo de vezes que o cupom pode ser usado (deixe vazio para ilimitado)'
    )
    
    uses_count = models.IntegerField(
        default=0,
        verbose_name='Contador de Usos'
    )
    
    valid_from = models.DateTimeField(
        verbose_name='Válido De',
        help_text='Data/hora de início da validade'
    )
    
    valid_until = models.DateTimeField(
        verbose_name='Válido Até',
        help_text='Data/hora de fim da validade'
    )
    
    active = models.BooleanField(
        default=True,
        verbose_name='Ativo'
    )
    
    description = models.TextField(
        blank=True,
        verbose_name='Descrição',
        help_text='Descrição interna do cupom'
    )
    
    enable_12x_installments = models.BooleanField(
        default=False,
        verbose_name='Habilitar Parcelamento Especial',
        help_text='Se marcado, usa o valor de "Máximo de Parcelas" abaixo'
    )
    
    max_installments = models.IntegerField(
        default=6,
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        verbose_name='Máximo de Parcelas',
        help_text='Número máximo de parcelas permitidas com este cupom (padrão: 6)'
    )
    
    # Restrições
    products = models.ManyToManyField(
        'products.Product',
        blank=True,
        verbose_name='Produtos',
        help_text='Deixe vazio para aplicar a todos os produtos'
    )

    allowed_payment_methods = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Formas de Pagamento Permitidas',
        help_text='Deixe vazio para permitir todas as formas de pagamento'
    )

    allow_installments = models.BooleanField(
        default=True,
        verbose_name='Permitir uso em parcelado',
        help_text='Quando desmarcado, o cupom só pode ser usado em pagamentos à vista'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Cupom de Desconto'
        verbose_name_plural = 'Cupons de Desconto'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.code} - {self.get_discount_display()}"
    
    def get_discount_display(self):
        """Get formatted discount display."""
        if self.discount_type == 'PERCENTAGE':
            return f"{self.discount_value}%"
        return f"R$ {self.discount_value}"
    
    def is_valid(self):
        """Check if coupon is currently valid."""
        now = timezone.now()
        
        if not self.active:
            return False, "Cupom inativo"
        
        if now < self.valid_from:
            return False, "Cupom ainda não está válido"
        
        if now > self.valid_until:
            return False, "Cupom expirado"
        
        if self.max_uses and self.uses_count >= self.max_uses:
            return False, "Cupom esgotado"
        
        return True, "Cupom válido"
    
    def can_apply_to_product(self, product):
        """Check if coupon can be applied to a specific product."""
        if not self.products.exists():
            return True
        return self.products.filter(id=product.id).exists()

    def can_apply_to_payment(self, payment_method, installments):
        """Check if coupon can be applied to a specific payment method/installments."""
        if self.allowed_payment_methods and payment_method not in self.allowed_payment_methods:
            return False, 'Este cupom não está disponível para esta forma de pagamento'

        if not self.allow_installments and installments > 1:
            return False, 'Este cupom não permite pagamento parcelado'

        return True, 'Forma de pagamento permitida'
    
    def calculate_discount(self, original_amount):
        """Calculate discount amount for given original amount."""
        from decimal import Decimal
        
        # Convert to Decimal for consistent calculations
        amount = Decimal(str(original_amount))
        
        if self.discount_type == 'PERCENTAGE':
            discount = amount * (self.discount_value / 100)
            if self.max_discount:
                discount = min(discount, self.max_discount)
        else:
            discount = min(self.discount_value, amount)
        
        return float(discount)
    
    def increment_uses(self):
        """Increment usage counter."""
        self.uses_count += 1
        self.save(update_fields=['uses_count'])


class Settings(models.Model):
    """
    Global settings for the application.
    """
    home_description = models.TextField(
        blank=True,
        default='',
        verbose_name='Descrição da Home',
        help_text='Texto principal exibido na seção de descrição da página inicial'
    )

    home_date_text = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='Data exibida na Home',
        help_text='Texto livre mostrado no bloco de data da página inicial'
    )

    home_location_text = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='Local exibido na Home',
        help_text='Texto livre mostrado no bloco de local da página inicial'
    )

    home_location_subtext = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name='Subtexto do local na Home',
        help_text='Texto menor abaixo do local, útil para endereço ou complemento'
    )

    enrollment_start_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Início das Inscrições',
        help_text='Se definido, impede novas inscrições antes desta data e hora'
    )

    enrollment_end_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Fim das Inscrições',
        help_text='Se definido, encerra novas inscrições após esta data e hora'
    )

    enable_pix_cash = models.BooleanField(
        default=True,
        verbose_name='Permitir PIX à Vista',
        help_text='Controla a disponibilidade do PIX à vista para novos pagamentos'
    )

    enable_pix_installment = models.BooleanField(
        default=True,
        verbose_name='Permitir PIX Parcelado',
        help_text='Controla a disponibilidade do PIX parcelado para novos pagamentos'
    )

    enable_credit_card = models.BooleanField(
        default=True,
        verbose_name='Permitir Cartão de Crédito',
        help_text='Controla a disponibilidade do cartão de crédito para novos pagamentos'
    )

    enable_coupons = models.BooleanField(
        default=True,
        verbose_name='Permitir Cupons',
        help_text='Controla a disponibilidade global de cupons para novas inscrições'
    )

    enable_shirt_size_field = models.BooleanField(
        default=False,
        verbose_name='Exibir Campo Tamanho da Camiseta',
        help_text='Controla a exibição do campo de tamanho da camiseta em novas inscrições'
    )

    form_fields_config = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Configuração dos Campos do Formulário',
        help_text='Define quais campos do formulário ficam visíveis e obrigatórios'
    )

    responsible_fields_config = models.JSONField(
        default=list,
        blank=True,
        verbose_name='Campos do Responsável',
        help_text='Campos extras exibidos na seção de dados do responsável'
    )

    max_age_years = models.IntegerField(
        default=17,
        validators=[MinValueValidator(0), MaxValueValidator(120)],
        verbose_name='Idade Máxima para Inscrição',
        help_text='Apenas pessoas com esta idade ou menos poderão se inscrever'
    )

    min_birth_year = models.IntegerField(
        default=2009,
        validators=[MinValueValidator(1900), MaxValueValidator(2100)],
        verbose_name='Ano Mínimo de Nascimento',
        help_text='Permite inscrição apenas para nascidos neste ano ou depois'
    )

    max_birth_year = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1900), MaxValueValidator(2100)],
        verbose_name='Ano Máximo de Nascimento',
        help_text='Permite inscrição apenas para nascidos neste ano ou antes'
    )

    max_installments = models.IntegerField(
        default=6,
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        verbose_name='Máximo de Parcelas Padrão',
        help_text='Número máximo de parcelas permitidas por padrão (sem cupom especial)'
    )
    
    max_installments_with_coupon = models.IntegerField(
        default=10,
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        verbose_name='Máximo de Parcelas com Cupom',
        help_text='Número máximo de parcelas permitidas quando cupom especial é aplicado'
    )
    
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Configurações'
        verbose_name_plural = 'Configurações'
    
    def __str__(self):
        return 'Configurações Globais'

    def get_enrollment_window_status(self, now=None):
        """Return the current enrollment window status."""
        now = now or timezone.now()

        if self.enrollment_start_at and now < self.enrollment_start_at:
            return 'not_started'

        if self.enrollment_end_at and now > self.enrollment_end_at:
            return 'closed'

        return 'open'

    def get_enrollment_window_message(self, now=None):
        """Return a human-friendly enrollment window message."""
        status = self.get_enrollment_window_status(now)

        if status == 'not_started' and self.enrollment_start_at:
            start_at = timezone.localtime(self.enrollment_start_at)
            return f'Inscrições iniciam em {start_at.strftime("%d/%m/%Y às %H:%M")}.'

        if status == 'closed':
            return 'Inscrições encerradas.'

        return ''

    def get_form_fields_config(self):
        """Return form field configuration merged with defaults."""
        merged = {}
        saved = self.form_fields_config or {}

        for field_name, default_config in DEFAULT_FORM_FIELDS_CONFIG.items():
            field_config = saved.get(field_name, {})
            merged[field_name] = {
                'enabled': field_config.get('enabled', default_config['enabled']),
                'required': field_config.get('required', default_config['required']),
                'label': default_config['label'],
            }

        # Keep legacy shirt toggle consistent.
        merged['tamanho_camiseta']['enabled'] = self.enable_shirt_size_field
        if not merged['tamanho_camiseta']['enabled']:
            merged['tamanho_camiseta']['required'] = False

        return merged

    def get_responsible_fields_config(self):
        """Return normalized responsible field configuration."""
        normalized = []

        for index, field in enumerate(self.responsible_fields_config or []):
            if not isinstance(field, dict):
                continue

            field_type = field.get('type', 'text')
            if field_type not in RESPONSIBLE_FIELD_TYPES:
                field_type = 'text'

            key = str(field.get('key', '')).strip()
            label = str(field.get('label', '')).strip()
            if not key or not label:
                continue

            options = field.get('options', [])
            if not isinstance(options, list):
                options = []

            normalized.append({
                'key': key,
                'label': label,
                'type': field_type,
                'required': bool(field.get('required', False)),
                'placeholder': str(field.get('placeholder', '')).strip(),
                'options': [str(option).strip() for option in options if str(option).strip()],
                'position': index,
            })

        return normalized

    def save(self, *args, **kwargs):
        """Normalize cross-field settings before saving."""
        merged = self.get_form_fields_config()
        responsible_fields = self.get_responsible_fields_config()

        for field_config in merged.values():
            if not field_config['enabled']:
                field_config['required'] = False

        self.enable_shirt_size_field = merged['tamanho_camiseta']['enabled']
        self.form_fields_config = {
            field_name: {
                'enabled': config['enabled'],
                'required': config['required'],
            }
            for field_name, config in merged.items()
        }
        self.responsible_fields_config = [
            {
                'key': field['key'],
                'label': field['label'],
                'type': field['type'],
                'required': field['required'],
                'placeholder': field['placeholder'],
                'options': field['options'],
            }
            for field in responsible_fields
        ]

        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            kwargs['update_fields'] = set(update_fields) | {
                'form_fields_config',
                'enable_shirt_size_field',
                'responsible_fields_config',
            }

        super().save(*args, **kwargs)
    
    @classmethod
    def get_settings(cls):
        """Get or create the singleton settings object."""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj


class EmailTemplate(models.Model):
    """Editable email template backed by database with code fallbacks."""

    TEMPLATE_KEY_CHOICES = [
        ('enrollment_confirmation', 'Confirmação de Inscrição'),
        ('payment_confirmation', 'Confirmação de Pagamento'),
        ('installment_reminder', 'Lembrete de Parcela'),
        ('password_reset', 'Recuperação de Senha'),
    ]

    key = models.CharField(
        max_length=64,
        unique=True,
        choices=TEMPLATE_KEY_CHOICES,
        verbose_name='Chave',
    )
    name = models.CharField(
        max_length=120,
        verbose_name='Nome',
    )
    subject = models.CharField(
        max_length=255,
        verbose_name='Assunto',
    )
    html_content = models.TextField(
        verbose_name='Conteúdo HTML',
    )
    text_content = models.TextField(
        blank=True,
        verbose_name='Conteúdo Texto',
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name='Ativo',
        help_text='Quando desativado, o envio automático deste template é ignorado.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Template de Email'
        verbose_name_plural = 'Templates de Email'
        ordering = ['name']

    def __str__(self):
        return self.name


class EmailCampaign(models.Model):
    """Bulk email campaign created from admin."""

    STATUS_CHOICES = [
        ('DRAFT', 'Rascunho'),
        ('SENDING', 'Enviando'),
        ('SENT', 'Enviado'),
        ('FAILED', 'Falhou'),
        ('PARTIAL', 'Parcial'),
    ]

    name = models.CharField(
        max_length=160,
        verbose_name='Nome Interno',
    )
    subject = models.CharField(
        max_length=255,
        verbose_name='Assunto',
    )
    html_content = models.TextField(
        verbose_name='Conteúdo HTML',
    )
    text_content = models.TextField(
        blank=True,
        verbose_name='Conteúdo Texto',
    )
    filters = models.JSONField(
        default=dict,
        blank=True,
        verbose_name='Filtros',
    )
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default='DRAFT',
        verbose_name='Status',
    )
    recipient_count = models.IntegerField(
        default=0,
        verbose_name='Destinatários',
    )
    sent_count = models.IntegerField(
        default=0,
        verbose_name='Enviados',
    )
    failed_count = models.IntegerField(
        default=0,
        verbose_name='Falhas',
    )
    test_email = models.EmailField(
        blank=True,
        verbose_name='Email de Teste',
    )
    started_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Iniciado em',
    )
    finished_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Finalizado em',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='email_campaigns',
        verbose_name='Criado por',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Campanha de Email'
        verbose_name_plural = 'Campanhas de Email'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class EmailCampaignRecipient(models.Model):
    """Snapshot of recipients for a bulk campaign."""

    STATUS_CHOICES = [
        ('PENDING', 'Pendente'),
        ('SENT', 'Enviado'),
        ('FAILED', 'Falhou'),
    ]

    campaign = models.ForeignKey(
        EmailCampaign,
        on_delete=models.CASCADE,
        related_name='recipients',
        verbose_name='Campanha',
    )
    enrollment = models.ForeignKey(
        Enrollment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='email_campaign_recipients',
        verbose_name='Inscrição',
    )
    email = models.EmailField(
        verbose_name='Email',
    )
    name = models.CharField(
        max_length=200,
        blank=True,
        verbose_name='Nome',
    )
    status = models.CharField(
        max_length=16,
        choices=STATUS_CHOICES,
        default='PENDING',
        verbose_name='Status',
    )
    error_message = models.TextField(
        blank=True,
        verbose_name='Erro',
    )
    sent_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name='Enviado em',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Destinatário de Campanha'
        verbose_name_plural = 'Destinatários de Campanha'
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(fields=['campaign', 'email'], name='unique_campaign_email')
        ]

    def __str__(self):
        return f'{self.campaign.name} - {self.email}'
