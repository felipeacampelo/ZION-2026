"""
URL configuration for enrollment system.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),

    # API
    path('api/users/', include('apps.users.urls')),
    path('api/products/', include('apps.products.urls')),
    path('api/enrollments/', include('apps.enrollments.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/finance/', include('apps.finance.urls')),
]

# Serve media files in all environments (Railway Volume provides persistence)
# static() only works in DEBUG mode, so we use serve() directly in production
if settings.MEDIA_ROOT:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
