"""
Enrollment serializers.
"""
from decimal import Decimal
from rest_framework import serializers
from .models import DEFAULT_FORM_FIELDS_CONFIG, Enrollment
from apps.products.serializers import ProductSerializer, BatchSerializer


class EnrollmentSerializer(serializers.ModelSerializer):
    """Serializer for Enrollment model."""
    
    product = ProductSerializer(read_only=True)
    batch = BatchSerializer(read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)
    installment_value = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        read_only=True
    )
    max_installments = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    
    def get_max_installments(self, obj):
        """Get max installments based on coupon and global settings."""
        from .models import Settings
        
        if obj.coupon and obj.coupon.enable_12x_installments:
            return obj.coupon.max_installments
        
        # Use global settings default
        settings = Settings.get_settings()
        return settings.max_installments
    
    def get_payments(self, obj):
        """Get payments for this enrollment."""
        try:
            payments = obj.payments.all().order_by('due_date')
            return [{
                'id': p.id,
                'amount': str(p.amount),
                'status': p.status,
                'installment_number': p.installment_number,
                'due_date': p.due_date.isoformat() if p.due_date else None,
                'paid_at': p.paid_at.isoformat() if p.paid_at else None,
                'pix_qr_code': getattr(p, 'pix_qr_code', None),
                'pix_copy_paste': getattr(p, 'pix_copy_paste', None),
            } for p in payments]
        except Exception as e:
            return []
    
    class Meta:
        model = Enrollment
        fields = [
            'id',
            'user_email',
            'product',
            'batch',
            'form_data',
            'status',
            'payment_method',
            'installments',
            'max_installments',
            'total_amount',
            'discount_amount',
            'final_amount',
            'installment_value',
            'payments',
            'created_at',
            'paid_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'total_amount',
            'discount_amount',
            'final_amount',
            'created_at',
            'paid_at',
        ]


