from django.contrib import admin

from .models import (
    Area,
    AreaBudget,
    AreaLeaderAssignment,
    BudgetRubric,
    ExpenseAttachment,
    ExpenseAuditLog,
    ExpenseExecution,
    ExpenseRequest,
)


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'created_at']
    search_fields = ['name']


@admin.register(AreaBudget)
class AreaBudgetAdmin(admin.ModelAdmin):
    list_display = ['area', 'allocated_amount', 'updated_at']
    search_fields = ['area__name']


@admin.register(AreaLeaderAssignment)
class AreaLeaderAssignmentAdmin(admin.ModelAdmin):
    list_display = ['area', 'user', 'updated_at']
    search_fields = ['area__name', 'user__email']


@admin.register(BudgetRubric)
class BudgetRubricAdmin(admin.ModelAdmin):
    list_display = ['name', 'area', 'allocated_amount', 'is_active']
    list_filter = ['area', 'is_active']
    search_fields = ['name', 'area__name']


@admin.register(ExpenseRequest)
class ExpenseRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'area', 'rubric', 'requester', 'request_type', 'recipient_name', 'amount', 'status', 'created_at']
    list_filter = ['status', 'request_type', 'area', 'rubric']
    search_fields = ['requester__email', 'recipient_name', 'pix_key', 'description']


@admin.register(ExpenseExecution)
class ExpenseExecutionAdmin(admin.ModelAdmin):
    list_display = ['expense_request', 'execution_type', 'status', 'amount', 'executed_at']
    list_filter = ['status', 'execution_type']


@admin.register(ExpenseAttachment)
class ExpenseAttachmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'expense_request', 'execution', 'category', 'uploaded_by', 'created_at']
    list_filter = ['category']


@admin.register(ExpenseAuditLog)
class ExpenseAuditLogAdmin(admin.ModelAdmin):
    list_display = ['expense_request', 'action', 'actor', 'created_at']
    list_filter = ['action']
    search_fields = ['expense_request__id', 'actor__email', 'note']
