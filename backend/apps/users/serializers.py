"""
User serializers following clean code principles.
"""
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password

from apps.finance.permissions import can_manage_finance, can_view_finance_admin
from .models import User, UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    """Serializer for user profile."""
    
    class Meta:
        model = UserProfile
        fields = ['phone', 'cpf', 'asaas_customer_id']
        read_only_fields = ['asaas_customer_id']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user with profile."""
    
    profile = UserProfileSerializer(read_only=True)
    can_view_finance_admin = serializers.SerializerMethodField()
    can_manage_finance = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'first_name',
            'last_name',
            'profile',
            'is_staff',
            'is_superuser',
            'can_view_finance_admin',
            'can_manage_finance',
            'date_joined',
        ]
        read_only_fields = ['id', 'is_staff', 'is_superuser', 'can_view_finance_admin', 'can_manage_finance', 'date_joined']

    def get_can_view_finance_admin(self, obj):
        return can_view_finance_admin(obj)

    def get_can_manage_finance(self, obj):
        return can_manage_finance(obj)


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating user information."""
    
    phone = serializers.CharField(
        source='profile.phone',
        required=False,
        allow_blank=True
    )
    cpf = serializers.CharField(
        source='profile.cpf',
        required=False,
        allow_blank=True
    )
    
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'phone', 'cpf']
    
    def update(self, instance, validated_data):
        """Update user and profile."""
        profile_data = validated_data.pop('profile', {})
        
        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update or create profile
        if profile_data:
            profile, created = UserProfile.objects.get_or_create(user=instance)
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            profile.save()
        
        return instance


class RegisterSerializer(serializers.ModelSerializer):
    """Serializer for user registration."""
    
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password2 = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    phone = serializers.CharField(required=False, allow_blank=True)
    cpf = serializers.CharField(required=False, allow_blank=True)
    
    class Meta:
        model = User
        fields = ['email', 'password', 'password2', 'first_name', 'last_name', 'phone', 'cpf']
    
    def validate(self, attrs):
        """Validate passwords match and check for duplicate CPF."""
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({"password": "As senhas não coincidem."})
        
        # Check if CPF already exists
        cpf = attrs.get('cpf')
        if cpf:
            if UserProfile.objects.filter(cpf=cpf).exists():
                raise serializers.ValidationError({"cpf": "Este CPF já está cadastrado."})
        
        return attrs
    
    def create(self, validated_data):
        """Create user with profile."""
        from django.db import transaction
        
        validated_data.pop('password2')
        phone = validated_data.pop('phone', None)
        cpf = validated_data.pop('cpf', None)
        
        # Use atomic transaction to ensure both user and profile are created or neither
        with transaction.atomic():
            user = User.objects.create_user(
                email=validated_data['email'],
                password=validated_data['password'],
                first_name=validated_data.get('first_name', ''),
                last_name=validated_data.get('last_name', '')
            )
            
            # Create profile if phone or cpf provided
            if phone or cpf:
                UserProfile.objects.create(
                    user=user,
                    phone=phone or '',
                    cpf=cpf or ''
                )
        
        return user


class LoginSerializer(serializers.Serializer):
    """Serializer for user login."""
    
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )
    
    def validate(self, attrs):
        """Validate credentials."""
        email = attrs.get('email')
        password = attrs.get('password')
        
        if email and password:
            user = authenticate(
                request=self.context.get('request'),
                username=email,
                password=password
            )
            
            if not user:
                raise serializers.ValidationError('Email ou senha inválidos.')
            
            if not user.is_active:
                raise serializers.ValidationError('Conta desativada.')
            
            attrs['user'] = user
            return attrs
        else:
            raise serializers.ValidationError('Email e senha são obrigatórios.')


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change."""
    
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        validators=[validate_password]
    )
    new_password2 = serializers.CharField(required=True, write_only=True)
    
    def validate(self, attrs):
        """Validate passwords match."""
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "As senhas não coincidem."})
        return attrs
    
    def validate_old_password(self, value):
        """Validate old password is correct."""
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError("Senha atual incorreta.")
        return value


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for password reset request."""
    
    email = serializers.EmailField(required=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for password reset confirmation."""
    
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        validators=[validate_password]
    )
    new_password2 = serializers.CharField(required=True, write_only=True)
    
    def validate(self, attrs):
        """Validate passwords match."""
        if attrs['new_password'] != attrs['new_password2']:
            raise serializers.ValidationError({"new_password": "As senhas não coincidem."})
        return attrs
