from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from rest_framework import serializers

from .models import (
    Area,
    AreaBudget,
    AreaLeaderAssignment,
    BudgetRubric,
    ExpenseAttachment,
    ExpenseAuditLog,
    ExpenseExecution,
    ExpenseRequest,
    ExtraContribution,
    Supplier,
    SupplierPayment,
)
from .constants import AREA_LEADERS_GROUP_NAME
from .permissions import can_manage_finance
from .services import (
    get_area_summary,
    get_rubric_summary,
    sum_allocated_rubrics,
)



User = get_user_model()


def get_eligible_area_leaders_queryset():
    return User.objects.filter(is_active=True, groups__name=AREA_LEADERS_GROUP_NAME).distinct()


class ExpenseAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_email = serializers.EmailField(source='uploaded_by.email', read_only=True)
    file = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseAttachment
        fields = ['id', 'category', 'file', 'uploaded_by_email', 'can_manage', 'created_at']

    def get_file(self, obj):
        if not obj.file:
            return ''
        return obj.file.url

    def get_can_manage(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return bool(obj.uploaded_by_id and obj.uploaded_by_id == user.id and obj.execution_id is None)


class ExpenseAuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source='actor.email', read_only=True)

    class Meta:
        model = ExpenseAuditLog
        fields = ['id', 'action', 'note', 'metadata', 'actor_email', 'created_at']


