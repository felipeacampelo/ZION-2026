from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.enrollments.email_service import render_email_template
from apps.enrollments.models import EmailCampaign, EmailCampaignRecipient, EmailTemplate, Enrollment, Settings
from apps.products.models import Batch, Product


User = get_user_model()


class AdminEnrollmentSearchTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin@example.com',
            password='password123',
            first_name='Admin',
            last_name='User',
            is_staff=True,
        )
        self.matching_user = User.objects.create_user(
            email='maria@example.com',
            password='password123',
            first_name='Maria',
            last_name='Silva',
        )
        self.other_user = User.objects.create_user(
            email='joao@example.com',
            password='password123',
            first_name='Joao',
            last_name='Pereira',
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

        self.matching_enrollment = Enrollment.objects.create(
            user=self.matching_user,
            product=self.product,
            batch=self.batch,
            form_data={},
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )
        self.other_enrollment = Enrollment.objects.create(
            user=self.other_user,
            product=self.product,
            batch=self.batch,
            form_data={},
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )

    def test_admin_enrollment_search_matches_user_name(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(
            reverse('users:admin-enrollments-list'),
            {'search': 'Maria'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['id'], self.matching_enrollment.id)


class AdminSettingsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin-settings@example.com',
            password='password123',
            is_staff=True,
        )
        self.user = User.objects.create_user(
            email='member@example.com',
            password='password123',
        )

    def test_admin_can_get_settings(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse('users:admin-settings'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('max_installments', response.data)
        self.assertIn('enable_pix_cash', response.data)
        self.assertIn('enable_pix_installment', response.data)
        self.assertIn('enable_credit_card', response.data)
        self.assertIn('enable_shirt_size_field', response.data)
        self.assertIn('form_fields_config', response.data)

    def test_admin_can_patch_settings(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse('users:admin-settings'),
            {
                'max_installments': 5,
                'enable_pix_cash': True,
                'enable_pix_installment': False,
                'enable_credit_card': True,
                'enable_shirt_size_field': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        settings = Settings.get_settings()
        self.assertEqual(settings.max_installments, 5)
        self.assertFalse(settings.enable_pix_installment)
        self.assertFalse(settings.enable_shirt_size_field)

    def test_admin_settings_reject_disabling_all_payment_methods(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse('users:admin-settings'),
            {
                'enable_pix_cash': False,
                'enable_pix_installment': False,
                'enable_credit_card': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_patch_settings(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            reverse('users:admin-settings'),
            {'max_installments': 5},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_settings_reject_invalid_installments(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse('users:admin-settings'),
            {'max_installments': 13},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('max_installments', response.data)


class AdminEmailTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email='admin-email@example.com',
            password='password123',
            is_staff=True,
        )
        self.user = User.objects.create_user(
            email='email-member@example.com',
            password='password123',
            first_name='Maria',
            last_name='Silva',
        )
        self.user_duplicate = User.objects.create_user(
            email='second@example.com',
            password='password123',
            first_name='Joao',
            last_name='Souza',
        )

        self.product = Product.objects.create(
            name='Acampamento',
            description='Produto para email',
            base_price=Decimal('100.00'),
            max_installments=8,
            is_active=True,
        )

        now = timezone.now()
        self.batch = Batch.objects.create(
            product=self.product,
            name='Lote Email',
            start_date=now - timedelta(days=1),
            end_date=now + timedelta(days=10),
            price=Decimal('100.00'),
            pix_installment_price=Decimal('120.00'),
            credit_card_price=Decimal('130.00'),
            status='ACTIVE',
        )

        self.enrollment = Enrollment.objects.create(
            user=self.user,
            product=self.product,
            batch=self.batch,
            form_data={
                'nome_completo': 'Maria Silva',
                'email': 'maria@example.com',
            },
            status='PENDING_PAYMENT',
            payment_method='PIX_CASH',
            installments=1,
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )
        self.duplicate_email_enrollment = Enrollment.objects.create(
            user=self.user_duplicate,
            product=self.product,
            batch=self.batch,
            form_data={
                'nome_completo': 'Maria Repetida',
                'email': 'maria@example.com',
            },
            status='PENDING_PAYMENT',
            payment_method='PIX_CASH',
            installments=1,
            total_amount=Decimal('100.00'),
            discount_amount=Decimal('0.00'),
            final_amount=Decimal('100.00'),
        )

    def test_template_render_falls_back_to_code_defaults(self):
        rendered = render_email_template('enrollment_confirmation', {'produto': 'Evento Teste', 'nome': 'Maria'})
        self.assertIn('Evento Teste', rendered['subject'])
        self.assertIn('Maria', rendered['html_content'])

    def test_admin_can_list_email_templates(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('users:admin-email-templates-list'))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 4)
        self.assertTrue(any(item['key'] == 'enrollment_confirmation' for item in response.data))

    def test_admin_can_update_email_template(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            reverse('users:admin-email-template-detail', args=['enrollment_confirmation']),
            {'subject': 'Novo assunto {{ produto }}'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        template = EmailTemplate.objects.get(key='enrollment_confirmation')
        self.assertEqual(template.subject, 'Novo assunto {{ produto }}')

    def test_template_preview_renders_tokens(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-template-preview', args=['payment_confirmation']),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('Acampamento Área Mais', response.data['subject'])
        self.assertIn('Maria da Silva', response.data['html_content'])

    @patch('apps.users.admin_email_views.send_template_test_email')
    def test_template_test_send_uses_service(self, mock_send_test):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-template-send-test', args=['password_reset']),
            {'to_email': 'destino@example.com'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send_test.assert_called_once_with('password_reset', 'destino@example.com')

    def test_admin_can_create_campaign_draft(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-campaigns'),
            {
                'name': 'Campanha Teste',
                'subject': 'Olá {{ nome }}',
                'html_content': '<p>Oi {{ nome }}</p>',
                'text_content': 'Oi {{ nome }}',
                'filters': {'product': self.product.id, 'status': 'PENDING_PAYMENT'},
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(EmailCampaign.objects.count(), 1)
        self.assertEqual(response.data['status'], 'DRAFT')

    def test_campaign_preview_recipients_dedupes_emails(self):
        campaign = EmailCampaign.objects.create(
            name='Campanha Preview',
            subject='Assunto',
            html_content='<p>Teste</p>',
            text_content='Teste',
            filters={'product': self.product.id, 'status': 'PENDING_PAYMENT'},
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-campaign-preview-recipients', args=[campaign.id]),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['sample']), 1)

    def test_campaign_preview_recipients_by_filters_works_without_draft(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-campaigns-preview-recipients'),
            {'product': self.product.id, 'status': 'PENDING_PAYMENT'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['sample']), 1)

    @patch('apps.users.admin_email_views.start_campaign_send')
    def test_campaign_send_builds_snapshot_and_starts_async(self, mock_start_campaign_send):
        campaign = EmailCampaign.objects.create(
            name='Campanha Envio',
            subject='Assunto {{ nome }}',
            html_content='<p>Teste {{ nome }}</p>',
            text_content='Teste {{ nome }}',
            filters={'product': self.product.id, 'status': 'PENDING_PAYMENT'},
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-campaign-send', args=[campaign.id]),
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        campaign.refresh_from_db()
        self.assertEqual(campaign.recipient_count, 1)
        self.assertEqual(EmailCampaignRecipient.objects.filter(campaign=campaign).count(), 1)
        mock_start_campaign_send.assert_called_once()

    @patch('apps.users.admin_email_views.send_campaign_test_email')
    def test_campaign_test_send_uses_matching_recipient_context(self, mock_send_test):
        campaign = EmailCampaign.objects.create(
            name='Campanha Teste',
            subject='Assunto {{ nome }}',
            html_content='<p>Teste {{ nome }}</p>',
            text_content='Teste {{ nome }}',
            filters={'product': self.product.id, 'status': 'PENDING_PAYMENT'},
            created_by=self.admin,
        )

        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-campaign-send-test', args=[campaign.id]),
            {'to_email': 'teste@example.com'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send_test.assert_called_once()

    @patch('apps.users.admin_email_views.send_campaign_test_email')
    def test_campaign_draft_test_send_works_without_saved_campaign(self, mock_send_test):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            reverse('users:admin-email-campaigns-send-test-draft'),
            {
                'to_email': 'teste@example.com',
                'subject': 'Assunto {{ nome }}',
                'html_content': '<p>Teste {{ nome }}</p>',
                'text_content': 'Teste {{ nome }}',
                'filters': {'product': self.product.id, 'status': 'PENDING_PAYMENT'},
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send_test.assert_called_once()

    def test_non_admin_cannot_access_email_templates(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(reverse('users:admin-email-templates-list'))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
