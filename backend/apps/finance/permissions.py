from rest_framework import permissions

from .constants import FINANCE_VIEWERS_GROUP_NAME


def is_finance_viewer_only(user):
    if not user or not user.is_authenticated or user.is_superuser:
        return False
    return user.groups.filter(name=FINANCE_VIEWERS_GROUP_NAME).exists()


def can_manage_finance(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if is_finance_viewer_only(user):
        return False
    return bool(user.is_staff)


def can_view_finance_admin(user):
    if not user or not user.is_authenticated:
        return False
    return can_manage_finance(user) or is_finance_viewer_only(user)


class IsFinanceLeaderOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if can_manage_finance(user):
            return True
        return user.finance_area_assignments.exists()


class CanViewFinanceAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return can_view_finance_admin(request.user)


class CanManageFinanceAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return can_manage_finance(request.user)
