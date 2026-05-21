"""
Product serializers.
"""
from rest_framework import serializers
from .models import Product, Batch


class BatchSerializer(serializers.ModelSerializer):
    """Serializer for Batch model."""

    product_name = serializers.CharField(source='product.name', read_only=True)
    current_enrollments = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    next_batch_name = serializers.CharField(source='next_batch.name', read_only=True)

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
            'pix_discount_percentage',
            'max_enrollments',
            'current_enrollments',
            'is_full',
            'status',
            'is_visible_on_site',
            'next_batch',
            'next_batch_name',
        ]


class ProductSerializer(serializers.ModelSerializer):
    """Serializer for Product model."""
    
    active_batch = BatchSerializer(read_only=True, source='get_active_batch')
    
    class Meta:
        model = Product
        fields = [
            'id',
            'name',
            'description',
            'image',
            'base_price',
            'max_installments',
            'is_active',
            'event_date',
            'active_batch',
        ]


class ProductListSerializer(serializers.ModelSerializer):
    """Simplified serializer for product listing."""
    
    class Meta:
        model = Product
        fields = ['id', 'name', 'description', 'image', 'base_price', 'is_active', 'event_date']
