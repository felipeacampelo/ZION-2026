from decimal import Decimal
import csv

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.users.permissions import IsAdminUser

from .models import (
    Area,
    AreaLeaderAssignment,
    BudgetRubric,
    ExpenseAttachment,
    ExpenseAuditLog,
    ExpenseExecution,
    ExpenseRequest,
)
from .email_service import (
    send_finance_request_approved_notification,
    send_finance_request_created_notifications,
    send_finance_request_rejected_notification,
)
from .permissions import IsFinanceLeaderOrAdmin
from .serializers import (
    AreaSerializer,
    BudgetRubricSerializer,
    ExpenseAttachmentSerializer,
    ExpenseRequestExecuteSerializer,
    ExpenseRequestRejectSerializer,
    ExpenseRequestReviewSerializer,
    ExpenseRequestSerializer,
)
from .services import build_finance_report, get_area_summary, get_realized_net_revenue, get_rubric_summary

User = get_user_model()


def _build_global_summary():
    revenue = get_realized_net_revenue()
    allocated_total = sum(
        (
            Decimal(str(getattr(getattr(area, 'budget', None), 'allocated_amount', Decimal('0'))))
            for area in Area.objects.all()
        ),
        Decimal('0'),
    )
    return {
        'revenue': {
            'total': str(revenue['total_revenue']),
            'fees': str(revenue['total_fees']),
            'net': str(revenue['net_revenue']),
            'payments_count': revenue['payments_count'],
        },
        'budgets': {
            'allocated_total': str(allocated_total),
            'remaining_to_allocate': str(revenue['net_revenue'] - allocated_total),
        },
    }


class AreaViewSet(viewsets.ModelViewSet):
    queryset = Area.objects.select_related('budget').prefetch_related('leader_assignment__user')
    serializer_class = AreaSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminUser]
    pagination_class = None


class BudgetRubricViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetRubricSerializer
    permission_classes = [permissions.IsAuthenticated, IsFinanceLeaderOrAdmin]
    pagination_class = None

    def get_queryset(self):
        queryset = BudgetRubric.objects.select_related('area', 'area__budget')
        user = self.request.user
        if user.is_staff or user.is_superuser:
            area_id = self.request.query_params.get('area')
            if area_id:
                queryset = queryset.filter(area_id=area_id)
            return queryset

        assignment = user.finance_area_assignments.select_related('area').first()
        if not assignment:
            return BudgetRubric.objects.none()
        return queryset.filter(area=assignment.area, is_active=True)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), IsAdminUser()]
        return super().get_permissions()


class ExpenseRequestViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ExpenseRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsFinanceLeaderOrAdmin]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    pagination_class = None

    def get_queryset(self):
        queryset = ExpenseRequest.objects.select_related(
            'area',
            'rubric',
            'requester',
            'reviewed_by',
            'execution',
            'execution__executed_by',
        ).prefetch_related(
            'attachments',
            'execution__attachments',
            'audit_logs',
        )
        user = self.request.user
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        if user.is_staff or user.is_superuser:
            area_id = self.request.query_params.get('area')
            if area_id:
                queryset = queryset.filter(area_id=area_id)
            return queryset

        assignment = user.finance_area_assignments.select_related('area').first()
        if not assignment:
            return ExpenseRequest.objects.none()
        return queryset.filter(area=assignment.area)

    def perform_create(self, serializer):
        expense_request = serializer.save()
        send_finance_request_created_notifications(expense_request)

    def _ensure_admin(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response({'detail': 'Acesso restrito ao administrativo.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        forbidden = self._ensure_admin(request)
        if forbidden:
            return forbidden
        expense_request = self.get_object()
        serializer = ExpenseRequestReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense_request.status = ExpenseRequest.STATUS_UNDER_REVIEW
        expense_request.reviewed_by = request.user
        expense_request.reviewed_at = timezone.now()
        expense_request.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'updated_at'])
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_UNDER_REVIEW,
            note=serializer.validated_data.get('note', ''),
        )
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def approve(self, request, pk=None):
        forbidden = self._ensure_admin(request)
        if forbidden:
            return forbidden
        expense_request = self.get_object()
        if expense_request.status in [ExpenseRequest.STATUS_REJECTED, ExpenseRequest.STATUS_CANCELLED]:
            return Response({'detail': 'Solicitações rejeitadas ou canceladas não podem ser aprovadas.'}, status=status.HTTP_400_BAD_REQUEST)

        area_summary = get_area_summary(expense_request.area)
        rubric_summary = get_rubric_summary(expense_request.rubric)
        if expense_request.amount > area_summary['available_amount']:
            return Response({'detail': 'Saldo insuficiente na área para aprovar a solicitação.'}, status=status.HTTP_400_BAD_REQUEST)
        if expense_request.amount > rubric_summary['available_amount']:
            return Response({'detail': 'Saldo insuficiente na rubrica para aprovar a solicitação.'}, status=status.HTTP_400_BAD_REQUEST)

        expense_request.status = ExpenseRequest.STATUS_APPROVED
        expense_request.reviewed_by = request.user
        expense_request.reviewed_at = timezone.now()
        expense_request.approved_at = timezone.now()
        expense_request.rejection_reason = ''
        expense_request.save(
            update_fields=['status', 'reviewed_by', 'reviewed_at', 'approved_at', 'rejection_reason', 'updated_at']
        )
        ExpenseExecution.objects.update_or_create(
            expense_request=expense_request,
            defaults={
                'amount': expense_request.amount,
                'status': ExpenseExecution.STATUS_NOT_EXECUTED,
            },
        )
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_APPROVED,
            note='Solicitação aprovada.',
        )
        send_finance_request_approved_notification(expense_request)
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reject(self, request, pk=None):
        forbidden = self._ensure_admin(request)
        if forbidden:
            return forbidden
        expense_request = self.get_object()
        serializer = ExpenseRequestRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense_request.status = ExpenseRequest.STATUS_REJECTED
        expense_request.reviewed_by = request.user
        expense_request.reviewed_at = timezone.now()
        expense_request.rejected_at = timezone.now()
        expense_request.rejection_reason = serializer.validated_data['rejection_reason']
        expense_request.save(
            update_fields=[
                'status',
                'reviewed_by',
                'reviewed_at',
                'rejected_at',
                'rejection_reason',
                'updated_at',
            ]
        )
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_REJECTED,
            note=expense_request.rejection_reason,
        )
        send_finance_request_rejected_notification(expense_request)
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        expense_request = self.get_object()
        user = request.user
        if user != expense_request.requester and not (user.is_staff or user.is_superuser):
            return Response({'detail': 'Sem permissão para cancelar esta solicitação.'}, status=status.HTTP_403_FORBIDDEN)
        if expense_request.status not in [ExpenseRequest.STATUS_PENDING, ExpenseRequest.STATUS_UNDER_REVIEW]:
            return Response({'detail': 'Apenas solicitações pendentes ou em análise podem ser canceladas.'}, status=status.HTTP_400_BAD_REQUEST)
        expense_request.status = ExpenseRequest.STATUS_CANCELLED
        expense_request.cancelled_at = timezone.now()
        expense_request.save(update_fields=['status', 'cancelled_at', 'updated_at'])
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=user,
            action=ExpenseAuditLog.ACTION_CANCELLED,
            note='Solicitação cancelada.',
        )
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def execute(self, request, pk=None):
        forbidden = self._ensure_admin(request)
        if forbidden:
            return forbidden
        expense_request = self.get_object()
        if expense_request.status != ExpenseRequest.STATUS_APPROVED:
            return Response({'detail': 'Apenas solicitações aprovadas podem ser executadas.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ExpenseRequestExecuteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        execution = getattr(expense_request, 'execution', None)
        if not execution:
            execution = ExpenseExecution.objects.create(
                expense_request=expense_request,
                amount=expense_request.amount,
                status=ExpenseExecution.STATUS_NOT_EXECUTED,
            )
        execution.execution_type = serializer.validated_data['execution_type']
        execution.notes = serializer.validated_data.get('notes', '')
        execution.status = ExpenseExecution.STATUS_EXECUTED
        execution.executed_by = request.user
        execution.executed_at = timezone.now()
        execution.save()

        uploaded_file = serializer.validated_data.get('file')
        if uploaded_file:
            attachment = ExpenseAttachment.objects.create(
                execution=execution,
                category=ExpenseAttachment.CATEGORY_RECEIPT,
                file=uploaded_file,
                uploaded_by=request.user,
            )
            ExpenseAuditLog.objects.create(
                expense_request=expense_request,
                actor=request.user,
                action=ExpenseAuditLog.ACTION_ATTACHMENT_ADDED,
                note='Comprovante anexado durante a execução.',
                metadata={'attachment_id': attachment.id},
            )

        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_EXECUTED,
            note=execution.notes,
            metadata={'execution_type': execution.execution_type},
        )
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def attachments(self, request, pk=None):
        expense_request = self.get_object()
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'file': ['Arquivo obrigatório.']}, status=status.HTTP_400_BAD_REQUEST)

        category = request.data.get('category', ExpenseAttachment.CATEGORY_SUPPORTING)
        attachment = ExpenseAttachment.objects.create(
            expense_request=expense_request,
            category=category,
            file=uploaded_file,
            uploaded_by=request.user,
        )
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ATTACHMENT_ADDED,
            note='Anexo adicionado à solicitação.',
            metadata={'attachment_id': attachment.id},
        )
        return Response(ExpenseAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def admin_finance_summary(request):
    return Response(_build_global_summary())


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def finance_reports(request):
    payload = _build_global_summary()
    payload['report'] = build_finance_report()
    return Response(payload)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def finance_reports_csv(request):
    payload = build_finance_report()
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="finance_report.csv"'

    writer = csv.writer(response)
    writer.writerow(['tipo', 'nome', 'area', 'orcado', 'pendente', 'comprometido', 'executado', 'disponivel'])
    for area in payload['areas']:
        writer.writerow([
            'area',
            area['name'],
            area['name'],
            area['allocated_amount'],
            area['pending_amount'],
            area['committed_amount'],
            area['executed_amount'],
            area['available_amount'],
        ])
    for rubric in payload['rubrics']:
        writer.writerow([
            'rubrica',
            rubric['name'],
            rubric['area_name'],
            rubric['allocated_amount'],
            rubric['pending_amount'],
            rubric['committed_amount'],
            rubric['executed_amount'],
            rubric['available_amount'],
        ])
    return response


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsAdminUser])
def finance_leader_candidates(request):
    search = request.query_params.get('search', '').strip()
    queryset = User.objects.all().order_by('email')
    if search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
        )
    results = [
        {
            'id': user.id,
            'email': user.email,
            'name': user.get_full_name() or user.email,
        }
        for user in queryset[:30]
    ]
    return Response({'results': results})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsFinanceLeaderOrAdmin])
def my_finance_dashboard(request):
    user = request.user
    if user.is_staff or user.is_superuser:
        return Response({'detail': 'Use o dashboard administrativo para administradores.'}, status=status.HTTP_400_BAD_REQUEST)

    assignment = AreaLeaderAssignment.objects.select_related('area', 'area__budget', 'user').filter(user=user).first()
    if not assignment:
        return Response({'detail': 'Nenhuma área financeira vinculada ao usuário.'}, status=status.HTTP_404_NOT_FOUND)

    area = assignment.area
    summary = get_area_summary(area)
    requests = ExpenseRequest.objects.select_related(
        'rubric',
        'execution',
        'execution__executed_by',
    ).prefetch_related('attachments', 'execution__attachments', 'audit_logs').filter(area=area)
    rubrics = BudgetRubric.objects.filter(area=area, is_active=True)
    return Response({
        'area': AreaSerializer(area).data,
        'summary': {key: str(value) for key, value in summary.items()},
        'requests': ExpenseRequestSerializer(requests, many=True, context={'request': request}).data,
        'rubrics': BudgetRubricSerializer(rubrics, many=True).data,
    })