class ExpenseExecutionSerializer(serializers.ModelSerializer):
    executed_by_email = serializers.EmailField(source='executed_by.email', read_only=True)
    settled_by_email = serializers.EmailField(source='settled_by.email', read_only=True)
    attachments = ExpenseAttachmentSerializer(many=True, read_only=True)
    can_submit_settlement = serializers.SerializerMethodField()
    can_confirm_return = serializers.SerializerMethodField()
    can_manual_close = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseExecution
        fields = [
            'id',
            'execution_type',
            'status',
            'amount',
            'notes',
            'settlement_status',
            'spent_amount',
            'returned_amount',
            'settlement_notes',
            'executed_by_email',
            'settled_by_email',
            'executed_at',
            'settled_at',
            'can_submit_settlement',
            'can_confirm_return',
            'can_manual_close',
            'attachments',
        ]

    def get_can_submit_settlement(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if obj.execution_type != ExpenseExecution.TYPE_ADVANCE or obj.status != ExpenseExecution.STATUS_EXECUTED:
            return False
        if can_manage_finance(user):
            return True
        return obj.expense_request.area.leader_assignments.filter(user_id=user.id).exists()

    def get_can_confirm_return(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return bool(
            can_manage_finance(user)
            and obj.execution_type == ExpenseExecution.TYPE_ADVANCE
            and obj.settlement_status == ExpenseExecution.SETTLEMENT_PENDING_RETURN
        )

    def get_can_manual_close(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return bool(
            can_manage_finance(user)
            and obj.execution_type == ExpenseExecution.TYPE_ADVANCE
            and obj.status == ExpenseExecution.STATUS_EXECUTED
            and obj.settlement_status in [
                ExpenseExecution.SETTLEMENT_PENDING_PROOF,
                ExpenseExecution.SETTLEMENT_PENDING_RETURN,
            ]
        )


class AreaSerializer(serializers.ModelSerializer):
    leader_ids = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=get_eligible_area_leaders_queryset()),
        write_only=True,
        required=False,
    )
    leaders = serializers.SerializerMethodField()
    leaders_have_ineligible = serializers.SerializerMethodField()
    allocated_amount = serializers.DecimalField(max_digits=12, decimal_places=2, write_only=True, required=False)
    budget = serializers.SerializerMethodField()
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Area
        fields = [
            'id',
            'name',
            'description',
            'is_active',
            'leader_ids',
            'leaders',
            'leaders_have_ineligible',
            'allocated_amount',
            'budget',
            'summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_leaders(self, obj):
        assignments = list(getattr(obj, 'leader_assignments', []).all()) if hasattr(getattr(obj, 'leader_assignments', None), 'all') else []
        return [
            {
                'id': assignment.user_id,
                'email': assignment.user.email,
                'name': assignment.user.get_full_name() or assignment.user.email,
            }
            for assignment in assignments if assignment.user_id
        ]

    def get_budget(self, obj):
        budget = getattr(obj, 'budget', None)
        if not budget:
            return {'allocated_amount': '0.00'}
        return {'allocated_amount': str(budget.allocated_amount)}

    def get_leaders_have_ineligible(self, obj):
        assignments = list(getattr(obj, 'leader_assignments', []).all()) if hasattr(getattr(obj, 'leader_assignments', None), 'all') else []
        if not assignments:
            return False
        eligible_ids = set(get_eligible_area_leaders_queryset().values_list('id', flat=True))
        return any(assignment.user_id not in eligible_ids for assignment in assignments if assignment.user_id)

    def get_summary(self, obj):
        summary = get_area_summary(obj)
        return {key: str(value) for key, value in summary.items()}

    def validate(self, attrs):
        leader_users = attrs.pop('leader_ids', None)
        existing_assignments = list(self.instance.leader_assignments.all()) if self.instance is not None else []

        if leader_users is not None:
            unique_users = []
            seen_user_ids = set()
            for leader_user in leader_users:
                if leader_user.pk in seen_user_ids:
                    continue
                seen_user_ids.add(leader_user.pk)
                unique_users.append(leader_user)
            if len(unique_users) > 2:
                raise serializers.ValidationError({
                    'leader_ids': 'Cada área pode ter no máximo 2 líderes.'
                })
            attrs['_leader_users'] = unique_users

        if self.instance is not None and leader_users is None and existing_assignments:
            eligible_ids = set(get_eligible_area_leaders_queryset().values_list('id', flat=True))
            if any(assignment.user_id not in eligible_ids for assignment in existing_assignments if assignment.user_id):
                raise serializers.ValidationError({
                    'leader_ids': 'A área possui líder fora do grupo area_leaders. Atualize os líderes para salvar alterações.'
                })

        allocated_amount = attrs.pop('allocated_amount', None)
        if allocated_amount is not None:
            if self.instance is not None:
                allocated_rubrics_total = sum_allocated_rubrics(self.instance)
                if allocated_rubrics_total > Decimal(str(allocated_amount)):
                    raise serializers.ValidationError({
                        'allocated_amount': 'O orçamento da área não pode ficar abaixo da soma das rubricas já distribuídas.'
                    })
            attrs['_allocated_amount'] = allocated_amount
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        leader_users = validated_data.pop('_leader_users', [])
        allocated_amount = validated_data.pop('_allocated_amount', Decimal('0'))
        area = Area.objects.create(**validated_data)
        AreaBudget.objects.create(area=area, allocated_amount=allocated_amount)
        for leader_user in leader_users:
            AreaLeaderAssignment.objects.create(area=area, user=leader_user)
        return area

    @transaction.atomic
    def update(self, instance, validated_data):
        leader_users = validated_data.pop('_leader_users', None)
        allocated_amount = validated_data.pop('_allocated_amount', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if allocated_amount is not None:
            budget, _ = AreaBudget.objects.get_or_create(area=instance)
            budget.allocated_amount = allocated_amount
            budget.save(update_fields=['allocated_amount', 'updated_at'])

        if leader_users is not None:
            AreaLeaderAssignment.objects.filter(area=instance).delete()
            for leader_user in leader_users:
                AreaLeaderAssignment.objects.create(area=instance, user=leader_user)

        return instance


class BudgetRubricSerializer(serializers.ModelSerializer):
    summary = serializers.SerializerMethodField()
    area_name = serializers.CharField(source='area.name', read_only=True)

    class Meta:
        model = BudgetRubric
        fields = [
            'id',
            'area',
            'area_name',
            'name',
            'description',
            'allocated_amount',
            'is_active',
            'summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_summary(self, obj):
        summary = get_rubric_summary(obj)
        return {key: str(value) for key, value in summary.items()}

    def validate(self, attrs):
        area = attrs.get('area', self.instance.area if self.instance else None)
        allocated_amount = Decimal(str(attrs.get('allocated_amount', self.instance.allocated_amount if self.instance else 0)))
        if area is None:
            return attrs

        current_rubric_id = self.instance.id if self.instance else None
        allocated_total = sum_allocated_rubrics(area, excluding_rubric_id=current_rubric_id) + allocated_amount
        area_budget = Decimal(str(getattr(getattr(area, 'budget', None), 'allocated_amount', Decimal('0'))))
        if allocated_total > area_budget:
            raise serializers.ValidationError({
                'allocated_amount': 'A soma das rubricas da área não pode ultrapassar o orçamento da área.'
            })
        return attrs


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ['id', 'name', 'notes', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class SupplierPaymentExpenseRequestSummarySerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True)
    rubric_name = serializers.CharField(source='rubric.name', read_only=True)
    request_type_display = serializers.SerializerMethodField()
    scheduled_amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    remaining_amount = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseRequest
        fields = [
            'id',
            'area',
            'area_name',
            'rubric',
            'rubric_name',
            'amount',
            'request_type',
            'request_type_display',
            'recipient_name',
            'description',
            'approved_at',
            'scheduled_amount',
            'paid_amount',
            'remaining_amount',
        ]

    def get_request_type_display(self, obj):
        return obj.get_request_type_display()

    def get_scheduled_amount(self, obj):
        total = obj.supplier_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return str(total)

    def get_paid_amount(self, obj):
        total = obj.supplier_payments.filter(status=SupplierPayment.STATUS_PAID).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        return str(total)

    def get_remaining_amount(self, obj):
        scheduled_total = obj.supplier_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
        return str(max(Decimal(str(obj.amount)) - Decimal(str(scheduled_total)), Decimal('0')))


class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    expense_request_summary = SupplierPaymentExpenseRequestSummarySerializer(source='expense_request', read_only=True)
    area = serializers.IntegerField(source='expense_request.area_id', read_only=True)
    area_name = serializers.CharField(source='expense_request.area.name', read_only=True)
    rubric = serializers.IntegerField(source='expense_request.rubric_id', read_only=True)
    rubric_name = serializers.CharField(source='expense_request.rubric.name', read_only=True)
    paid_by_email = serializers.EmailField(source='paid_by.email', read_only=True)

    class Meta:
        model = SupplierPayment
        fields = [
            'id',
            'supplier',
            'supplier_name',
            'expense_request',
            'expense_request_summary',
            'area',
            'area_name',
            'rubric',
            'rubric_name',
            'amount',
            'scheduled_date',
            'paid_on',
            'status',
            'notes',
            'paid_by_email',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'paid_on',
            'status',
            'paid_by_email',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        if self.instance and self.instance.status == SupplierPayment.STATUS_PAID:
            raise serializers.ValidationError('Pagamentos já quitados não podem ser alterados.')
        expense_request = attrs.get('expense_request', self.instance.expense_request if self.instance else None)
        supplier = attrs.get('supplier', self.instance.supplier if self.instance else None)
        amount = Decimal(str(attrs.get('amount', self.instance.amount if self.instance else 0)))
        if not expense_request:
            raise serializers.ValidationError({'expense_request': 'Informe a solicitação aprovada.'})
        if expense_request.status != ExpenseRequest.STATUS_APPROVED:
            raise serializers.ValidationError({'expense_request': 'A solicitação vinculada precisa estar aprovada.'})
        if expense_request.request_type != ExpenseExecution.TYPE_DIRECT_PAYMENT:
            raise serializers.ValidationError({'expense_request': 'Somente solicitações de pagamento direto podem ser vinculadas.'})
        if supplier and not supplier.is_active:
            raise serializers.ValidationError({'supplier': 'Selecione um fornecedor ativo.'})

        scheduled_total = expense_request.supplier_payments.exclude(
            id=self.instance.id if self.instance else None
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        if scheduled_total + amount > Decimal(str(expense_request.amount)):
            raise serializers.ValidationError({
                'amount': 'A soma dos lançamentos não pode ultrapassar o valor aprovado da solicitação.'
            })
        return attrs


class SupplierPaymentMarkPaidSerializer(serializers.Serializer):
    paid_on = serializers.DateField(required=False)


class ExpenseRequestSerializer(serializers.ModelSerializer):
    area_name = serializers.CharField(source='area.name', read_only=True)
    rubric_name = serializers.CharField(source='rubric.name', read_only=True)
    requester_email = serializers.EmailField(source='requester.email', read_only=True)
    recipient_name = serializers.CharField(required=False, allow_blank=True)
    pix_key = serializers.CharField(required=False, allow_blank=True)
    execution = ExpenseExecutionSerializer(read_only=True)
    attachments = ExpenseAttachmentSerializer(many=True, read_only=True)
    audit_logs = ExpenseAuditLogSerializer(many=True, read_only=True)
    request_type_display = serializers.SerializerMethodField()

    class Meta:
        model = ExpenseRequest
        fields = [
            'id',
            'area',
            'area_name',
            'rubric',
            'rubric_name',
            'requester',
            'requester_email',
            'amount',
            'request_type',
            'request_type_display',
            'recipient_name',
            'pix_key',
            'description',
            'status',
            'rejection_reason',
            'reviewed_at',
            'approved_at',
            'rejected_at',
            'cancelled_at',
            'created_at',
            'updated_at',
            'execution',
            'attachments',
            'audit_logs',
        ]
        read_only_fields = [
            'area',
            'area_name',
            'requester',
            'requester_email',
            'status',
            'rejection_reason',
            'reviewed_at',
            'approved_at',
            'rejected_at',
            'cancelled_at',
            'created_at',
            'updated_at',
            'execution',
            'attachments',
            'audit_logs',
        ]

    def get_request_type_display(self, obj):
        return obj.get_request_type_display()

    def validate(self, attrs):
        request = self.context['request']
        rubric = attrs['rubric']
        user = request.user

        if not rubric.is_active:
            raise serializers.ValidationError({'rubric': 'Não é possível criar solicitações em rubricas inativas.'})

        if not can_manage_finance(user):
            assignment = user.finance_area_assignments.select_related('area').first()
            if not assignment:
                raise serializers.ValidationError('Você não possui área financeira vinculada.')
            if assignment.area_id != rubric.area_id:
                raise serializers.ValidationError({'rubric': 'Você só pode solicitar despesas para a sua área.'})

        area_summary = get_area_summary(rubric.area)
        rubric_summary = get_rubric_summary(rubric)
        amount = Decimal(str(attrs['amount']))
        request_type = attrs.get('request_type')
        recipient_name = str(attrs.get('recipient_name', '')).strip()
        pix_key = str(attrs.get('pix_key', '')).strip()
        if amount > area_summary['available_amount']:
            raise serializers.ValidationError({'amount': 'O valor solicitado excede o saldo disponível da área.'})
        if amount > rubric_summary['available_amount']:
            raise serializers.ValidationError({'amount': 'O valor solicitado excede o saldo disponível da rubrica.'})
        if request_type != ExpenseExecution.TYPE_DIRECT_PAYMENT and not recipient_name:
            raise serializers.ValidationError({'recipient_name': 'Informe o nome do favorecido.'})
        if request_type != ExpenseExecution.TYPE_DIRECT_PAYMENT and not pix_key:
            raise serializers.ValidationError({'pix_key': 'Informe a chave PIX.'})

        attrs['area'] = rubric.area
        attrs['recipient_name'] = recipient_name
        attrs['pix_key'] = pix_key
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        user = self.context['request'].user
        expense_request = ExpenseRequest.objects.create(requester=user, **validated_data)
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=user,
            action=ExpenseAuditLog.ACTION_CREATED,
            note='Solicitação criada.',
        )
        return expense_request


class ExpenseRequestReviewSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)


class ExpenseRequestRejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(required=True, allow_blank=False)


class ExpenseRequestExecuteSerializer(serializers.Serializer):
    execution_type = serializers.ChoiceField(choices=ExpenseExecution.TYPE_CHOICES)
    notes = serializers.CharField(required=False, allow_blank=True)
    file = serializers.FileField(required=False)

    def validate(self, attrs):
        if attrs['execution_type'] == ExpenseExecution.TYPE_REIMBURSEMENT and not attrs.get('file'):
            raise serializers.ValidationError({'file': 'Reembolso exige comprovante.'})
        return attrs


class ExpenseAdvanceSettlementSerializer(serializers.Serializer):
    spent_amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    settlement_notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        execution = self.context['execution']
        spent_amount = Decimal(str(attrs['spent_amount']))
        execution_amount = Decimal(str(execution.amount))
        if spent_amount > execution_amount:
            raise serializers.ValidationError({'spent_amount': 'O valor gasto não pode ultrapassar o valor do adiantamento.'})
        attrs['returned_amount'] = execution_amount - spent_amount
        return attrs


class ExpenseAdvanceConfirmReturnSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True)


class ExpenseAdvanceManualCloseSerializer(serializers.Serializer):
    note = serializers.CharField(required=True, allow_blank=False)


class ExtraContributionSerializer(serializers.ModelSerializer):
    source_type_display = serializers.CharField(source='get_source_type_display', read_only=True)

    class Meta:
        model = ExtraContribution
        fields = ['id', 'label', 'amount', 'source_type', 'source_type_display', 'date', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'source_type_display']
