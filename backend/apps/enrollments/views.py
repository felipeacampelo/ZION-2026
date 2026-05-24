"""
Enrollment views.
"""
import logging
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from .models import Enrollment, Settings
from .utils import find_duplicate_enrollment_by_cpf, normalize_digits
from .serializers import (
    EnrollmentSerializer,
    EnrollmentCreateSerializer,
    EnrollmentListSerializer
)

logger = logging.getLogger(__name__)


class EnrollmentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for enrollments.
    Users can create and view their own enrollments.
    """
    http_method_names = ['get', 'post', 'put', 'patch', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Return enrollments for current user."""
        if self.request.user.is_authenticated:
            return Enrollment.objects.filter(user=self.request.user).select_related(
                'product', 'batch', 'user'
            ).prefetch_related('payments')
        # Return empty queryset if not authenticated
        return Enrollment.objects.none()
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EnrollmentCreateSerializer
        elif self.action == 'list':
            return EnrollmentListSerializer
        return EnrollmentSerializer
    
    def create(self, request, *args, **kwargs):
        """Create new enrollment."""
        from .email_service import send_enrollment_confirmation_email
        
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        enrollment = serializer.save()
        
        # Send confirmation email (non-blocking)
        try:
            send_enrollment_confirmation_email(enrollment)
        except Exception as e:
            logger.error(f"Erro ao enviar email de confirmação: {e}")
        
        # Return full enrollment data
        response_serializer = EnrollmentSerializer(enrollment)
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED
        )
    
    def update(self, request, *args, **kwargs):
        """Update enrollment form_data and optionally apply coupon."""
        from decimal import Decimal
        from .models import Coupon
        
        enrollment = self.get_object()
        
        # Check if there are confirmed payments
        has_confirmed_payments = enrollment.payments.filter(status__in=['CONFIRMED', 'RECEIVED']).exists()
        
        if has_confirmed_payments:
            # Only allow editing 'observacoes' field when payment is confirmed
            form_data = request.data.get('form_data', {})
            
            # Check if trying to edit fields other than observacoes
            if 'coupon_code' in request.data:
                return Response(
                    {'detail': 'Não é possível aplicar cupom em inscrição com pagamentos confirmados'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if trying to edit other form_data fields besides observacoes
            if form_data:
                forbidden_fields = [key for key in form_data.keys() if key != 'observacoes']
                if forbidden_fields:
                    return Response(
                        {'detail': 'Apenas o campo de observações pode ser editado após pagamento confirmado'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Update only observacoes
                if 'observacoes' in form_data:
                    enrollment.form_data['observacoes'] = form_data['observacoes']
                    enrollment.save()
            
            serializer = self.get_serializer(enrollment)
            return Response(serializer.data)
        
        # Original behavior for enrollments without confirmed payments
        # Update form_data
        if 'form_data' in request.data:
            enrollment.form_data.update(request.data['form_data'])
            cpf = normalize_digits(enrollment.form_data.get('cpf'))
            if cpf:
                enrollment.form_data['cpf'] = cpf
                duplicate_enrollment = find_duplicate_enrollment_by_cpf(
                    product=enrollment.product,
                    cpf=cpf,
                    exclude_enrollment_id=enrollment.id,
                )
                if duplicate_enrollment:
                    return Response(
                        {'detail': f'Já existe uma inscrição para este CPF em {enrollment.product.name}.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
        
        # Apply coupon if provided and enrollment doesn't have one yet
        if 'coupon_code' in request.data and not enrollment.coupon:
            coupon_code = request.data['coupon_code']
            from .models import Settings

            if not Settings.get_settings().enable_coupons:
                return Response(
                    {'detail': 'Cupons estão desativados no momento'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                coupon = Coupon.objects.get(code=coupon_code.strip().upper())
                
                # Validate coupon
                is_valid, message = coupon.is_valid()
                if not is_valid:
                    return Response(
                        {'detail': message},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Check product restriction
                if not coupon.can_apply_to_product(enrollment.product):
                    return Response(
                        {'detail': 'Este cupom não é válido para este produto'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Check minimum purchase
                if enrollment.total_amount < coupon.min_purchase:
                    return Response(
                        {'detail': f'Valor mínimo para este cupom é R$ {coupon.min_purchase}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                
                # Apply coupon
                enrollment.coupon = coupon
                discount_amount = Decimal(str(coupon.calculate_discount(enrollment.total_amount)))
                enrollment.discount_amount = discount_amount
                enrollment.final_amount = enrollment.total_amount - discount_amount
                
                # Increment coupon usage
                coupon.increment_uses()
                
            except Coupon.DoesNotExist:
                return Response(
                    {'detail': 'Cupom não encontrado'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        enrollment.save()
        
        serializer = self.get_serializer(enrollment)
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        """Partial update enrollment form_data."""
        return self.update(request, *args, **kwargs)
    
    @action(detail=True, methods=['get'])
    def payments(self, request, pk=None):
        """Get all payments for an enrollment."""
        from apps.payments.serializers import PaymentListSerializer
        
        enrollment = self.get_object()
        payments = enrollment.payments.all().order_by('installment_number')
        serializer = PaymentListSerializer(payments, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel an enrollment."""
        enrollment = self.get_object()
        
        if enrollment.status == 'PAID':
            return Response(
                {'detail': 'Inscrições pagas não podem ser canceladas'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        enrollment.status = 'CANCELLED'
        enrollment.save()
        
        serializer = self.get_serializer(enrollment)
        return Response(serializer.data)


@api_view(['GET'])
def get_settings(request):
    """Get global application settings."""
    settings = Settings.get_settings()
    return Response({
        'home_description': settings.home_description,
        'home_date_text': settings.home_date_text,
        'home_location_text': settings.home_location_text,
        'home_location_subtext': settings.home_location_subtext,
        'enrollment_start_at': settings.enrollment_start_at,
        'enrollment_end_at': settings.enrollment_end_at,
        'max_installments': settings.max_installments,
        'max_installments_with_coupon': settings.max_installments_with_coupon,
        'enable_pix_cash': settings.enable_pix_cash,
        'enable_pix_installment': settings.enable_pix_installment,
        'enable_credit_card': settings.enable_credit_card,
        'enable_shirt_size_field': settings.enable_shirt_size_field,
        'form_fields_config': settings.get_form_fields_config(),
        'responsible_fields_config': settings.get_responsible_fields_config(),
        'max_age_years': settings.max_age_years,
        'min_birth_year': settings.min_birth_year,
        'max_birth_year': settings.max_birth_year,
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def check_cpf(request):
    product_id = request.data.get('product_id')
    cpf = normalize_digits(request.data.get('cpf'))

    if not product_id:
        return Response({'detail': 'product_id é obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)

    if not cpf:
        return Response({'exists': False, 'message': ''})

    from apps.products.models import Product

    try:
        product = Product.objects.get(id=product_id, is_active=True)
    except Product.DoesNotExist:
        return Response({'detail': 'Produto não encontrado ou inativo.'}, status=status.HTTP_404_NOT_FOUND)

    duplicate_enrollment = find_duplicate_enrollment_by_cpf(product=product, cpf=cpf)
    if not duplicate_enrollment:
        return Response({'exists': False, 'message': ''})

    return Response({
        'exists': True,
        'message': f'Já existe uma inscrição para este CPF em {product.name}.',
        'enrollment_id': duplicate_enrollment.id,
    })