class EnrollmentCreateSerializer(serializers.Serializer):
    """Serializer for creating enrollment."""
    
    product_id = serializers.IntegerField()
    batch_id = serializers.IntegerField()
    form_data = serializers.JSONField(required=False, default=dict)
    coupon_code = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        """Validate product and batch."""
        from apps.products.models import Product, Batch
        from .models import Settings
        from datetime import datetime
        
        try:
            product = Product.objects.get(id=data['product_id'], is_active=True)
        except Product.DoesNotExist:
            raise serializers.ValidationError({'product_id': 'Produto não encontrado ou inativo'})
        
        try:
            batch = Batch.objects.get(id=data['batch_id'], product=product)
        except Batch.DoesNotExist:
            raise serializers.ValidationError({'batch_id': 'Lote não encontrado'})
        
        if batch.is_full:
            raise serializers.ValidationError({'batch_id': 'Lote esgotado'})
        
        if batch.status != 'ACTIVE':
            raise serializers.ValidationError({'batch_id': 'Lote não está ativo'})
        
        form_data = dict(data.get('form_data', {}))
        settings = Settings.get_settings()
        form_fields_config = settings.get_form_fields_config()
        responsible_fields_config = settings.get_responsible_fields_config()
        conditional_required_fields = {
            'igreja': form_data.get('membro_batista_capital') == 'nao',
        }

        for field_name in DEFAULT_FORM_FIELDS_CONFIG:
            field_config = form_fields_config[field_name]
            value = form_data.get(field_name)

            if not field_config['enabled']:
                form_data.pop(field_name, None)
                continue

            is_required = field_config['required']
            if field_name in conditional_required_fields:
                is_required = is_required and conditional_required_fields[field_name]

            if is_required and (value is None or str(value).strip() == ''):
                raise serializers.ValidationError({
                    'form_data': f'O campo "{field_config["label"]}" é obrigatório.'
                })

        data['form_data'] = form_data

        settings = Settings.get_settings()
        enrollment_window_status = settings.get_enrollment_window_status()
        if enrollment_window_status != 'open':
            raise serializers.ValidationError({
                'detail': settings.get_enrollment_window_message()
            })

        data_nascimento = form_data.get('data_nascimento')
        
        if data_nascimento:
            try:
                birth_date = datetime.strptime(data_nascimento, '%Y-%m-%d').date()
                if birth_date.year < settings.min_birth_year:
                    raise serializers.ValidationError({
                        'form_data': f'Inscrições disponíveis apenas para nascidos em {settings.min_birth_year} ou depois.'
                    })
            except ValueError:
                raise serializers.ValidationError({
                    'form_data': 'Data de nascimento inválida. Use o formato AAAA-MM-DD.'
                })

        responsible_data = form_data.get('responsavel', {})
        if not isinstance(responsible_data, dict):
            raise serializers.ValidationError({
                'form_data': 'Os dados do responsável devem ser enviados em formato válido.'
            })

        normalized_responsible_data = {}
        for field_config in responsible_fields_config:
            key = field_config['key']
            value = responsible_data.get(key)

            if field_config['required']:
                if field_config['type'] == 'checkbox':
                    if value is not True:
                        raise serializers.ValidationError({
                            'form_data': f'O campo "{field_config["label"]}" é obrigatório.'
                        })
                elif value is None or str(value).strip() == '':
                    raise serializers.ValidationError({
                        'form_data': f'O campo "{field_config["label"]}" é obrigatório.'
                    })

            if field_config['type'] == 'checkbox':
                normalized_responsible_data[key] = bool(value)
                continue

            if value is None:
                normalized_responsible_data[key] = ''
                continue

            string_value = str(value).strip()
            if field_config['type'] == 'select' and string_value and string_value not in field_config['options']:
                raise serializers.ValidationError({
                    'form_data': f'O valor selecionado para "{field_config["label"]}" é inválido.'
                })

            normalized_responsible_data[key] = string_value

        form_data['responsavel'] = normalized_responsible_data
        data['form_data'] = form_data
        
        # Check for duplicate enrollment
        request = self.context.get('request')
        
        # If user is authenticated, check by user
        if request and request.user.is_authenticated:
            existing_enrollment = Enrollment.objects.filter(
                user=request.user,
                product=product,
                status__in=['PENDING_PAYMENT', 'PAID']
            ).exists()
            
            if existing_enrollment:
                raise serializers.ValidationError({
                    'form_data': 'Você já possui uma inscrição ativa para este produto. Cada pessoa pode fazer apenas uma inscrição.'
                })
        else:
            # If not authenticated, check by email in form_data
            form_data = data.get('form_data', {})
            email = form_data.get('email', '').lower().strip()
            
            if email:
                existing_enrollment = Enrollment.objects.filter(
                    user__email__iexact=email,
                    product=product,
                    status__in=['PENDING_PAYMENT', 'PAID']
                ).exists()
                
                if existing_enrollment:
                    raise serializers.ValidationError({
                        'form_data': 'Você já possui uma inscrição ativa para este produto. Cada pessoa pode fazer apenas uma inscrição.'
                    })
        
        data['product'] = product
        data['batch'] = batch
        return data
    
    def create(self, validated_data):
        """Create enrollment."""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # Get or create user from request or form_data
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            user = request.user
        else:
            # Create anonymous user or get from email in form_data
            form_data = validated_data.get('form_data', {})
            email = form_data.get('email', 'anonymous@example.com')
            nome_completo = form_data.get('nome_completo', 'Usuário')
            # Split name into first and last
            nome_parts = nome_completo.split(' ', 1)
            first_name = nome_parts[0] if nome_parts else 'Usuário'
            last_name = nome_parts[1] if len(nome_parts) > 1 else ''
            
            try:
                user, _ = User.objects.get_or_create(
                    email=email,
                    defaults={
                        'first_name': first_name,
                        'last_name': last_name
                    }
                )
            except Exception as e:
                # If user exists but with different data, just get it
                try:
                    user = User.objects.get(email=email)
                except User.DoesNotExist:
                    raise serializers.ValidationError({
                        'form_data': f'Erro ao criar usuário: {str(e)}'
                    })
        
        product = validated_data.pop('product')
        batch = validated_data.pop('batch')
        validated_data.pop('product_id')
        validated_data.pop('batch_id')
        coupon_code = validated_data.pop('coupon_code', None)
        
        # Validate and apply coupon if provided
        coupon = None
        if coupon_code:
            from .models import Coupon, Settings

            if not Settings.get_settings().enable_coupons:
                raise serializers.ValidationError({'coupon_code': 'Cupons estão desativados no momento'})
            try:
                coupon = Coupon.objects.get(code=coupon_code.strip().upper())
                
                # Validate coupon
                is_valid, message = coupon.is_valid()
                if not is_valid:
                    raise serializers.ValidationError({'coupon_code': message})
                
                # Check product restriction
                if not coupon.can_apply_to_product(product):
                    raise serializers.ValidationError({
                        'coupon_code': 'Este cupom não é válido para este produto'
                    })
                
                # Check minimum purchase (will be validated after calculating base price)
                
            except Coupon.DoesNotExist:
                raise serializers.ValidationError({'coupon_code': 'Cupom não encontrado'})
        
        # Set default values for amounts (will be recalculated when payment method is chosen)
        # Use the base price (PIX cash) as initial total_amount
        initial_total = batch.price
        
        # Calculate discount if coupon exists
        discount_amount = Decimal('0.00')
        if coupon:
            # Validate minimum purchase first
            if initial_total < coupon.min_purchase:
                raise serializers.ValidationError({
                    'coupon_code': f'Valor mínimo para este cupom é R$ {coupon.min_purchase}'
                })
            discount_amount = Decimal(str(coupon.calculate_discount(initial_total)))
        
        final_amount = initial_total - discount_amount
        
        enrollment = Enrollment.objects.create(
            user=user,
            product=product,
            batch=batch,
            coupon=coupon,
            total_amount=initial_total,
            discount_amount=discount_amount,
            final_amount=final_amount,
            **validated_data
        )
        
        # Increment coupon usage
        if coupon:
            coupon.increment_uses()
        
        return enrollment


class EnrollmentListSerializer(serializers.ModelSerializer):
    """Simplified serializer for enrollment listing."""
    
    product_name = serializers.CharField(source='product.name', read_only=True)
    batch_name = serializers.CharField(source='batch.name', read_only=True)
    payments = serializers.SerializerMethodField()
    
    def get_payments(self, obj):
        """Get payments for this enrollment."""
        try:
            payments = obj.payments.all().order_by('due_date')
            return [{
                'id': p.id,
                'amount': str(p.amount),
                'status': p.status,
                'installment_number': p.installment_number,
                'due_date': p.due_date.isoformat() if p.due_date else None,
                'paid_at': p.paid_at.isoformat() if p.paid_at else None,
                'pix_qr_code': getattr(p, 'pix_qr_code', None),
                'pix_copy_paste': getattr(p, 'pix_copy_paste', None),
            } for p in payments]
        except Exception as e:
            return []
    
    class Meta:
        model = Enrollment
        fields = [
            'id',
            'product_name',
            'batch_name',
            'status',
            'payment_method',
            'installments',
            'final_amount',
            'payments',
            'paid_at',
            'created_at',
        ]
