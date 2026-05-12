"""
Admin views for managing system data.
"""
from collections import OrderedDict
from decimal import Decimal

from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from django.db.models import Count, Sum, Q
from django.utils import timezone
from datetime import timedelta

from .permissions import IsAdminUser
from apps.enrollments.models import Enrollment, Settings as AppSettings
from apps.enrollments.serializers import EnrollmentSerializer
from apps.payments.models import Payment
from apps.products.models import Product, Batch
from apps.products.serializers import ProductSerializer, BatchSerializer


class AdminSettingsSerializer(serializers.ModelSerializer):
    form_fields_config = serializers.JSONField(required=False)

    class Meta:
        model = AppSettings
        fields = [
            'max_installments',
            'max_installments_with_coupon',
            'enable_pix_cash',
            'enable_pix_installment',
            'enable_credit_card',
            'enable_shirt_size_field',
            'form_fields_config',
        ]
        read_only_fields = ['max_installments_with_coupon']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['form_fields_config'] = instance.get_form_fields_config()
        return data

    def validate(self, attrs):
        enable_pix_cash = attrs.get('enable_pix_cash', self.instance.enable_pix_cash if self.instance else True)
        enable_pix_installment = attrs.get('enable_pix_installment', self.instance.enable_pix_installment if self.instance else True)
        enable_credit_card = attrs.get('enable_credit_card', self.instance.enable_credit_card if self.instance else True)

        if not any([enable_pix_cash, enable_pix_installment, enable_credit_card]):
            raise serializers.ValidationError('Pelo menos uma forma de pagamento deve permanecer ativa.')

        raw_form_fields = attrs.get('form_fields_config')
        if raw_form_fields is not None:
            normalized = self.instance.get_form_fields_config() if self.instance else AppSettings().get_form_fields_config()
            for field_name, current in normalized.items():
                incoming = raw_form_fields.get(field_name, {})
                enabled = bool(incoming.get('enabled', current['enabled']))
                required = bool(incoming.get('required', current['required'])) if enabled else False
                normalized[field_name] = {
                    'enabled': enabled,
                    'required': required,
                    'label': current['label'],
                }

            attrs['form_fields_config'] = {
                field_name: {
                    'enabled': config['enabled'],
                    'required': config['required'],
                }
                for field_name, config in normalized.items()
            }
            attrs['enable_shirt_size_field'] = normalized['tamanho_camiseta']['enabled']

        return attrs


class AdminEnrollmentPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminBatchListSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    current_enrollments = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)

    class Meta:
        model = Batch
        fields = [
            'id',
            'product',
            'product_name',
            'name',
            'start_date',
            'end_date',
            'price',
            'pix_installment_price',
            'credit_card_price',
            'max_enrollments',
            'current_enrollments',
            'is_full',
            'status',
            'is_visible_on_site',
        ]


def calculate_asaas_fee(payment_amount, payment_method, installments):
    """
    Calculate Asaas fee based on payment method and installments.
    
    Taxas:
    - PIX (à vista ou parcelado): R$ 1,99 por transação
    - Cartão à vista: R$ 0,49 + 2,99%
    - Cartão 2-6 parcelas: R$ 0,49 + 2,49%
    - Cartão 7-12 parcelas: R$ 0,49 + 2,99%
    """
    amount = Decimal(str(payment_amount))
    
    if payment_method in ['PIX_CASH', 'PIX_INSTALLMENT']:
        return Decimal('1.99')
    elif payment_method == 'CREDIT_CARD':
        fixed_fee = Decimal('0.49')
        if installments == 1:
            percentage_fee = amount * Decimal('0.0299')
        elif 2 <= installments <= 6:
            percentage_fee = amount * Decimal('0.0249')
        else:  # 7-12 parcelas
            percentage_fee = amount * Decimal('0.0299')
        return fixed_fee + percentage_fee
    
    return Decimal('0')


