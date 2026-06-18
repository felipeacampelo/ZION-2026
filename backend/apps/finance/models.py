from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


def attachment_upload_to(instance, filename):
    request_id = instance.expense_request_id or getattr(instance.execution, 'expense_request_id', 'orphan')
    return f'finance/{request_id}/{filename}'


REQUEST_TYPE_ADVANCE = 'ADVANCE'
REQUEST_TYPE_REIMBURSEMENT = 'REIMBURSEMENT'
REQUEST_TYPE_CHOICES = [
    (REQUEST_TYPE_ADVANCE, _('Solicitação de transferência')),
    (REQUEST_TYPE_REIMBURSEMENT, _('Reembolso')),
]


class Area(models.Model):
    name = models.CharField(_('Nome'), max_length=120, unique=True)
    description = models.TextField(_('Descrição'), blank=True)
    is_active = models.BooleanField(_('Ativa'), default=True)
    created_at = models.DateTimeField(_('Criada em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizada em'), auto_now=True)

    class Meta:
        verbose_name = _('Área')
        verbose_name_plural = _('Áreas')
        ordering = ['name']

    def __str__(self):
        return self.name


class AreaLeaderAssignment(models.Model):
    area = models.OneToOneField(
        Area,
        on_delete=models.CASCADE,
        related_name='leader_assignment',
        verbose_name=_('Área'),
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='finance_area_assignments',
        verbose_name=_('Líder'),
    )
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)

    class Meta:
        verbose_name = _('Vínculo de Líder')
        verbose_name_plural = _('Vínculos de Líder')
        constraints = [
            models.UniqueConstraint(fields=['area'], name='finance_unique_leader_per_area'),
        ]

    def __str__(self):
        return f'{self.area} -> {self.user}'


class AreaBudget(models.Model):
    area = models.OneToOneField(
        Area,
        on_delete=models.CASCADE,
        related_name='budget',
        verbose_name=_('Área'),
    )
    allocated_amount = models.DecimalField(
        _('Valor Orçado'),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        default=0,
    )
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)

    class Meta:
        verbose_name = _('Orçamento da Área')
        verbose_name_plural = _('Orçamentos das Áreas')

    def __str__(self):
        return f'{self.area} - {self.allocated_amount}'


class BudgetRubric(models.Model):
    area = models.ForeignKey(
        Area,
        on_delete=models.CASCADE,
        related_name='rubrics',
        verbose_name=_('Área'),
    )
    name = models.CharField(_('Nome'), max_length=120)
    description = models.TextField(_('Descrição'), blank=True)
    allocated_amount = models.DecimalField(
        _('Valor Orçado'),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        default=0,
    )
    is_active = models.BooleanField(_('Ativa'), default=True)
    created_at = models.DateTimeField(_('Criada em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizada em'), auto_now=True)

    class Meta:
        verbose_name = _('Rubrica')
        verbose_name_plural = _('Rubricas')
        ordering = ['area__name', 'name']
        constraints = [
            models.UniqueConstraint(fields=['area', 'name'], name='finance_unique_rubric_name_per_area'),
        ]

    def __str__(self):
        return f'{self.area} - {self.name}'


class ExpenseRequest(models.Model):
    STATUS_PENDING = 'PENDING'
    STATUS_UNDER_REVIEW = 'UNDER_REVIEW'
    STATUS_APPROVED = 'APPROVED'
    STATUS_REJECTED = 'REJECTED'
    STATUS_CANCELLED = 'CANCELLED'
    STATUS_CHOICES = [
        (STATUS_PENDING, _('Pendente')),
        (STATUS_UNDER_REVIEW, _('Em análise')),
        (STATUS_APPROVED, _('Aprovada')),
        (STATUS_REJECTED, _('Rejeitada')),
        (STATUS_CANCELLED, _('Cancelada')),
    ]

    area = models.ForeignKey(
        Area,
        on_delete=models.PROTECT,
        related_name='expense_requests',
        verbose_name=_('Área'),
    )
    rubric = models.ForeignKey(
        BudgetRubric,
        on_delete=models.PROTECT,
        related_name='expense_requests',
        verbose_name=_('Rubrica'),
    )
    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='expense_requests',
        verbose_name=_('Solicitante'),
    )
    amount = models.DecimalField(
        _('Valor'),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    request_type = models.CharField(
        _('Tipo de Solicitação'),
        max_length=20,
        choices=REQUEST_TYPE_CHOICES,
        default=REQUEST_TYPE_ADVANCE,
    )
    recipient_name = models.CharField(_('Nome do Favorecido'), max_length=160)
    pix_key = models.CharField(_('Chave PIX'), max_length=160)
    description = models.TextField(_('Descrição'))
    justification = models.TextField(_('Justificativa'))
    status = models.CharField(_('Status'), max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    rejection_reason = models.TextField(_('Justificativa da Rejeição'), blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_expense_requests',
        verbose_name=_('Analisado por'),
    )
    reviewed_at = models.DateTimeField(_('Analisado em'), null=True, blank=True)
    approved_at = models.DateTimeField(_('Aprovado em'), null=True, blank=True)
    rejected_at = models.DateTimeField(_('Rejeitado em'), null=True, blank=True)
    cancelled_at = models.DateTimeField(_('Cancelado em'), null=True, blank=True)
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)

    class Meta:
        verbose_name = _('Solicitação de Despesa')
        verbose_name_plural = _('Solicitações de Despesa')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['area', 'status']),
            models.Index(fields=['rubric', 'status']),
            models.Index(fields=['requester', 'status']),
        ]

    def __str__(self):
        return f'{self.area} - {self.rubric} - {self.amount}'


