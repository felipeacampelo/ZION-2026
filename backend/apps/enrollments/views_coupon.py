"""
Coupon validation views.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from .models import Coupon, Settings


@api_view(['POST'])
@permission_classes([AllowAny])
def validate_coupon(request):
    """
    Validate a coupon code and return discount information.
    
    Expected payload:
    {
        "code": "PROMO2024",
        "product_id": 1,
        "amount": 900.00
    }
    """
    code = request.data.get('code', '').strip().upper()
    product_id = request.data.get('product_id')
    amount = request.data.get('amount')
    payment_method = request.data.get('payment_method')
    installments = request.data.get('installments', 1)

    if not Settings.get_settings().enable_coupons:
        return Response(
            {'error': 'Cupons estão desativados no momento'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not code:
        return Response(
            {'error': 'Código do cupom é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if not amount:
        return Response(
            {'error': 'Valor é obrigatório'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return Response(
            {'error': 'Valor inválido'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        installments = int(installments)
    except (ValueError, TypeError):
        installments = 1
    
    # Find coupon
    try:
        coupon = Coupon.objects.get(code=code)
    except Coupon.DoesNotExist:
        return Response(
            {'error': 'Cupom não encontrado'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Check if valid
    is_valid, message = coupon.is_valid()
    if not is_valid:
        return Response(
            {'error': message},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check product restriction
    if product_id:
        from apps.products.models import Product
        try:
            product = Product.objects.get(id=product_id)
            if not coupon.can_apply_to_product(product):
                return Response(
                    {'error': 'Este cupom não é válido para este produto'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Product.DoesNotExist:
            pass
    
    # Check minimum purchase
    if amount < float(coupon.min_purchase):
        return Response(
            {'error': f'Valor mínimo para este cupom é R$ {coupon.min_purchase}'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if payment_method:
        can_apply, message = coupon.can_apply_to_payment(payment_method, installments)
        if not can_apply:
            return Response(
                {'error': message},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # Calculate discount
    discount = float(coupon.calculate_discount(amount))
    final_amount = amount - discount
    
    return Response({
        'valid': True,
        'coupon': {
            'id': coupon.id,
            'code': coupon.code,
            'discount_type': coupon.discount_type,
            'discount_value': float(coupon.discount_value),
            'description': coupon.description,
        },
        'discount_amount': discount,
        'final_amount': final_amount,
        'message': f'Cupom aplicado! Desconto de R$ {discount:.2f}'
    })
