from decimal import Decimal
from datetime import timedelta

from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.enrollments.models import Enrollment
from apps.payments.models import Payment
from apps.products.models import Batch, Product

from .constants import AREA_LEADERS_GROUP_NAME, FINANCE_NOTIFICATION_RECIPIENTS_GROUP_NAME, FINANCE_VIEWERS_GROUP_NAME
from .email_service import _get_finance_notification_emails
from .models import (
    Area,
    AreaBudget,
    AreaLeaderAssignment,
    BudgetRubric,
    ExpenseAuditLog,
    ExpenseExecution,
    ExpenseRequest,
    Supplier,
    SupplierPayment,
)


User = get_user_model()


class FinanceFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email='finance-admin@example.com', password='password123', is_staff=True)
        self.viewer = User.objects.create_user(email='finance-viewer@example.com', password='password123', is_staff=True)
        self.leader = User.objects.create_user(email='leader@example.com', password='password123', first_name='Lider')
        self.second_leader = User.objects.create_user(email='leader-2@example.com', password='password123', first_name='Lider 2')
        self.outsider = User.objects.create_user(email='outsider@example.com', password='password123')
        self.area_leaders_group = Group.objects.create(name=AREA_LEADERS_GROUP_NAME)
        self.finance_viewers_group = Group.objects.create(name=FINANCE_VIEWERS_GROUP_NAME)
        self.finance_notifications_group = Group.objects.create(name=FINANCE_NOTIFICATION_RECIPIENTS_GROUP_NAME)
        self.leader.groups.add(self.area_leaders_group)
        self.second_leader.groups.add(self.area_leaders_group)
        self.viewer.groups.add(self.finance_viewers_group)
        self.supplier = Supplier.objects.create(name='Fornecedor Base')

        self.product = Product.objects.create(
            name='Produto Financeiro',
            description='Produto',
            base_price=Decimal('100.00'),
            max_installments=8,
            is_active=True,
        )
        now = timezone.now()
        self.batch = Batch.objects.create(
            product=self.product,
            name='Lote Financeiro',
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=30),
            price=Decimal('100.00'),
            pix_installment_price=Decimal('120.00'),
            credit_card_price=Decimal('130.00'),
            status='ACTIVE',
        )
        enrollment = Enrollment.objects.create(
            user=self.outsider,
            product=self.product,
            batch=self.batch,
            form_data={},
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )
        Payment.objects.create(
            enrollment=enrollment,
            asaas_payment_id='finance-pay-1',
            installment_number=1,
            amount=Decimal('100.00'),
            status='RECEIVED',
            due_date=timezone.localdate(),
            paid_at=timezone.now(),
            pix_qr_code='pix',
        )

    def test_admin_summary_uses_realized_net_revenue(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('finance:admin-summary'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['revenue']['total'], '100.00')
        self.assertEqual(response.data['revenue']['fees'], '1.99')
        self.assertEqual(response.data['revenue']['net'], '98.01')

    def test_finance_viewer_can_access_summary_but_cannot_mutate(self):
        area, _ = self._create_area_and_rubric()
        self.client.force_authenticate(self.viewer)

        summary_response = self.client.get(reverse('finance:admin-summary'))
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)

        areas_response = self.client.get(reverse('finance:finance-area-list'))
        self.assertEqual(areas_response.status_code, status.HTTP_200_OK)
        self.assertEqual(areas_response.data[0]['id'], area.id)

        create_response = self.client.post(
            reverse('finance:finance-area-list'),
            {
                'name': 'Nova Área',
                'description': 'Teste',
                'allocated_amount': '10.00',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_finance_notifications_only_include_group_members(self):
        self.admin.groups.add(self.finance_notifications_group)
        self.viewer.groups.add(self.finance_notifications_group)

        emails = _get_finance_notification_emails()

        self.assertIn(self.admin.email, emails)
        self.assertIn(self.viewer.email, emails)
        self.assertNotIn(self.leader.email, emails)

    def test_area_budget_can_exceed_realized_net_revenue(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-area-list'),
            {
                'name': 'Produção',
                'description': 'Área',
                'allocated_amount': '120.00',
                'leader_ids': [self.leader.id],
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['budget']['allocated_amount'], '120.00')

    def test_leader_candidates_only_return_active_group_members(self):
        inactive_leader = User.objects.create_user(
            email='inactive-leader@example.com',
            password='password123',
            is_active=False,
        )
        inactive_leader.groups.add(self.area_leaders_group)

        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse('finance:leader-candidates'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        emails = [item['email'] for item in response.data['results']]
        self.assertIn(self.leader.email, emails)
        self.assertNotIn(self.outsider.email, emails)
        self.assertNotIn(inactive_leader.email, emails)

    def _create_area_and_rubric(self):
        area = Area.objects.create(name='Produção', description='Área')
        AreaBudget.objects.create(area=area, allocated_amount=Decimal('80.00'))
        AreaLeaderAssignment.objects.create(area=area, user=self.leader)
        rubric = BudgetRubric.objects.create(area=area, name='Som', description='Som', allocated_amount=Decimal('50.00'))
        return area, rubric

    def _create_approved_direct_payment_request(self, amount=Decimal('18.00')):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': str(amount),
                'request_type': 'DIRECT_PAYMENT',
                'description': 'Pagamento de contrato',
            },
            format='json',
        )
        request_id = create_response.data['id']
        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        return ExpenseRequest.objects.get(id=request_id)

    def test_leader_dashboard_is_scoped_to_own_area(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        response = self.client.get(reverse('finance:my-dashboard'))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['area']['id'], area.id)
        self.assertEqual(len(response.data['rubrics']), 1)
        self.assertEqual(response.data['rubrics'][0]['id'], rubric.id)

    def test_staff_user_with_area_assignment_can_access_leader_dashboard(self):
        area, rubric = self._create_area_and_rubric()
        self.leader.is_staff = True
        self.leader.save(update_fields=['is_staff'])

        self.client.force_authenticate(self.leader)
        response = self.client.get(reverse('finance:my-dashboard'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['area']['id'], area.id)
        self.assertEqual(len(response.data['rubrics']), 1)
        self.assertEqual(response.data['rubrics'][0]['id'], rubric.id)

    def test_inactive_rubric_cannot_receive_new_request(self):
        _, rubric = self._create_area_and_rubric()
        rubric.is_active = False
        rubric.save(update_fields=['is_active', 'updated_at'])

        self.client.force_authenticate(self.leader)
        response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '10.00',
                'description': 'Tentativa',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('rubric', response.data)

    def test_area_budget_cannot_be_reduced_below_allocated_rubrics(self):
        area, _ = self._create_area_and_rubric()

        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            reverse('finance:finance-area-detail', args=[area.id]),
            {
                'allocated_amount': '40.00',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('allocated_amount', response.data)

    def test_area_creation_rejects_leader_outside_area_leaders_group(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-area-list'),
            {
                'name': 'Comunicação',
                'description': 'Área',
                'allocated_amount': '30.00',
                'leader_ids': [self.outsider.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('leader_ids', response.data)

    def test_area_with_historical_ineligible_leader_loads_but_cannot_be_updated(self):
        area, _ = self._create_area_and_rubric()
        self.leader.groups.remove(self.area_leaders_group)

        self.client.force_authenticate(self.admin)
        get_response = self.client.get(reverse('finance:finance-area-detail', args=[area.id]))
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertTrue(get_response.data['leaders_have_ineligible'])

        patch_response = self.client.patch(
            reverse('finance:finance-area-detail', args=[area.id]),
            {
                'allocated_amount': '81.00',
            },
            format='json',
        )
        self.assertEqual(patch_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('leader_ids', patch_response.data)

    def test_area_can_have_up_to_two_leaders(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-area-list'),
            {
                'name': 'Comunicação',
                'description': 'Área',
                'allocated_amount': '30.00',
                'leader_ids': [self.leader.id, self.second_leader.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data['leaders']), 2)

    def test_area_rejects_more_than_two_leaders(self):
        third_leader = User.objects.create_user(email='leader-3@example.com', password='password123', first_name='Lider 3')
        third_leader.groups.add(self.area_leaders_group)

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-area-list'),
            {
                'name': 'Comunicação',
                'description': 'Área',
                'allocated_amount': '30.00',
                'leader_ids': [self.leader.id, self.second_leader.id, third_leader.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('leader_ids', response.data)

    def test_leader_cannot_request_more_than_rubric_available(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '70.00',
                'description': 'Locação',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', response.data)

    def test_leader_can_define_request_type_on_creation(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '15.00',
                'request_type': 'REIMBURSEMENT',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Compra já realizada',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['request_type'], 'REIMBURSEMENT')
        self.assertEqual(response.data['request_type_display'], 'Reembolso')
        self.assertEqual(response.data['recipient_name'], 'Lider Financeiro')
        self.assertEqual(response.data['pix_key'], 'lider@pix.test')

    def test_leader_can_define_direct_payment_request_type(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '18.00',
                'request_type': 'DIRECT_PAYMENT',
                'description': 'Pagamento para fornecedor',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['request_type'], 'DIRECT_PAYMENT')
        self.assertEqual(response.data['request_type_display'], 'Pagamento direto')
        self.assertEqual(response.data['recipient_name'], '')
        self.assertEqual(response.data['pix_key'], '')

    def test_approval_commits_budget_and_reimbursement_requires_receipt(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '30.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Cabos novos',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        approve_response = self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_response.data['status'], 'APPROVED')
        self.assertEqual(approve_response.data['execution']['status'], 'NOT_EXECUTED')
        self.assertEqual(approve_response.data['execution']['execution_type'], 'ADVANCE')

        dashboard_response = self.client.get(reverse('finance:admin-summary'))
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.leader)
        leader_dashboard = self.client.get(reverse('finance:my-dashboard'))
        self.assertEqual(leader_dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(leader_dashboard.data['summary']['committed_amount'], '30.00')

        execute_fail = self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'REIMBURSEMENT', 'notes': 'Sem nota'},
            format='multipart',
        )
        self.assertEqual(execute_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('file', execute_fail.data)

    def test_approval_copies_direct_payment_type_to_execution(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '12.00',
                'request_type': 'DIRECT_PAYMENT',
                'description': 'Fornecedor',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(self.admin)
        approve_response = self.client.post(
            reverse('finance:finance-request-approve', args=[create_response.data['id']]),
            {},
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        self.assertEqual(approve_response.data['execution']['execution_type'], 'DIRECT_PAYMENT')

    def test_advance_can_be_executed_without_receipt_and_creates_audit(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Frete',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        execute_response = self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'ADVANCE', 'notes': 'Liberado em caixa interno'},
            format='multipart',
        )
        self.assertEqual(execute_response.status_code, status.HTTP_200_OK)
        self.assertEqual(execute_response.data['execution']['status'], 'EXECUTED')
        self.assertEqual(execute_response.data['execution']['execution_type'], 'ADVANCE')
        self.assertTrue(
            ExpenseAuditLog.objects.filter(
                expense_request_id=request_id,
                action=ExpenseAuditLog.ACTION_EXECUTED,
            ).exists()
        )

    def test_advance_execution_starts_pending_settlement_flow(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '25.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Compra externa',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        execute_response = self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'ADVANCE', 'notes': 'Transferido'},
            format='multipart',
        )

        self.assertEqual(execute_response.status_code, status.HTTP_200_OK)
        self.assertEqual(execute_response.data['execution']['settlement_status'], 'PENDING_PROOF')
        self.assertTrue(execute_response.data['execution']['can_submit_settlement'])

    def test_leader_can_submit_advance_settlement_and_pending_return_keeps_full_consumption(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Material',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'ADVANCE', 'notes': 'Transferido'},
            format='multipart',
        )

        self.client.force_authenticate(self.leader)
        settlement_response = self.client.post(
            reverse('finance:finance-request-settlement', args=[request_id]),
            {
                'spent_amount': '17.00',
                'settlement_notes': 'Gastei menos do que o previsto',
                'files': [
                    SimpleUploadedFile('nota-1.pdf', b'%PDF-1.4 nota-1', content_type='application/pdf'),
                    SimpleUploadedFile('nota-2.pdf', b'%PDF-1.4 nota-2', content_type='application/pdf'),
                ],
            },
            format='multipart',
        )

        self.assertEqual(settlement_response.status_code, status.HTTP_200_OK)
        self.assertEqual(settlement_response.data['execution']['settlement_status'], 'PENDING_RETURN')
        self.assertEqual(settlement_response.data['execution']['spent_amount'], '17.00')
        self.assertEqual(settlement_response.data['execution']['returned_amount'], '3.00')
        self.assertEqual(
            sum(1 for attachment in settlement_response.data['execution']['attachments'] if attachment['category'] == 'SETTLEMENT_PROOF'),
            2,
        )

        leader_dashboard = self.client.get(reverse('finance:my-dashboard'))
        self.assertEqual(leader_dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(leader_dashboard.data['summary']['executed_amount'], '20.00')
        self.assertTrue(
            ExpenseAuditLog.objects.filter(
                expense_request_id=request_id,
                action=ExpenseAuditLog.ACTION_ADVANCE_SETTLEMENT_SUBMITTED,
            ).exists()
        )

    def test_confirm_return_reopens_available_budget(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Material',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'ADVANCE', 'notes': 'Transferido'},
            format='multipart',
        )

        self.client.force_authenticate(self.leader)
        self.client.post(
            reverse('finance:finance-request-settlement', args=[request_id]),
            {'spent_amount': '17.00', 'settlement_notes': 'Sobrou valor'},
            format='multipart',
        )

        self.client.force_authenticate(self.admin)
        confirm_response = self.client.post(
            reverse('finance:finance-request-confirm-return', args=[request_id]),
            {'note': 'Devolução recebida'},
            format='json',
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_response.data['execution']['settlement_status'], 'SETTLED')

        admin_requests = self.client.get(reverse('finance:finance-request-list'))
        self.assertEqual(admin_requests.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_requests.data[0]['execution']['returned_amount'], '3.00')

        self.client.force_authenticate(self.leader)
        leader_dashboard = self.client.get(reverse('finance:my-dashboard'))
        self.assertEqual(leader_dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(leader_dashboard.data['summary']['executed_amount'], '17.00')
        self.assertEqual(leader_dashboard.data['summary']['available_amount'], '33.00')

    def test_leader_can_attach_return_receipt_after_settlement(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Material',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {
                'execution_type': 'ADVANCE',
                'notes': 'Transferido',
                'file': SimpleUploadedFile('deposito.pdf', b'%PDF-1.4 deposito', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.client.force_authenticate(self.leader)
        self.client.post(
            reverse('finance:finance-request-settlement', args=[request_id]),
            {'spent_amount': '17.00', 'settlement_notes': 'Sobrou valor'},
            format='multipart',
        )
        return_receipt_response = self.client.post(
            reverse('finance:finance-request-return-receipt', args=[request_id]),
            {
                'file': SimpleUploadedFile('devolucao.pdf', b'%PDF-1.4 devolucao', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(return_receipt_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(return_receipt_response.data['category'], 'RETURN_RECEIPT')

    def test_leader_dashboard_only_returns_own_requests(self):
        area, rubric = self._create_area_and_rubric()
        other_leader = User.objects.create_user(email='other-leader@example.com', password='password123', first_name='Outro')
        other_leader.groups.add(self.area_leaders_group)

        ExpenseRequest.objects.create(
            area=area,
            rubric=rubric,
            requester=other_leader,
            amount=Decimal('10.00'),
            request_type='ADVANCE',
            recipient_name='Outro Lider',
            pix_key='outro@pix.test',
            description='Pedido criado para outro usuário',
        )

        self.client.force_authenticate(self.leader)
        self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '12.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Pedido do líder autenticado',
            },
            format='json',
        )

        dashboard_response = self.client.get(reverse('finance:my-dashboard'))

        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard_response.data['area']['id'], area.id)
        self.assertEqual(len(dashboard_response.data['requests']), 1)
        self.assertEqual(dashboard_response.data['requests'][0]['requester_email'], self.leader.email)

    def test_advance_settlement_rejects_spent_amount_above_execution_total(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Material',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'ADVANCE', 'notes': 'Transferido'},
            format='multipart',
        )

        self.client.force_authenticate(self.leader)
        settlement_response = self.client.post(
            reverse('finance:finance-request-settlement', args=[request_id]),
            {'spent_amount': '21.00'},
            format='multipart',
        )
        self.assertEqual(settlement_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('spent_amount', settlement_response.data)

    def test_manual_close_requires_note(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Material',
            },
            format='json',
        )
        request_id = create_response.data['id']

        self.client.force_authenticate(self.admin)
        self.client.post(reverse('finance:finance-request-approve', args=[request_id]), {}, format='json')
        self.client.post(
            reverse('finance:finance-request-execute', args=[request_id]),
            {'execution_type': 'ADVANCE', 'notes': 'Transferido'},
            format='multipart',
        )

        manual_close_response = self.client.post(
            reverse('finance:finance-request-manual-close', args=[request_id]),
            {'note': ''},
            format='json',
        )
        self.assertEqual(manual_close_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('note', manual_close_response.data)

    def test_attachment_file_url_is_relative_media_path(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '10.00',
                'recipient_name': 'Lider Financeiro',
                'pix_key': 'lider@pix.test',
                'description': 'Anexo',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        attachment_response = self.client.post(
            reverse('finance:finance-request-attachments', args=[create_response.data['id']]),
            {
                'file': SimpleUploadedFile('comprovante.pdf', b'%PDF-1.4 test file', content_type='application/pdf'),
            },
            format='multipart',
        )

        self.assertEqual(attachment_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(attachment_response.data['file'].startswith('/media/finance/'))

    def test_supplier_payment_requires_approved_direct_payment_request(self):
        _, rubric = self._create_area_and_rubric()
        pending_request = ExpenseRequest.objects.create(
            area=rubric.area,
            rubric=rubric,
            requester=self.leader,
            amount=Decimal('10.00'),
            request_type='DIRECT_PAYMENT',
            description='Pendente',
        )
        advance_request = ExpenseRequest.objects.create(
            area=rubric.area,
            rubric=rubric,
            requester=self.leader,
            amount=Decimal('10.00'),
            request_type='ADVANCE',
            recipient_name='Lider Financeiro',
            pix_key='lider@pix.test',
            description='Adiantamento',
            status=ExpenseRequest.STATUS_APPROVED,
        )

        self.client.force_authenticate(self.admin)
        without_request = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'amount': '10.00',
                'scheduled_date': '2026-06-30',
            },
            format='json',
        )
        self.assertEqual(without_request.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expense_request', without_request.data)

        pending_response = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'expense_request': pending_request.id,
                'amount': '10.00',
                'scheduled_date': '2026-06-30',
            },
            format='json',
        )
        self.assertEqual(pending_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expense_request', pending_response.data)

        advance_response = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'expense_request': advance_request.id,
                'amount': '10.00',
                'scheduled_date': '2026-06-30',
            },
            format='json',
        )
        self.assertEqual(advance_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expense_request', advance_response.data)

    def test_supplier_payment_allows_multiple_launches_for_same_request(self):
        expense_request = self._create_approved_direct_payment_request(amount=Decimal('18.00'))

        self.client.force_authenticate(self.admin)
        first_response = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'expense_request': expense_request.id,
                'amount': '8.00',
                'scheduled_date': '2026-06-28',
            },
            format='json',
        )
        second_response = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'expense_request': expense_request.id,
                'amount': '10.00',
                'scheduled_date': '2026-06-30',
            },
            format='json',
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(SupplierPayment.objects.filter(expense_request=expense_request).count(), 2)

    def test_supplier_payment_cannot_exceed_request_amount(self):
        expense_request = self._create_approved_direct_payment_request(amount=Decimal('18.00'))
        SupplierPayment.objects.create(
            supplier=self.supplier,
            expense_request=expense_request,
            amount=Decimal('12.00'),
            scheduled_date=timezone.localdate(),
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'expense_request': expense_request.id,
                'amount': '7.00',
                'scheduled_date': '2026-06-30',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', response.data)

    def test_marking_supplier_payment_as_paid_updates_execution_and_budget(self):
        expense_request = self._create_approved_direct_payment_request(amount=Decimal('18.00'))
        payment = SupplierPayment.objects.create(
            supplier=self.supplier,
            expense_request=expense_request,
            amount=Decimal('8.00'),
            scheduled_date=timezone.localdate(),
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-supplier-payment-mark-paid', args=[payment.id]),
            {'paid_on': '2026-06-23'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        self.assertEqual(payment.status, SupplierPayment.STATUS_PAID)
        self.assertEqual(str(payment.paid_on), '2026-06-23')

        execution = ExpenseExecution.objects.get(expense_request=expense_request)
        self.assertEqual(execution.status, ExpenseExecution.STATUS_NOT_EXECUTED)
        self.assertEqual(execution.execution_type, ExpenseExecution.TYPE_DIRECT_PAYMENT)

        expense_request.refresh_from_db()
        summary = self.client.get(reverse('finance:admin-summary'))
        self.assertEqual(summary.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(self.leader)
        dashboard = self.client.get(reverse('finance:my-dashboard'))
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard.data['summary']['committed_amount'], '10.00')
        self.assertEqual(dashboard.data['summary']['executed_amount'], '8.00')
        self.assertTrue(
            ExpenseAuditLog.objects.filter(
                expense_request=expense_request,
                action=ExpenseAuditLog.ACTION_SUPPLIER_PAYMENT_PAID,
            ).exists()
        )

    def test_supplier_payment_marks_request_executed_only_after_full_settlement(self):
        expense_request = self._create_approved_direct_payment_request(amount=Decimal('18.00'))
        first_payment = SupplierPayment.objects.create(
            supplier=self.supplier,
            expense_request=expense_request,
            amount=Decimal('8.00'),
            scheduled_date=timezone.localdate(),
        )
        second_payment = SupplierPayment.objects.create(
            supplier=self.supplier,
            expense_request=expense_request,
            amount=Decimal('10.00'),
            scheduled_date=timezone.localdate(),
        )

        self.client.force_authenticate(self.admin)
        first_response = self.client.post(
            reverse('finance:finance-supplier-payment-mark-paid', args=[first_payment.id]),
            {'paid_on': '2026-06-23'},
            format='json',
        )
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        execution = ExpenseExecution.objects.get(expense_request=expense_request)
        self.assertEqual(execution.status, ExpenseExecution.STATUS_NOT_EXECUTED)
        self.assertIsNone(execution.executed_at)

        second_response = self.client.post(
            reverse('finance:finance-supplier-payment-mark-paid', args=[second_payment.id]),
            {'paid_on': '2026-06-24'},
            format='json',
        )
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        execution.refresh_from_db()
        self.assertEqual(execution.status, ExpenseExecution.STATUS_EXECUTED)
        self.assertIsNotNone(execution.executed_at)

    def test_direct_payment_cannot_be_executed_outside_supplier_calendar(self):
        expense_request = self._create_approved_direct_payment_request(amount=Decimal('18.00'))

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-request-execute', args=[expense_request.id]),
            {'execution_type': 'DIRECT_PAYMENT'},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data['detail'],
            'Pagamentos diretos devem ser executados pelo calendário de fornecedores.',
        )

    def test_supplier_payments_are_restricted_to_finance_admin(self):
        expense_request = self._create_approved_direct_payment_request(amount=Decimal('18.00'))
        self.client.force_authenticate(self.viewer)
        response = self.client.get(reverse('finance:finance-supplier-payment-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-supplier-payment-list'),
            {
                'supplier': self.supplier.id,
                'expense_request': expense_request.id,
                'amount': '8.00',
                'scheduled_date': '2026-06-30',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
