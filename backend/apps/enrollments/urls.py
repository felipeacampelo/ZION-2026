from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EnrollmentViewSet, check_cpf, get_settings
from .views_coupon import validate_coupon

app_name = 'enrollments'

router = DefaultRouter()
router.register(r'', EnrollmentViewSet, basename='enrollment')

urlpatterns = [
    path('validate-coupon/', validate_coupon, name='validate-coupon'),
    path('settings/', get_settings, name='get-settings'),
    path('check-cpf/', check_cpf, name='check-cpf'),
    path('', include(router.urls)),
]
