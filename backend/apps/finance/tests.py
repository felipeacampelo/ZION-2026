from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.enrollments.models import Enrollment
from apps.payments.models import Payment
from apps.products.models import Batch, Product

from .models import Area, AreaBudget, AreaLeaderAssignment, BudgetRubric, ExpenseAuditLog


User = get_user_model()


class FinanceFlowTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email='finance-admin@example.com', password='password123', is_staff=True)
        self.leader = User.objects.create_user(email='leader@example.com', password='password123', first_name='Lider')
        self.outsider = User.objects.create_user(email='outsider@example.com', password='password123')

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

    def test_area_budget_cannot_exceed_realized_net_revenue(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse('finance:finance-area-list'),
            {
                'name': 'Produção',
                'description': 'Área',
                'allocated_amount': '120.00',
                'leader_id': self.leader.id,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('allocated_amount', response.data)

    def _create_area_and_rubric(self):
        area = Area.objects.create(name='Produção', description='Área')
        AreaBudget.objects.create(area=area, allocated_amount=Decimal('80.00'))
        AreaLeaderAssignment.objects.create(area=area, user=self.leader)
        rubric = BudgetRubric.objects.create(area=area, name='Som', description='Som', allocated_amount=Decimal('50.00'))
        return area, rubric

    def test_leader_dashboard_is_scoped_to_own_area(self):
        area, rubric = self._create_area_and_rubric()
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
                'justification': 'Nao deveria passar',
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

    def test_leader_cannot_request_more_than_rubric_available(self):
        _, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '70.00',
                'description': 'Locação',
                'justification': 'Precisamos do equipamento',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('amount', response.data)

    def test_approval_commits_budget_and_reimbursement_requires_receipt(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '30.00',
                'description': 'Cabos novos',
                'justification': 'Substituição urgente',
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

    def test_advance_can_be_executed_without_receipt_and_creates_audit(self):
        area, rubric = self._create_area_and_rubric()
        self.client.force_authenticate(self.leader)
        create_response = self.client.post(
            reverse('finance:finance-request-list'),
            {
                'rubric': rubric.id,
                'amount': '20.00',
                'description': 'Frete',
                'justification': 'Entrega',
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
