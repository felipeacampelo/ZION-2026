"""
Product views.
"""
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Product, Batch
from .serializers import ProductSerializer, ProductListSerializer, BatchSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for products.
    List and retrieve active products.
    """
    permission_classes = [permissions.AllowAny]
    
    def get_queryset(self):
        for product in Product.objects.filter(is_active=True):
            product.sync_batch_transitions()
        return Product.objects.filter(is_active=True)
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        return ProductSerializer
    
    @action(detail=True, methods=['get'])
    def batches(self, request, pk=None):
        """Get all batches for a product."""
        product = self.get_object()
        batches = product.batches.filter(status='ACTIVE').order_by('start_date')
        serializer = BatchSerializer(batches, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def active_batch(self, request, pk=None):
        """Get active batch for a product."""
        product = self.get_object()
        batch = product.get_active_batch()
        if batch:
            serializer = BatchSerializer(batch)
            return Response(serializer.data)
        return Response({'detail': 'Nenhum lote ativo'}, status=404)


class BatchViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for batches.
    List and retrieve active batches.
    """
    serializer_class = BatchSerializer
    permission_classes = [permissions.AllowAny]
    
    def get_queryset(self):
        for batch in Batch.objects.select_related('product', 'next_batch').all():
            batch.sync_status()
        queryset = Batch.objects.filter(status='ACTIVE')
        product_id = self.request.query_params.get('product')
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset.order_by('start_date')
