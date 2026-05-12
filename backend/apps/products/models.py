"""
Product and Batch models with clean architecture.
"""
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from django.utils import timezone


class Product(models.Model):
    """
    Represents a product/course/event that can be enrolled.
    """
    name = models.CharField(
        _('Nome'),
        max_length=200
    )
    
    description = models.TextField(
        _('Descrição'),
        blank=True
    )
    
    image = models.ImageField(
        _('Imagem'),
        upload_to='products/',
        blank=True,
        null=True
    )
    
    base_price = models.DecimalField(
        _('Preço Base'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    
    max_installments = models.IntegerField(
        _('Máximo de Parcelas'),
        default=8,
        validators=[MinValueValidator(1), MaxValueValidator(12)],
        help_text=_('Número máximo de parcelas permitidas')
    )
    
    is_active = models.BooleanField(
        _('Ativo'),
        default=True
    )
    
    event_date = models.DateTimeField(
        _('Data do Evento'),
        null=True,
        blank=True,
        help_text=_('Data de início do evento/acampamento')
    )
    
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)
    
    class Meta:
        verbose_name = _('Produto')
        verbose_name_plural = _('Produtos')
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name
    
    def get_active_batch(self):
        """Returns the currently visible/active batch for this product."""
        now = timezone.now()

        visible_batch = self.batches.filter(
            is_visible_on_site=True,
            status='ACTIVE',
            start_date__lte=now,
            end_date__gte=now
        ).first()

        if visible_batch and not visible_batch.is_full:
            return visible_batch

        candidate_batches = self.batches.filter(
            status='ACTIVE',
            start_date__lte=now,
            end_date__gte=now
        ).order_by('start_date')

        for batch in candidate_batches:
            if not batch.is_full:
                return batch

        return None


class Batch(models.Model):
    """
    Represents a batch/lot with specific pricing and discount.
    """
    STATUS_CHOICES = [
        ('SCHEDULED', _('Agendado')),
        ('ACTIVE', _('Ativo')),
        ('FULL', _('Esgotado')),
        ('ENDED', _('Encerrado')),
    ]
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='batches',
        verbose_name=_('Produto')
    )
    
    name = models.CharField(
        _('Nome do Lote'),
        max_length=100,
        help_text=_('Ex: Lote 1 - Early Bird, Lote 2 - Regular')
    )
    
    start_date = models.DateTimeField(
        _('Data de Início')
    )
    
    end_date = models.DateTimeField(
        _('Data de Término')
    )
    
    price = models.DecimalField(
        _('Preço PIX à Vista'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text=_('Preço para pagamento PIX à vista')
    )
    
    pix_installment_price = models.DecimalField(
        _('Preço PIX Parcelado'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text=_('Preço para pagamento PIX parcelado')
    )
    
    credit_card_price = models.DecimalField(
        _('Preço Cartão de Crédito'),
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text=_('Preço para pagamento com cartão de crédito')
    )
    
    pix_discount_percentage = models.DecimalField(
        _('Desconto PIX (%) - DEPRECATED'),
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text=_('Campo obsoleto - usar price, pix_installment_price e credit_card_price'),
        blank=True,
        null=True
    )
    
    max_enrollments = models.IntegerField(
        _('Limite de Vagas'),
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text=_('Deixe em branco para ilimitado')
    )
    
    status = models.CharField(
        _('Status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default='SCHEDULED'
    )

    is_visible_on_site = models.BooleanField(
        _('Visível no site'),
        default=False,
        help_text=_('Define o lote exibido no frontend quando houver múltiplos lotes elegíveis')
    )
    
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)
    
    class Meta:
        verbose_name = _('Lote')
        verbose_name_plural = _('Lotes')
        ordering = ['start_date']
        unique_together = ['product', 'name']
    
    def __str__(self):
        return f'{self.product.name} - {self.name}'
    
    @property
    def current_enrollments(self):
        """Returns the count of active enrollments in this batch (pending or paid)."""
        return self.enrollments.filter(status__in=['PENDING_PAYMENT', 'PAID']).count()
    
    @property
    def is_full(self):
        """Check if batch has reached max enrollments."""
        if self.max_enrollments is None:
            return False
        return self.current_enrollments >= self.max_enrollments
    
    @property
    def is_active_now(self):
        """Check if batch is currently active based on dates."""
        now = timezone.now()
        return self.start_date <= now <= self.end_date
    
    def save(self, *args, **kwargs):
        """Auto-update status based on dates and enrollments."""
        # Only check is_full if the object already exists (has pk)
        if self.pk and self.is_full:
            self.status = 'FULL'
        elif self.is_active_now:
            self.status = 'ACTIVE'
        elif timezone.now() > self.end_date:
            self.status = 'ENDED'
        elif timezone.now() < self.start_date:
            self.status = 'SCHEDULED'

        super().save(*args, **kwargs)

        if self.status == 'ACTIVE':
            Batch.objects.filter(product=self.product, status='ACTIVE').exclude(pk=self.pk).update(
                status='ENDED',
                end_date=timezone.now(),
                is_visible_on_site=False,
            )

        if self.is_visible_on_site:
            Batch.objects.filter(product=self.product).exclude(pk=self.pk).update(is_visible_on_site=False)
