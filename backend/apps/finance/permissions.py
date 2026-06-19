from rest_framework import permissions

from .constants import FINANCE_MANAGERS_GROUP_NAME, FINANCE_VIEWERS_GROUP_NAME


def is_finance_manager(user):
    """Usuário pertence ao grupo finance_managers (gestores sem is_staff)."""
    if not user or not user.is_authenticated:
        return False
    return user.groups.filter(name=FINANCE_MANAGERS_GROUP_NAME).exists()


def is_finance_viewer_only(user):
    """
    Retorna True apenas quando o usuário tem acesso de leitura mas NÃO de gestão.
    staff + finance_viewers → viewer only (não pode aprovar/editar).
    finance_managers → NÃO é viewer only.
    """
    if not user or not user.is_authenticated or user.is_superuser:
        return False
    if is_finance_manager(user):
        return False
    return user.groups.filter(name=FINANCE_VIEWERS_GROUP_NAME).exists()


def can_manage_finance(user):
    """
    Pode aprovar, rejeitar, executar e editar áreas/rubricas.
    - superuser: sempre
    - finance_managers: sempre
    - is_staff sem finance_viewers: sim
    - is_staff com finance_viewers: NÃO (restrito a leitura)
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    if is_finance_manager(user):
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
        if can_view_finance_admin(user):
            # viewers têm acesso de leitura; ações de escrita são bloqueadas
            # individualmente via _ensure_admin() nas views
            return True
        return user.finance_area_assignments.exists()


class CanViewFinanceAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return can_view_finance_admin(request.user)


class CanManageFinanceAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return can_manage_finance(request.user)
