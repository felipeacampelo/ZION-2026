"""
User authentication URLs.
"""
from django.urls import path, include
from .views import (
    CurrentUserView, 
    user_profile, 
    register_view, 
    login_view, 
    logout_view,
    change_password_view,
    password_reset_request_view,
    password_reset_confirm_view
)
from .admin_views import (
    admin_dashboard_stats,
    admin_overdue_enrollments,
    admin_enrollments_list,
    admin_enrollment_update,
    admin_settings,
    admin_products_list,
    admin_batches_list,
    admin_product_create,
    admin_product_update,
    admin_product_delete,
    admin_batch_create,
    admin_batch_update,
    admin_batch_delete,
)
from .test_email_view import test_email, email_config

app_name = 'users'

urlpatterns = [
    # Authentication endpoints
    path('register/', register_view, name='register'),
    path('login/', login_view, name='login'),
    path('logout/', logout_view, name='logout'),
    path('change-password/', change_password_view, name='change-password'),
    
    # Password reset endpoints
    path('password-reset/', password_reset_request_view, name='password-reset-request'),
    path('password-reset-confirm/', password_reset_confirm_view, name='password-reset-confirm'),
    
    # User profile endpoints
    path('me/', CurrentUserView.as_view(), name='current-user'),
    path('profile/', user_profile, name='user-profile'),
    
    # Admin endpoints
    path('admin/dashboard/', admin_dashboard_stats, name='admin-dashboard'),
    path('admin/settings/', admin_settings, name='admin-settings'),
    path('admin/overdue-enrollments/', admin_overdue_enrollments, name='admin-overdue-enrollments'),
    path('admin/enrollments/', admin_enrollments_list, name='admin-enrollments-list'),
    path('admin/enrollments/<int:pk>/', admin_enrollment_update, name='admin-enrollment-update'),
    path('admin/products/', admin_products_list, name='admin-products-list'),
    path('admin/batches/', admin_batches_list, name='admin-batches-list'),
    path('admin/products/create/', admin_product_create, name='admin-product-create'),
    path('admin/products/<int:pk>/', admin_product_update, name='admin-product-update'),
    path('admin/products/<int:pk>/delete/', admin_product_delete, name='admin-product-delete'),
    path('admin/batches/create/', admin_batch_create, name='admin-batch-create'),
    path('admin/batches/<int:pk>/', admin_batch_update, name='admin-batch-update'),
    path('admin/batches/<int:pk>/delete/', admin_batch_delete, name='admin-batch-delete'),
    
    # Email testing endpoints (admin only)
    path('test-email/', test_email, name='test-email'),
    path('email-config/', email_config, name='email-config'),
    
    # Optional: dj-rest-auth endpoints (if you want to keep them)
    # path('', include('dj_rest_auth.urls')),
    # path('registration/', include('dj_rest_auth.registration.urls')),
]
