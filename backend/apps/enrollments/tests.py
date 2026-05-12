from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.enrollments.models import Settings
from apps.products.models import Batch, Product


User = get_user_model()


class EnrollmentSecurityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='participant@example.com',
            password='password123',
            first_name='Participant',
            last_name='User',
        )

        self.product = Product.objects.create(
            name='Produto Teste',
            description='Produto para teste',
            base_price=Decimal('100.00'),
            max_installments=8,
            is_active=True,
        )

        now = timezone.now()
        self.batch = Batch.objects.create(
            product=self.product,
            name='Lote Teste',
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=10),
            price=Decimal('100.00'),
            pix_installment_price=Decimal('120.00'),
            credit_card_price=Decimal('130.00'),
            status='ACTIVE',
        )

    def test_anonymous_cannot_list_enrollments(self):
        response = self.client.get(reverse('enrollments:enrollment-list'))

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('apps.enrollments.email_service.send_enrollment_confirmation_email')
    def test_authenticated_user_can_create_enrollment(self, mock_send_email):
        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            reverse('enrollments:enrollment-list'),
            {
                'product_id': self.product.id,
                'batch_id': self.batch.id,
                'form_data': {
                    'email': self.user.email,
                    'nome_completo': 'Participant User',
                    'telefone': '(11) 99999-0000',
                    'data_nascimento': '2000-01-01',
                    'cpf': '123.456.789-00',
                    'rg': '12.345.678-9',
                    'cep': '01000-000',
                    'tamanho_camiseta': 'G',
                    'membro_batista_capital': 'sim',
                    'lider_pg': 'Não tenho PG',
                },
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['product']['id'], self.product.id)
        self.assertEqual(response.data['batch']['id'], self.batch.id)

    def test_public_settings_exposes_feature_flags(self):
        settings = Settings.get_settings()
        settings.enable_pix_cash = False
        settings.enable_pix_installment = False
        settings.enable_credit_card = False
        settings.enable_shirt_size_field = False
        settings.max_installments = 4
        settings.save()

        response = self.client.get(reverse('enrollments:get-settings'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['max_installments'], 4)
        self.assertFalse(response.data['enable_pix_cash'])
        self.assertFalse(response.data['enable_pix_installment'])
        self.assertFalse(response.data['enable_credit_card'])
        self.assertFalse(response.data['enable_shirt_size_field'])
        self.assertIn('form_fields_config', response.data)

    @patch('apps.enrollments.email_service.send_enrollment_confirmation_email')
    def test_create_enrollment_ignores_shirt_size_when_disabled(self, mock_send_email):
        settings = Settings.get_settings()
        settings.enable_shirt_size_field = False
        settings.save(update_fields=['enable_shirt_size_field'])

        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            reverse('enrollments:enrollment-list'),
            {
                'product_id': self.product.id,
                'batch_id': self.batch.id,
                'form_data': {
                    'email': self.user.email,
                    'nome_completo': 'Participant User',
                    'telefone': '(11) 99999-0000',
                    'data_nascimento': '2000-01-01',
                    'cpf': '123.456.789-00',
                    'rg': '12.345.678-9',
                    'cep': '01000-000',
                    'tamanho_camiseta': 'G',
                    'membro_batista_capital': 'sim',
                    'lider_pg': 'Não tenho PG',
                },
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('tamanho_camiseta', response.data['form_data'])

    @patch('apps.enrollments.email_service.send_enrollment_confirmation_email')
    def test_create_enrollment_respects_required_form_field_config(self, mock_send_email):
        settings = Settings.get_settings()
        form_fields = settings.get_form_fields_config()
        form_fields['telefone']['required'] = False
        settings.form_fields_config = {
            key: {'enabled': value['enabled'], 'required': value['required']}
            for key, value in form_fields.items()
        }
        settings.save()

        self.client.force_authenticate(user=self.user)

        response = self.client.post(
            reverse('enrollments:enrollment-list'),
            {
                'product_id': self.product.id,
                'batch_id': self.batch.id,
                'form_data': {
                    'email': self.user.email,
                    'nome_completo': 'Participant User',
                    'data_nascimento': '2000-01-01',
                    'cpf': '123.456.789-00',
                    'rg': '12.345.678-9',
                    'cep': '01000-000',
                    'tamanho_camiseta': 'G',
                    'membro_batista_capital': 'sim',
                    'lider_pg': 'Não tenho PG',
                },
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
