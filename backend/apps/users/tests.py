from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.enrollments.models import Enrollment
from apps.enrollments.models import Settings
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
        self.assertIn('enable_pix_installment', response.data)
        self.assertIn('enable_shirt_size_field', response.data)

    def test_admin_can_patch_settings(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.patch(
            reverse('users:admin-settings'),
            {
                'max_installments': 5,
                'enable_pix_installment': False,
                'enable_shirt_size_field': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        settings = Settings.get_settings()
        self.assertEqual(settings.max_installments, 5)
        self.assertFalse(settings.enable_pix_installment)
        self.assertFalse(settings.enable_shirt_size_field)

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
