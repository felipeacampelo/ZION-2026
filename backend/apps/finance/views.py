from decimal import Decimal
import csv

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.db.models import Sum
from django.db.models.deletion import ProtectedError
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import (
    Area,
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
from .email_service import (
    send_finance_request_approved_notification,
    send_finance_request_created_notifications,
    send_finance_request_rejected_notification,
)
from .permissions import CanManageFinanceAdmin, CanViewFinanceAdmin, IsFinanceLeaderOrAdmin, can_manage_finance, can_view_finance_admin
from .serializers import (
    AreaSerializer,
    BudgetRubricSerializer,
    ExpenseAdvanceConfirmReturnSerializer,
    ExpenseAdvanceManualCloseSerializer,
    ExpenseAdvanceSettlementSerializer,
    ExpenseAttachmentSerializer,
    ExpenseRequestExecuteSerializer,
    ExpenseRequestRejectSerializer,
    ExpenseRequestReviewSerializer,
    ExpenseRequestSerializer,
    ExtraContributionSerializer,
    SupplierPaymentExpenseRequestSummarySerializer,
    SupplierPaymentMarkPaidSerializer,
    SupplierPaymentSerializer,
    SupplierSerializer,
    get_eligible_area_leaders_queryset,
)
from .services import build_finance_report, get_area_summary, get_extra_contributions_total, get_realized_net_revenue, get_rubric_summary

User = get_user_model()


def _build_global_summary():
    revenue = get_realized_net_revenue()
    extra_total = get_extra_contributions_total()
    combined_total = revenue['net_revenue'] + extra_total
    allocated_total = sum(
        (
            Decimal(str(getattr(getattr(area, 'budget', None), 'allocated_amount', Decimal('0'))))
            for area in Area.objects.all()
        ),
        Decimal('0'),
    )
    awaiting_approval_total = sum(
        (
            Decimal(str(expense_request.amount))
            for expense_request in ExpenseRequest.objects.filter(
                status__in=[ExpenseRequest.STATUS_PENDING, ExpenseRequest.STATUS_UNDER_REVIEW],
            )
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
            'remaining_to_allocate': str(combined_total - allocated_total),
            'awaiting_approval_total': str(awaiting_approval_total),
        },
        'extra_contributions': {
            'total': str(extra_total),
            'combined_with_net': str(combined_total),
        },
    }


class AreaViewSet(viewsets.ModelViewSet):
    queryset = Area.objects.select_related('budget').prefetch_related('leader_assignments__user')
    serializer_class = AreaSerializer
    permission_classes = [permissions.IsAuthenticated, CanViewFinanceAdmin]
    pagination_class = None

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [permissions.IsAuthenticated(), CanManageFinanceAdmin()]
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'Não é possível excluir a área porque ela possui solicitações vinculadas.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


class BudgetRubricViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetRubricSerializer
    permission_classes = [permissions.IsAuthenticated, CanViewFinanceAdmin]
    pagination_class = None

    def get_queryset(self):
        queryset = BudgetRubric.objects.select_related('area', 'area__budget')
        user = self.request.user
        if can_view_finance_admin(user):
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
            return [permissions.IsAuthenticated(), CanManageFinanceAdmin()]
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'Não é possível excluir a rubrica porque ela possui solicitações vinculadas.'},
                status=status.HTTP_400_BAD_REQUEST,
            )


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
        request_type = self.request.query_params.get('request_type')
        if request_type:
            queryset = queryset.filter(request_type=request_type)
        if can_manage_finance(user):
            area_id = self.request.query_params.get('area')
            if area_id:
                queryset = queryset.filter(area_id=area_id)
            return queryset

        assignment = user.finance_area_assignments.select_related('area').first()
        if not assignment:
            return ExpenseRequest.objects.none()
        return queryset.filter(area=assignment.area, requester=user)

    def perform_create(self, serializer):
        expense_request = serializer.save()
        send_finance_request_created_notifications(expense_request)

    def _get_manageable_request_attachment(self, expense_request, attachment_id, user):
        try:
            attachment = ExpenseAttachment.objects.get(
                id=attachment_id,
                expense_request=expense_request,
                execution__isnull=True,
            )
        except ExpenseAttachment.DoesNotExist:
            return None, Response({'detail': 'Anexo não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not attachment.uploaded_by_id or attachment.uploaded_by_id != user.id:
            return None, Response(
                {'detail': 'Apenas quem enviou o anexo pode substituí-lo ou excluí-lo.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        return attachment, None

    def _ensure_admin(self, request):
        if not can_manage_finance(request.user):
            return Response({'detail': 'Acesso restrito ao administrativo.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def _ensure_area_leader_or_admin(self, request, expense_request):
        user = request.user
        if can_manage_finance(user):
            return None
        if expense_request.requester_id == user.id:
            return None
        return Response({'detail': 'Sem permissão para prestar contas desta solicitação.'}, status=status.HTTP_403_FORBIDDEN)

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
                'execution_type': expense_request.request_type,
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
        if user != expense_request.requester and not can_manage_finance(user):
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
        if expense_request.request_type == ExpenseExecution.TYPE_DIRECT_PAYMENT:
            return Response(
                {'detail': 'Pagamentos diretos devem ser executados pelo calendário de fornecedores.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
        execution.settlement_status = (
            ExpenseExecution.SETTLEMENT_PENDING_PROOF
            if execution.execution_type == ExpenseExecution.TYPE_ADVANCE
            else ExpenseExecution.SETTLEMENT_NOT_REQUIRED
        )
        execution.spent_amount = None
        execution.returned_amount = None
        execution.settlement_notes = ''
        execution.settled_by = None
        execution.settled_at = None
        execution.executed_by = request.user
        execution.executed_at = timezone.now()
        execution.save()

        uploaded_file = serializer.validated_data.get('file')
        if uploaded_file:
            attachment = ExpenseAttachment.objects.create(
                execution=execution,
                category=(
                    ExpenseAttachment.CATEGORY_DEPOSIT_RECEIPT
                    if execution.execution_type == ExpenseExecution.TYPE_ADVANCE
                    else ExpenseAttachment.CATEGORY_RECEIPT
                ),
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

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    @transaction.atomic
    def settlement(self, request, pk=None):
        expense_request = self.get_object()
        forbidden = self._ensure_area_leader_or_admin(request, expense_request)
        if forbidden:
            return forbidden
        execution = getattr(expense_request, 'execution', None)
        if not execution or execution.status != ExpenseExecution.STATUS_EXECUTED:
            return Response({'detail': 'A solicitação precisa estar executada para receber prestação de contas.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.execution_type != ExpenseExecution.TYPE_ADVANCE:
            return Response({'detail': 'Prestação de contas só se aplica a solicitações de transferência.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.settlement_status in [
            ExpenseExecution.SETTLEMENT_SETTLED,
            ExpenseExecution.SETTLEMENT_MANUALLY_CLOSED,
        ]:
            return Response({'detail': 'Esta prestação de contas já foi encerrada.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ExpenseAdvanceSettlementSerializer(data=request.data, context={'execution': execution})
        serializer.is_valid(raise_exception=True)
        execution.spent_amount = serializer.validated_data['spent_amount']
        execution.returned_amount = serializer.validated_data['returned_amount']
        execution.settlement_notes = serializer.validated_data.get('settlement_notes', '')
        execution.settled_by = request.user
        execution.settled_at = timezone.now()
        execution.settlement_status = (
            ExpenseExecution.SETTLEMENT_PENDING_RETURN
            if execution.returned_amount > Decimal('0')
            else ExpenseExecution.SETTLEMENT_SETTLED
        )
        execution.save(
            update_fields=[
                'spent_amount',
                'returned_amount',
                'settlement_notes',
                'settled_by',
                'settled_at',
                'settlement_status',
                'updated_at',
            ]
        )

        uploaded_files = request.FILES.getlist('files') or []
        single_file = request.FILES.get('file')
        if single_file:
            uploaded_files.append(single_file)
        attachment_ids = []
        for uploaded_file in uploaded_files:
            attachment = ExpenseAttachment.objects.create(
                execution=execution,
                category=ExpenseAttachment.CATEGORY_SETTLEMENT_PROOF,
                file=uploaded_file,
                uploaded_by=request.user,
            )
            attachment_ids.append(attachment.id)
            ExpenseAuditLog.objects.create(
                expense_request=expense_request,
                actor=request.user,
                action=ExpenseAuditLog.ACTION_ATTACHMENT_ADDED,
                note='Comprovante de compra enviado na prestação de contas do adiantamento.',
                metadata={'attachment_id': attachment.id},
            )

        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ADVANCE_SETTLEMENT_SUBMITTED,
            note=execution.settlement_notes,
            metadata={
                'spent_amount': str(execution.spent_amount),
                'returned_amount': str(execution.returned_amount),
                'attachment_ids': attachment_ids,
            },
        )
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'], url_path='return-receipt', parser_classes=[MultiPartParser, FormParser])
    @transaction.atomic
    def return_receipt(self, request, pk=None):
        expense_request = self.get_object()
        forbidden = self._ensure_area_leader_or_admin(request, expense_request)
        if forbidden:
            return forbidden

        execution = getattr(expense_request, 'execution', None)
        if not execution or execution.execution_type != ExpenseExecution.TYPE_ADVANCE:
            return Response({'detail': 'Comprovante de devolução só se aplica a adiantamentos.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.status != ExpenseExecution.STATUS_EXECUTED:
            return Response({'detail': 'A solicitação precisa estar executada antes de anexar a devolução.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.returned_amount in [None, Decimal('0')]:
            return Response({'detail': 'Não existe valor devolvido para esta solicitação.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.settlement_status not in [
            ExpenseExecution.SETTLEMENT_PENDING_RETURN,
            ExpenseExecution.SETTLEMENT_SETTLED,
        ]:
            return Response({'detail': 'A devolução só pode ser anexada após a prestação indicar saldo restante.'}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'file': ['Arquivo obrigatório.']}, status=status.HTTP_400_BAD_REQUEST)

        existing = execution.attachments.filter(category=ExpenseAttachment.CATEGORY_RETURN_RECEIPT).first()
        if existing:
            return Response({'detail': 'Esta solicitação já possui comprovante de devolução.'}, status=status.HTTP_400_BAD_REQUEST)

        attachment = ExpenseAttachment.objects.create(
            execution=execution,
            category=ExpenseAttachment.CATEGORY_RETURN_RECEIPT,
            file=uploaded_file,
            uploaded_by=request.user,
        )
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ATTACHMENT_ADDED,
            note='Comprovante de devolução anexado.',
            metadata={'attachment_id': attachment.id},
        )
        return Response(ExpenseAttachmentSerializer(attachment, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='confirm-return', url_name='confirm-return')
    @transaction.atomic
    def confirm_return(self, request, pk=None):
        forbidden = self._ensure_admin(request)
        if forbidden:
            return forbidden
        expense_request = self.get_object()
        execution = getattr(expense_request, 'execution', None)
        if not execution or execution.execution_type != ExpenseExecution.TYPE_ADVANCE:
            return Response({'detail': 'Devolução só se aplica a adiantamentos.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.settlement_status != ExpenseExecution.SETTLEMENT_PENDING_RETURN:
            return Response({'detail': 'Não há devolução pendente para esta solicitação.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ExpenseAdvanceConfirmReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        execution.settlement_status = ExpenseExecution.SETTLEMENT_SETTLED
        execution.settled_by = request.user
        execution.settled_at = timezone.now()
        execution.save(update_fields=['settlement_status', 'settled_by', 'settled_at', 'updated_at'])
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ADVANCE_RETURN_CONFIRMED,
            note=serializer.validated_data.get('note', ''),
            metadata={'returned_amount': str(execution.returned_amount or Decimal('0'))},
        )
        return Response(self.get_serializer(expense_request).data)

    @action(detail=True, methods=['post'], url_path='manual-close', url_name='manual-close')
    @transaction.atomic
    def manual_close(self, request, pk=None):
        forbidden = self._ensure_admin(request)
        if forbidden:
            return forbidden
        expense_request = self.get_object()
        execution = getattr(expense_request, 'execution', None)
        if not execution or execution.execution_type != ExpenseExecution.TYPE_ADVANCE:
            return Response({'detail': 'Encerramento manual só se aplica a adiantamentos.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.status != ExpenseExecution.STATUS_EXECUTED:
            return Response({'detail': 'A solicitação precisa estar executada antes do encerramento manual.'}, status=status.HTTP_400_BAD_REQUEST)
        if execution.settlement_status in [
            ExpenseExecution.SETTLEMENT_SETTLED,
            ExpenseExecution.SETTLEMENT_MANUALLY_CLOSED,
        ]:
            return Response({'detail': 'Esta prestação de contas já foi encerrada.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = ExpenseAdvanceManualCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        execution.settlement_status = ExpenseExecution.SETTLEMENT_MANUALLY_CLOSED
        execution.settled_by = request.user
        execution.settled_at = timezone.now()
        execution.settlement_notes = serializer.validated_data['note']
        if execution.spent_amount is None:
            execution.spent_amount = execution.amount
        if execution.returned_amount is None:
            execution.returned_amount = Decimal('0')
        execution.save(
            update_fields=[
                'settlement_status',
                'settled_by',
                'settled_at',
                'settlement_notes',
                'spent_amount',
                'returned_amount',
                'updated_at',
            ]
        )
        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ADVANCE_MANUALLY_CLOSED,
            note=execution.settlement_notes,
            metadata={
                'spent_amount': str(execution.spent_amount),
                'returned_amount': str(execution.returned_amount),
            },
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

    @action(detail=True, methods=['patch'], url_path=r'attachments/(?P<attachment_id>[^/.]+)')
    @transaction.atomic
    def replace_attachment(self, request, pk=None, attachment_id=None):
        expense_request = self.get_object()
        attachment, forbidden = self._get_manageable_request_attachment(expense_request, attachment_id, request.user)
        if forbidden:
            return forbidden

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'file': ['Arquivo obrigatório.']}, status=status.HTTP_400_BAD_REQUEST)

        old_name = attachment.file.name
        if attachment.file:
            attachment.file.delete(save=False)
        attachment.file = uploaded_file
        attachment.save(update_fields=['file'])

        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ATTACHMENT_REPLACED,
            note='Anexo substituído na solicitação.',
            metadata={'attachment_id': attachment.id, 'old_file_name': old_name},
        )
        return Response(ExpenseAttachmentSerializer(attachment, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['delete'], url_path=r'attachments/(?P<attachment_id>[^/.]+)')
    @transaction.atomic
    def delete_attachment(self, request, pk=None, attachment_id=None):
        expense_request = self.get_object()
        attachment, forbidden = self._get_manageable_request_attachment(expense_request, attachment_id, request.user)
        if forbidden:
            return forbidden

        removed_file_name = attachment.file.name
        if attachment.file:
            attachment.file.delete(save=False)
        attachment.delete()

        ExpenseAuditLog.objects.create(
            expense_request=expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_ATTACHMENT_REMOVED,
            note='Anexo removido da solicitação.',
            metadata={'removed_file_name': removed_file_name},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExtraContributionViewSet(viewsets.ModelViewSet):
    queryset = ExtraContribution.objects.all()
    serializer_class = ExtraContributionSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageFinanceAdmin]
    pagination_class = None


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageFinanceAdmin]
    pagination_class = None

    def get_queryset(self):
        queryset = Supplier.objects.all()
        active = self.request.query_params.get('active')
        if active == 'true':
            queryset = queryset.filter(is_active=True)
        elif active == 'false':
            queryset = queryset.filter(is_active=False)
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        return queryset


class SupplierPaymentViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierPaymentSerializer
    permission_classes = [permissions.IsAuthenticated, CanManageFinanceAdmin]
    pagination_class = None
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        queryset = SupplierPayment.objects.select_related(
            'supplier',
            'expense_request',
            'expense_request__area',
            'expense_request__rubric',
            'paid_by',
        ).prefetch_related('expense_request__supplier_payments')
        month = self.request.query_params.get('month')
        if month:
            try:
                year_str, month_str = month.split('-', 1)
                queryset = queryset.filter(
                    scheduled_date__year=int(year_str),
                    scheduled_date__month=int(month_str),
                )
            except (TypeError, ValueError):
                queryset = queryset.none()
        supplier_id = self.request.query_params.get('supplier')
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        rubric_id = self.request.query_params.get('rubric')
        if rubric_id:
            queryset = queryset.filter(expense_request__rubric_id=rubric_id)
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        return queryset

    @action(detail=False, methods=['get'], url_path='eligible-requests')
    def eligible_requests(self, request):
        queryset = ExpenseRequest.objects.select_related(
            'area',
            'rubric',
            'execution',
        ).prefetch_related(
            'supplier_payments',
        ).filter(
            status=ExpenseRequest.STATUS_APPROVED,
            request_type=ExpenseExecution.TYPE_DIRECT_PAYMENT,
        ).order_by('-approved_at', '-id')
        payload = []
        for expense_request in queryset:
            if (
                getattr(getattr(expense_request, 'execution', None), 'status', None) == ExpenseExecution.STATUS_EXECUTED
                and not expense_request.supplier_payments.exists()
            ):
                continue
            scheduled_total = expense_request.supplier_payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
            if scheduled_total >= Decimal(str(expense_request.amount)):
                continue
            payload.append(
                SupplierPaymentExpenseRequestSummarySerializer(
                    expense_request,
                    context=self.get_serializer_context(),
                ).data
            )
        return Response(payload)

    @action(detail=True, methods=['post'], url_path='mark-paid')
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        payment = self.get_object()
        if payment.status == SupplierPayment.STATUS_PAID:
            return Response({'detail': 'Este pagamento já foi marcado como pago.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SupplierPaymentMarkPaidSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        paid_on = serializer.validated_data.get('paid_on') or timezone.localdate()
        payment.status = SupplierPayment.STATUS_PAID
        payment.paid_on = paid_on
        payment.paid_by = request.user
        payment.save(update_fields=['status', 'paid_on', 'paid_by', 'updated_at'])

        execution, _ = ExpenseExecution.objects.get_or_create(
            expense_request=payment.expense_request,
            defaults={
                'execution_type': ExpenseExecution.TYPE_DIRECT_PAYMENT,
                'amount': payment.expense_request.amount,
                'status': ExpenseExecution.STATUS_NOT_EXECUTED,
            },
        )
        execution.execution_type = ExpenseExecution.TYPE_DIRECT_PAYMENT
        execution.amount = payment.expense_request.amount
        execution.notes = 'Pagamento registrado pelo calendário de fornecedores.'
        total_paid = payment.expense_request.supplier_payments.filter(status=SupplierPayment.STATUS_PAID).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        is_fully_paid = total_paid >= Decimal(str(payment.expense_request.amount))
        execution.status = (
            ExpenseExecution.STATUS_EXECUTED
            if is_fully_paid
            else ExpenseExecution.STATUS_NOT_EXECUTED
        )
        execution.settlement_status = ExpenseExecution.SETTLEMENT_NOT_REQUIRED
        execution.executed_by = request.user if is_fully_paid else None
        execution.executed_at = timezone.now() if is_fully_paid else None
        execution.save(
            update_fields=[
                'execution_type',
                'amount',
                'notes',
                'status',
                'settlement_status',
                'executed_by',
                'executed_at',
                'updated_at',
            ]
        )
        ExpenseAuditLog.objects.create(
            expense_request=payment.expense_request,
            actor=request.user,
            action=ExpenseAuditLog.ACTION_SUPPLIER_PAYMENT_PAID,
            note=f'Pagamento do fornecedor {payment.supplier.name} marcado como pago.',
            metadata={
                'supplier_payment_id': payment.id,
                'amount': str(payment.amount),
                'paid_on': str(payment.paid_on),
            },
        )
        return Response(self.get_serializer(payment).data)

    def perform_create(self, serializer):
        payment = serializer.save()
        ExpenseAuditLog.objects.create(
            expense_request=payment.expense_request,
            actor=self.request.user,
            action=ExpenseAuditLog.ACTION_SUPPLIER_PAYMENT_SCHEDULED,
            note=f'Pagamento agendado para {payment.supplier.name}.',
            metadata={
                'supplier_payment_id': payment.id,
                'supplier_id': payment.supplier_id,
                'scheduled_date': str(payment.scheduled_date),
                'amount': str(payment.amount),
            },
        )

    def perform_update(self, serializer):
        payment = serializer.save()
        ExpenseAuditLog.objects.create(
            expense_request=payment.expense_request,
            actor=self.request.user,
            action=ExpenseAuditLog.ACTION_SUPPLIER_PAYMENT_UPDATED,
            note=f'Pagamento do fornecedor {payment.supplier.name} atualizado.',
            metadata={
                'supplier_payment_id': payment.id,
                'supplier_id': payment.supplier_id,
                'scheduled_date': str(payment.scheduled_date),
                'amount': str(payment.amount),
                'status': payment.status,
            },
        )

    def perform_destroy(self, instance):
        if instance.status == SupplierPayment.STATUS_PAID:
            raise serializers.ValidationError('Pagamentos já quitados não podem ser removidos.')
        ExpenseAuditLog.objects.create(
            expense_request=instance.expense_request,
            actor=self.request.user,
            action=ExpenseAuditLog.ACTION_SUPPLIER_PAYMENT_UPDATED,
            note=f'Pagamento do fornecedor {instance.supplier.name} removido do calendário.',
            metadata={
                'supplier_payment_id': instance.id,
                'supplier_id': instance.supplier_id,
                'scheduled_date': str(instance.scheduled_date),
                'amount': str(instance.amount),
                'removed': True,
            },
        )
        super().perform_destroy(instance)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, CanViewFinanceAdmin])
def admin_finance_summary(request):
    return Response(_build_global_summary())


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, CanViewFinanceAdmin])
def finance_reports(request):
    payload = _build_global_summary()
    payload['report'] = build_finance_report()
    return Response(payload)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, CanViewFinanceAdmin])
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
@permission_classes([permissions.IsAuthenticated, CanManageFinanceAdmin])
def finance_leader_candidates(request):
    search = request.query_params.get('search', '').strip()
    queryset = get_eligible_area_leaders_queryset().order_by('email')
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
    assignment = AreaLeaderAssignment.objects.select_related('area', 'area__budget', 'user').filter(user=user).first()
    if not assignment:
        if can_view_finance_admin(user):
            return Response({'detail': 'Use o dashboard administrativo para administradores.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'detail': 'Nenhuma área financeira vinculada ao usuário.'}, status=status.HTTP_404_NOT_FOUND)

    area = assignment.area
    summary = get_area_summary(area)
    requests = ExpenseRequest.objects.select_related(
        'rubric',
        'requester',
        'execution',
        'execution__executed_by',
    ).prefetch_related('attachments', 'execution__attachments', 'audit_logs').filter(area=area, requester=user)
    rubrics = BudgetRubric.objects.filter(area=area, is_active=True)
    return Response({
        'area': AreaSerializer(area).data,
        'summary': {key: str(value) for key, value in summary.items()},
        'requests': ExpenseRequestSerializer(requests, many=True, context={'request': request}).data,
        'rubrics': BudgetRubricSerializer(rubrics, many=True).data,
    })
