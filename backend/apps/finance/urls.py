from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AreaViewSet,
    BudgetRubricViewSet,
    ExpenseRequestViewSet,
    ExtraContributionViewSet,
    SupplierPaymentViewSet,
    SupplierViewSet,
    admin_finance_summary,
    finance_leader_candidates,
    finance_reports,
    finance_reports_csv,
    my_finance_dashboard,
)


app_name = 'finance'

router = DefaultRouter()
router.register(r'areas', AreaViewSet, basename='finance-area')
router.register(r'rubrics', BudgetRubricViewSet, basename='finance-rubric')
router.register(r'requests', ExpenseRequestViewSet, basename='finance-request')
router.register(r'contributions', ExtraContributionViewSet, basename='extra-contribution')
router.register(r'suppliers', SupplierViewSet, basename='finance-supplier')
router.register(r'supplier-payments', SupplierPaymentViewSet, basename='finance-supplier-payment')

urlpatterns = [
    path('admin/summary/', admin_finance_summary, name='admin-summary'),
    path('admin/reports/', finance_reports, name='reports'),
    path('admin/reports/export.csv', finance_reports_csv, name='reports-csv'),
    path('admin/leader-candidates/', finance_leader_candidates, name='leader-candidates'),
    path('my/dashboard/', my_finance_dashboard, name='my-dashboard'),
    path('', include(router.urls)),
]