class ExpenseExecution(models.Model):
    TYPE_ADVANCE = 'ADVANCE'
    TYPE_REIMBURSEMENT = 'REIMBURSEMENT'
    TYPE_CHOICES = [
        (TYPE_ADVANCE, _('Adiantamento')),
        (TYPE_REIMBURSEMENT, _('Reembolso')),
    ]

    STATUS_NOT_EXECUTED = 'NOT_EXECUTED'
    STATUS_EXECUTED = 'EXECUTED'
    STATUS_CHOICES = [
        (STATUS_NOT_EXECUTED, _('Não executado')),
        (STATUS_EXECUTED, _('Executado')),
    ]

    expense_request = models.OneToOneField(
        ExpenseRequest,
        on_delete=models.CASCADE,
        related_name='execution',
        verbose_name=_('Solicitação'),
    )
    execution_type = models.CharField(
        _('Tipo de Execução'),
        max_length=20,
        choices=TYPE_CHOICES,
        null=True,
        blank=True,
    )
    status = models.CharField(
        _('Status'),
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_NOT_EXECUTED,
    )
    amount = models.DecimalField(
        _('Valor'),
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0.01)],
    )
    notes = models.TextField(_('Observações'), blank=True)
    executed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='executed_expense_requests',
        verbose_name=_('Executado por'),
    )
    executed_at = models.DateTimeField(_('Executado em'), null=True, blank=True)
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)
    updated_at = models.DateTimeField(_('Atualizado em'), auto_now=True)

    class Meta:
        verbose_name = _('Execução Financeira')
        verbose_name_plural = _('Execuções Financeiras')

    def __str__(self):
        return f'{self.expense_request} - {self.status}'


class ExpenseAttachment(models.Model):
    CATEGORY_SUPPORTING = 'SUPPORTING'
    CATEGORY_RECEIPT = 'RECEIPT'
    CATEGORY_CHOICES = [
        (CATEGORY_SUPPORTING, _('Suporte')),
        (CATEGORY_RECEIPT, _('Comprovante')),
    ]

    expense_request = models.ForeignKey(
        ExpenseRequest,
        on_delete=models.CASCADE,
        related_name='attachments',
        null=True,
        blank=True,
        verbose_name=_('Solicitação'),
    )
    execution = models.ForeignKey(
        ExpenseExecution,
        on_delete=models.CASCADE,
        related_name='attachments',
        null=True,
        blank=True,
        verbose_name=_('Execução'),
    )
    category = models.CharField(_('Categoria'), max_length=20, choices=CATEGORY_CHOICES, default=CATEGORY_SUPPORTING)
    file = models.FileField(_('Arquivo'), upload_to=attachment_upload_to)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_expense_attachments',
        verbose_name=_('Enviado por'),
    )
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)

    class Meta:
        verbose_name = _('Anexo')
        verbose_name_plural = _('Anexos')
        ordering = ['-created_at']

    def __str__(self):
        return self.file.name


class ExpenseAuditLog(models.Model):
    ACTION_CREATED = 'CREATED'
    ACTION_UNDER_REVIEW = 'UNDER_REVIEW'
    ACTION_APPROVED = 'APPROVED'
    ACTION_REJECTED = 'REJECTED'
    ACTION_CANCELLED = 'CANCELLED'
    ACTION_EXECUTED = 'EXECUTED'
    ACTION_ATTACHMENT_ADDED = 'ATTACHMENT_ADDED'
    ACTION_CHOICES = [
        (ACTION_CREATED, _('Criada')),
        (ACTION_UNDER_REVIEW, _('Em análise')),
        (ACTION_APPROVED, _('Aprovada')),
        (ACTION_REJECTED, _('Rejeitada')),
        (ACTION_CANCELLED, _('Cancelada')),
        (ACTION_EXECUTED, _('Executada')),
        (ACTION_ATTACHMENT_ADDED, _('Anexo adicionado')),
    ]

    expense_request = models.ForeignKey(
        ExpenseRequest,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        verbose_name=_('Solicitação'),
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expense_audit_logs',
        verbose_name=_('Responsável'),
    )
    action = models.CharField(_('Ação'), max_length=32, choices=ACTION_CHOICES)
    note = models.TextField(_('Observação'), blank=True)
    metadata = models.JSONField(_('Metadados'), default=dict, blank=True)
    created_at = models.DateTimeField(_('Criado em'), auto_now_add=True)

    class Meta:
        verbose_name = _('Log de Auditoria')
        verbose_name_plural = _('Logs de Auditoria')
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.expense_request_id} - {self.action}'
