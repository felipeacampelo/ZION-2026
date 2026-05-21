from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.enrollments.models import Enrollment
from apps.enrollments.models import Settings
from apps.payments.models import Payment
from apps.products.models import Batch, Product


User = get_user_model()


class PaymentSecurityTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            email='owner@example.com',
            password='password123',
            first_name='Owner',
            last_name='User',
        )
        self.other_user = User.objects.create_user(
            email='other@example.com',
            password='password123',
            first_name='Other',
            last_name='User',
        )

        self.product = Product.objects.create(
            name='Acampamento Teste',
            description='Produto de teste',
            base_price=Decimal('100.00'),
            max_installments=8,
            is_active=True,
        )

        now = timezone.now()
        self.batch = Batch.objects.create(
            product=self.product,
            name='Lote 1',
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=10),
            price=Decimal('100.00'),
            pix_installment_price=Decimal('120.00'),
            credit_card_price=Decimal('130.00'),
            status='ACTIVE',
        )

        self.owner_enrollment = Enrollment.objects.create(
            user=self.owner,
            product=self.product,
            batch=self.batch,
            form_data={'email': self.owner.email},
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )

        self.other_enrollment = Enrollment.objects.create(
            user=self.other_user,
            product=self.product,
            batch=self.batch,
            form_data={'email': self.other_user.email},
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )

        self.owner_payment = Payment.objects.create(
            enrollment=self.owner_enrollment,
            asaas_payment_id='pay-owner-1',
            installment_number=1,
            amount=Decimal('100.00'),
            status='PENDING',
            due_date=timezone.now().date(),
        )

        self.other_payment = Payment.objects.create(
            enrollment=self.other_enrollment,
            asaas_payment_id='pay-other-1',
            installment_number=1,
            amount=Decimal('100.00'),
            status='PENDING',
            due_date=timezone.now().date(),
        )

    def test_payment_list_returns_only_authenticated_users_payments(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(reverse('payments:payment-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], self.owner_payment.id)

    def test_payment_patch_is_not_allowed(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.patch(
            reverse('payments:payment-detail', args=[self.owner_payment.id]),
            {'status': 'CONFIRMED'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    @patch('apps.payments.services.PaymentService')
    def test_create_payment_allows_owner(self, mock_service_class):
        service_instance = mock_service_class.return_value

        def create_payment(enrollment):
            return Payment.objects.create(
                enrollment=enrollment,
                asaas_payment_id='pay-created-1',
                installment_number=1,
                amount=enrollment.final_amount,
                status='PENDING',
                due_date=timezone.now().date(),
            )

        service_instance.create_pix_cash_payment.side_effect = create_payment

        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:payment-list'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'PIX_CASH',
                'installments': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['asaas_payment_id'], 'pay-created-1')
        self.assertEqual(response.data['enrollment']['id'], self.owner_enrollment.id)

    @override_settings(FRONTEND_URL='https://zion2026.com.br')
    @patch('apps.payments.services.asaas_service.AsaasService.create_credit_card_payment')
    @patch('apps.payments.services.payment_service.PaymentService.ensure_customer_exists')
    def test_create_credit_card_payment_configures_return_url(
        self,
        mock_ensure_customer_exists,
        mock_create_credit_card_payment,
    ):
        mock_ensure_customer_exists.return_value = 'cus_test_123'
        mock_create_credit_card_payment.return_value = {
            'id': 'pay-card-1',
            'invoiceUrl': 'https://sandbox.asaas.com/i/pay-card-1',
        }

        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:payment-list'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'CREDIT_CARD',
                'installments': 3,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mock_create_credit_card_payment.assert_called_once_with(
            customer_id='cus_test_123',
            value=Decimal('130.00'),
            description=f'Inscrição - {self.owner_enrollment.product.name}',
            external_reference=str(self.owner_enrollment.id),
            installments=3,
            callback_success_url=f'https://zion2026.com.br/payment/{self.owner_enrollment.id}?source=asaas',
            callback_auto_redirect=True,
        )
        self.assertEqual(response.data['payment_url'], 'https://sandbox.asaas.com/i/pay-card-1')

    def test_create_payment_rejects_other_users_enrollment(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:payment-list'),
            {
                'enrollment_id': self.other_enrollment.id,
                'payment_method': 'PIX_CASH',
                'installments': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('enrollment_id', response.data)

    def test_calculate_payment_rejects_other_users_enrollment(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:calculate'),
            {
                'enrollment_id': self.other_enrollment.id,
                'payment_method': 'PIX_CASH',
                'installments': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_calculate_payment_allows_owner(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:calculate'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'PIX_CASH',
                'installments': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['final_amount'], 100.0)

    def test_calculate_payment_rejects_pix_installment_when_disabled(self):
        settings = Settings.get_settings()
        settings.enable_pix_installment = False
        settings.save(update_fields=['enable_pix_installment'])

        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:calculate'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'PIX_INSTALLMENT',
                'installments': 2,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('detail', response.data)

    def test_create_payment_rejects_pix_cash_when_disabled(self):
        settings = Settings.get_settings()
        settings.enable_pix_cash = False
        settings.save(update_fields=['enable_pix_cash'])

        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:payment-list'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'PIX_CASH',
                'installments': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('payment_method', response.data)

    def test_simulate_pix_is_hidden_outside_debug(self):
        with override_settings(DEBUG=False):
            response = self.client.post(
                reverse('payments:simulate-pix'),
                {
                    'payment_id': 'pay_test',
                    'pix_payload': '000201',
                    'value': 1,
                },
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch('apps.payments.services.payment_service.AsaasService')
    def test_recreate_pix_payment_updates_cancelled_payment(self, mock_asaas_class):
        from apps.payments.services import PaymentService

        cancelled_payment = Payment.objects.create(
            enrollment=self.owner_enrollment,
            asaas_payment_id='pay-owner-cancelled',
            installment_number=2,
            amount=Decimal('20.00'),
            status='CANCELLED',
            due_date=timezone.now().date(),
        )

        asaas_instance = mock_asaas_class.return_value
        asaas_instance.create_pix_payment.return_value = {
            'id': 'pay-owner-reissued',
            'invoiceUrl': 'https://example.com/invoice',
        }
        asaas_instance.get_pix_qrcode.return_value = {
            'encodedImage': 'base64-qr',
            'payload': 'pix-copy-paste',
        }

        service = PaymentService()
        service.ensure_customer_exists = MagicMock(return_value='cus_test_123')

        recreated = service.recreate_pix_payment(cancelled_payment, due_days=3)

        self.assertEqual(recreated.id, cancelled_payment.id)
        self.assertEqual(recreated.asaas_payment_id, 'pay-owner-reissued')
        self.assertEqual(recreated.status, 'PENDING')
        self.assertEqual(recreated.payment_url, 'https://example.com/invoice')
        self.assertEqual(recreated.pix_qr_code, 'base64-qr')
        self.assertEqual(recreated.pix_copy_paste, 'pix-copy-paste')
        self.assertEqual(recreated.due_date, timezone.now().date() + timedelta(days=3))
        self.assertEqual(recreated.raw_webhook_data['created']['id'], 'pay-owner-reissued')

    def test_create_payment_rejects_pix_installment_when_disabled(self):
        settings = Settings.get_settings()
        settings.enable_pix_installment = False
        settings.save(update_fields=['enable_pix_installment'])

        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:payment-list'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'PIX_INSTALLMENT',
                'installments': 2,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('payment_method', response.data)

    def test_create_payment_rejects_credit_card_when_disabled(self):
        settings = Settings.get_settings()
        settings.enable_credit_card = False
        settings.save(update_fields=['enable_credit_card'])

        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            reverse('payments:payment-list'),
            {
                'enrollment_id': self.owner_enrollment.id,
                'payment_method': 'CREDIT_CARD',
                'installments': 1,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('payment_method', response.data)