def build_overdue_enrollments():
    """Build grouped overdue enrollments for admin dashboards."""
    today = timezone.localdate()
    unpaid_statuses = ['CREATED', 'PENDING', 'OVERDUE']
    payments = Payment.objects.select_related(
        'enrollment',
        'enrollment__product',
        'enrollment__batch',
        'enrollment__user',
    ).prefetch_related(
        'enrollment__payments',
    ).filter(
        due_date__lt=today,
        status__in=unpaid_statuses,
    ).order_by('enrollment_id', 'due_date', 'installment_number')

    grouped = OrderedDict()
    total_overdue_amount = Decimal('0')
    total_overdue_payments = 0

    for payment in payments:
        enrollment = payment.enrollment
        enrollment_id = enrollment.id

        if enrollment_id not in grouped:
            serialized_enrollment = EnrollmentSerializer(enrollment).data
            grouped[enrollment_id] = {
                **serialized_enrollment,
                'overdue_payments': [],
                'overdue_payments_count': 0,
                'total_overdue_amount': '0.00',
                'oldest_due_date': None,
            }

        days_overdue = (today - payment.due_date).days
        payment_amount = Decimal(str(payment.amount))
        payment_data = {
            'id': payment.id,
            'installment_number': payment.installment_number,
            'amount': str(payment.amount),
            'status': payment.status,
            'due_date': payment.due_date.isoformat() if payment.due_date else None,
            'paid_at': payment.paid_at.isoformat() if payment.paid_at else None,
            'days_overdue': days_overdue,
        }

        grouped[enrollment_id]['overdue_payments'].append(payment_data)
        grouped[enrollment_id]['overdue_payments_count'] += 1
        grouped[enrollment_id]['total_overdue_amount'] = str(
            Decimal(grouped[enrollment_id]['total_overdue_amount']) + payment_amount
        )
        if grouped[enrollment_id]['oldest_due_date'] is None:
            grouped[enrollment_id]['oldest_due_date'] = payment.due_date.isoformat()

        total_overdue_amount += payment_amount
        total_overdue_payments += 1

    results = sorted(
        grouped.values(),
        key=lambda item: (
            -item['overdue_payments_count'],
            -Decimal(item['total_overdue_amount']),
            item['oldest_due_date'] or '9999-12-31',
        ),
    )

    return {
        'count': len(grouped),
        'total_overdue_payments': total_overdue_payments,
        'total_overdue_amount': str(total_overdue_amount),
        'results': results,
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_dashboard_stats(request):
    """Get dashboard statistics for admin."""
    
    # Enrollment stats
    total_enrollments = Enrollment.objects.count()
    pending_enrollments = Enrollment.objects.filter(status='PENDING_PAYMENT').count()
    confirmed_enrollments = Enrollment.objects.filter(status='PAID').count()
    
    # Payment stats
    total_payments = Payment.objects.count()
    confirmed_payments = Payment.objects.filter(
        status__in=['CONFIRMED', 'RECEIVED']
    ).count()
    pending_payments = Payment.objects.filter(status='PENDING').count()
    
    # Revenue stats
    total_revenue = Payment.objects.filter(
        status__in=['CONFIRMED', 'RECEIVED']
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    pending_revenue = Payment.objects.filter(
        status='PENDING'
    ).aggregate(total=Sum('amount'))['total'] or 0
    
    # Calculate fees and net revenue
    total_fees = Decimal('0')
    confirmed_payments_list = Payment.objects.filter(
        status__in=['CONFIRMED', 'RECEIVED']
    ).select_related('enrollment')
    
    for payment in confirmed_payments_list:
        enrollment = payment.enrollment
        fee = calculate_asaas_fee(
            payment.amount,
            enrollment.payment_method,
            enrollment.installments
        )
        total_fees += fee
    
    net_revenue = Decimal(str(total_revenue)) - total_fees
    
    # Recent activity (last 7 days)
    week_ago = timezone.now() - timedelta(days=7)
    recent_enrollments = Enrollment.objects.filter(
        created_at__gte=week_ago
    ).count()
    
    recent_payments = Payment.objects.filter(
        created_at__gte=week_ago,
        status__in=['CONFIRMED', 'RECEIVED']
    ).count()
    
    # Payment methods breakdown
    payment_methods = Enrollment.objects.values('payment_method').annotate(count=Count('id'))
    
    # Enrollments by batch
    batches_stats = []
    for batch in Batch.objects.select_related('product').all():
        pending = batch.enrollments.filter(status='PENDING_PAYMENT').count()
        paid = batch.enrollments.filter(status='PAID').count()
        total = pending + paid
        batches_stats.append({
            'id': batch.id,
            'name': batch.name,
            'product_name': batch.product.name,
            'max_enrollments': batch.max_enrollments,
            'current_enrollments': total,
            'pending': pending,
            'paid': paid,
            'status': batch.status,
        })
    
    return Response({
        'enrollments': {
            'total': total_enrollments,
            'pending': pending_enrollments,
            'confirmed': confirmed_enrollments,
            'recent': recent_enrollments,
        },
        'payments': {
            'total': total_payments,
            'confirmed': confirmed_payments,
            'pending': pending_payments,
            'recent': recent_payments,
        },
        'revenue': {
            'total': float(total_revenue),
            'pending': float(pending_revenue),
            'fees': float(total_fees),
            'net': float(net_revenue),
        },
        'payment_methods': list(payment_methods),
        'batches': batches_stats,
    })


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_overdue_enrollments(request):
    """List grouped enrollments with overdue payments."""

    return Response(build_overdue_enrollments())


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_enrollments_list(request):
    """List all enrollments with filters."""
    
    enrollments = Enrollment.objects.select_related(
        'product', 'batch', 'user'
    ).prefetch_related('payments').order_by('-created_at')
    
    # Filters
    status_filter = request.query_params.get('status')
    product_filter = request.query_params.get('product')
    payment_method_filter = request.query_params.get('payment_method')
    search = request.query_params.get('search')
    
    if status_filter:
        enrollments = enrollments.filter(status=status_filter)
    
    if product_filter:
        enrollments = enrollments.filter(product_id=product_filter)
    
    if payment_method_filter:
        enrollments = enrollments.filter(payment_method=payment_method_filter)
    
    if search:
        enrollments = enrollments.filter(
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(user__email__icontains=search) |
            Q(form_data__nome_completo__icontains=search) |
            Q(form_data__email__icontains=search) |
            Q(form_data__cpf__icontains=search)
        )

    paginator = AdminEnrollmentPagination()
    page = paginator.paginate_queryset(enrollments, request)
    serializer = EnrollmentSerializer(page, many=True)
    return paginator.get_paginated_response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def admin_enrollment_update(request, pk):
    """Update enrollment status."""
    
    try:
        enrollment = Enrollment.objects.get(pk=pk)
    except Enrollment.DoesNotExist:
        return Response(
            {'detail': 'Inscrição não encontrada.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    new_status = request.data.get('status')
    if new_status:
        enrollment.status = new_status
        enrollment.save()
    
    serializer = EnrollmentSerializer(enrollment)
    return Response(serializer.data)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAdminUser])
def admin_settings(request):
    """Read and update global admin settings."""
    settings = AppSettings.get_settings()

    if request.method == 'GET':
        serializer = AdminSettingsSerializer(settings)
        return Response(serializer.data)

    serializer = AdminSettingsSerializer(settings, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_products_list(request):
    """List all products."""
    
    products = Product.objects.prefetch_related('batches').all()
    serializer = ProductSerializer(products, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_batches_list(request):
    """List all batches with product data for admin management."""

    batches = Batch.objects.select_related('product').all().order_by('start_date')
    serializer = AdminBatchListSerializer(batches, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_product_create(request):
    """Create a new product."""
    
    serializer = ProductSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def admin_product_update(request, pk):
    """Update a product."""
    
    try:
        product = Product.objects.get(pk=pk)
    except Product.DoesNotExist:
        return Response(
            {'detail': 'Produto não encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    serializer = ProductSerializer(product, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_product_delete(request, pk):
    """Delete a product."""
    
    try:
        product = Product.objects.get(pk=pk)
        product.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except Product.DoesNotExist:
        return Response(
            {'detail': 'Produto não encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_batch_create(request):
    """Create a new batch."""
    
    serializer = BatchSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([IsAdminUser])
def admin_batch_update(request, pk):
    """Update a batch."""
    
    try:
        batch = Batch.objects.get(pk=pk)
    except Batch.DoesNotExist:
        return Response(
            {'detail': 'Lote não encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    serializer = BatchSerializer(batch, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def admin_batch_delete(request, pk):
    """Delete a batch."""
    
    try:
        batch = Batch.objects.get(pk=pk)
        batch.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    except Batch.DoesNotExist:
        return Response(
            {'detail': 'Lote não encontrado.'},
            status=status.HTTP_404_NOT_FOUND
        )
