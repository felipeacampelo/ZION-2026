from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EnrollmentViewSet,
    check_cpf,
    get_settings,
    join_waitlist,
    waitlist_invite_create_payment,
    waitlist_invite_detail,
)
from .views_coupon import validate_coupon

app_name = 'enrollments'

router = DefaultRouter()
router.register(r'', EnrollmentViewSet, basename='enrollment')

urlpatterns = [
    path('validate-coupon/', validate_coupon, name='validate-coupon'),
    path('settings/', get_settings, name='get-settings'),
    path('check-cpf/', check_cpf, name='check-cpf'),
    path('waitlist/', join_waitlist, name='join-waitlist'),
    path('waitlist/invite/<str:token>/', waitlist_invite_detail, name='waitlist-invite-detail'),
    path('waitlist/invite/<str:token>/create-payment/', waitlist_invite_create_payment, name='waitlist-invite-create-payment'),
    path('', include(router.urls)),
]
