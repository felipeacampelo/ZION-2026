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
    admin_coupons_list,
    admin_product_create,
    admin_product_update,
    admin_product_delete,
    admin_batch_create,
    admin_batch_update,
    admin_batch_delete,
    admin_coupon_create,
    admin_coupon_update,
    admin_coupon_delete,
)
from .admin_email_views import (
    admin_email_campaign_detail,
    admin_email_campaign_preview_recipients,
    admin_email_campaigns_preview_recipients,
    admin_email_campaigns_send_test_draft,
    admin_email_campaign_send,
    admin_email_campaign_send_test,
    admin_email_campaigns,
    admin_email_template_detail,
    admin_email_template_preview,
    admin_email_template_send_test,
    admin_email_templates_list,
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
    path('admin/coupons/', admin_coupons_list, name='admin-coupons-list'),
    path('admin/products/create/', admin_product_create, name='admin-product-create'),
    path('admin/products/<int:pk>/', admin_product_update, name='admin-product-update'),
    path('admin/products/<int:pk>/delete/', admin_product_delete, name='admin-product-delete'),
    path('admin/batches/create/', admin_batch_create, name='admin-batch-create'),
    path('admin/batches/<int:pk>/', admin_batch_update, name='admin-batch-update'),
    path('admin/batches/<int:pk>/delete/', admin_batch_delete, name='admin-batch-delete'),
    path('admin/coupons/create/', admin_coupon_create, name='admin-coupon-create'),
    path('admin/coupons/<int:pk>/', admin_coupon_update, name='admin-coupon-update'),
    path('admin/coupons/<int:pk>/delete/', admin_coupon_delete, name='admin-coupon-delete'),
    path('admin/email-templates/', admin_email_templates_list, name='admin-email-templates-list'),
    path('admin/email-templates/<str:key>/', admin_email_template_detail, name='admin-email-template-detail'),
    path('admin/email-templates/<str:key>/preview/', admin_email_template_preview, name='admin-email-template-preview'),
    path('admin/email-templates/<str:key>/send-test/', admin_email_template_send_test, name='admin-email-template-send-test'),
    path('admin/email-campaigns/', admin_email_campaigns, name='admin-email-campaigns'),
    path('admin/email-campaigns/preview-recipients/', admin_email_campaigns_preview_recipients, name='admin-email-campaigns-preview-recipients'),
    path('admin/email-campaigns/send-test-draft/', admin_email_campaigns_send_test_draft, name='admin-email-campaigns-send-test-draft'),
    path('admin/email-campaigns/<int:pk>/', admin_email_campaign_detail, name='admin-email-campaign-detail'),
    path('admin/email-campaigns/<int:pk>/preview-recipients/', admin_email_campaign_preview_recipients, name='admin-email-campaign-preview-recipients'),
    path('admin/email-campaigns/<int:pk>/send-test/', admin_email_campaign_send_test, name='admin-email-campaign-send-test'),
    path('admin/email-campaigns/<int:pk>/send/', admin_email_campaign_send, name='admin-email-campaign-send'),
    
    # Email testing endpoints (admin only)
    path('test-email/', test_email, name='test-email'),
    path('email-config/', email_config, name='email-config'),
    
    # Optional: dj-rest-auth endpoints (if you want to keep them)
    # path('', include('dj_rest_auth.urls')),
    # path('registration/', include('dj_rest_auth.registration.urls')),
]
