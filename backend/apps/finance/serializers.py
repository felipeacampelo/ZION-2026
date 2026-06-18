from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
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
)
from .constants import AREA_LEADERS_GROUP_NAME
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

    class Meta:
        model = ExpenseAttachment
        fields = ['id', 'category', 'file', 'uploaded_by_email', 'created_at']

    def get_file(self, obj):
        if not obj.file:
            return ''
        return obj.file.url


class ExpenseAuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.EmailField(source='actor.email', read_only=True)

    class Meta:
        model = ExpenseAuditLog
        fields = ['id', 'action', 'note', 'metadata', 'actor_email', 'created_at']


class ExpenseExecutionSerializer(serializers.ModelSerializer):
    executed_by_email = serializers.EmailField(source='executed_by.email', read_only=True)
    attachments = ExpenseAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = ExpenseExecution
        fields = [
            'id',
            'execution_type',
            'status',
            'amount',
            'notes',
            'executed_by_email',
            'executed_at',
            'attachments',
        ]


class AreaSerializer(serializers.ModelSerializer):
    leader_id = serializers.PrimaryKeyRelatedField(
        source='leader_assignment.user',
        queryset=get_eligible_area_leaders_queryset(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    leader = serializers.SerializerMethodField()
    leader_is_eligible = serializers.SerializerMethodField()
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
            'leader_id',
            'leader',
            'leader_is_eligible',
            'allocated_amount',
            'budget',
            'summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_leader(self, obj):
        assignment = getattr(obj, 'leader_assignment', None)
        if not assignment or not assignment.user_id:
            return None
        return {
            'id': assignment.user_id,
            'email': assignment.user.email,
            'name': assignment.user.get_full_name() or assignment.user.email,
        }

    def get_budget(self, obj):
        budget = getattr(obj, 'budget', None)
        if not budget:
            return {'allocated_amount': '0.00'}
        return {'allocated_amount': str(budget.allocated_amount)}

    def get_leader_is_eligible(self, obj):
        assignment = getattr(obj, 'leader_assignment', None)
        if not assignment or not assignment.user_id:
            return None
        return get_eligible_area_leaders_queryset().filter(pk=assignment.user_id).exists()

    def get_summary(self, obj):
        summary = get_area_summary(obj)
        return {key: str(value) for key, value in summary.items()}

    def validate(self, attrs):
        leader_payload = attrs.get('leader_assignment')
        leader_user = leader_payload.get('user') if leader_payload is not None else None
        existing_assignment = getattr(self.instance, 'leader_assignment', None)

        if leader_payload is not None and leader_user is not None:
            if not get_eligible_area_leaders_queryset().filter(pk=leader_user.pk).exists():
                raise serializers.ValidationError({
                    'leader_id': 'O líder principal precisa pertencer ao grupo area_leaders e estar ativo.'
                })

        if self.instance is not None and leader_payload is None and existing_assignment and existing_assignment.user_id:
            if not get_eligible_area_leaders_queryset().filter(pk=existing_assignment.user_id).exists():
                raise serializers.ValidationError({
                    'leader_id': 'A área possui um líder principal fora do grupo area_leaders. Atualize o líder para salvar alterações.'
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
        leader_payload = validated_data.pop('leader_assignment', None)
        allocated_amount = validated_data.pop('_allocated_amount', Decimal('0'))
        area = Area.objects.create(**validated_data)
        AreaBudget.objects.create(area=area, allocated_amount=allocated_amount)
        if leader_payload and leader_payload.get('user'):
            AreaLeaderAssignment.objects.create(area=area, user=leader_payload['user'])
        return area

    @transaction.atomic
    def update(self, instance, validated_data):
        leader_payload = validated_data.pop('leader_assignment', None)
        allocated_amount = validated_data.pop('_allocated_amount', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if allocated_amount is not None:
            budget, _ = AreaBudget.objects.get_or_create(area=instance)
            budget.allocated_amount = allocated_amount
            budget.save(update_fields=['allocated_amount', 'updated_at'])

        if leader_payload is not None:
            leader_user = leader_payload.get('user')
            if leader_user is None:
                AreaLeaderAssignment.objects.filter(area=instance).delete()
            else:
                assignment, _ = AreaLeaderAssignment.objects.get_or_create(area=instance)
                assignment.user = leader_user
                assignment.save(update_fields=['user', 'updated_at'])

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
            'justification',
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

        if not (user.is_staff or user.is_superuser):
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


class ExtraContributionSerializer(serializers.ModelSerializer):
    source_type_display = serializers.CharField(source='get_source_type_display', read_only=True)

    class Meta:
        model = ExtraContribution
        fields = ['id', 'label', 'amount', 'source_type', 'source_type_display', 'date', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'source_type_display']
