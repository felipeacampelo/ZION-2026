"""
Admin-only AI demo endpoints: dashboard insights and FAQ assistant.
"""
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .admin_views import build_dashboard_stats
from .ai_service import (
    AIDisabled,
    AIQuotaExceeded,
    AIServiceError,
    answer_faq,
    generate_dashboard_insights,
    is_ai_enabled,
)
from .permissions import IsAdminUser

# Only aggregated dashboard sections are sent to the model.
INSIGHTS_STATS_KEYS = (
    'enrollments',
    'payments',
    'revenue',
    'members',
    'gender',
    'birth_years',
    'empires',
    'payment_methods',
    'batches',
    'social_quota',
)


class FaqMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=('user', 'assistant'))
    content = serializers.CharField(max_length=1000)


class FaqRequestSerializer(serializers.Serializer):
    messages = FaqMessageSerializer(many=True, allow_empty=False, max_length=20)

    def validate_messages(self, value):
        if value[-1]['role'] != 'user':
            raise serializers.ValidationError('A última mensagem deve ser do usuário.')
        return value


def _ai_error_response(exc):
    if isinstance(exc, AIDisabled):
        return Response({'detail': 'IA não configurada.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    if isinstance(exc, AIQuotaExceeded):
        return Response({'detail': 'Limite diário de uso da IA atingido.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_ai_insights(request):
    if not is_ai_enabled():
        return _ai_error_response(AIDisabled())
    dashboard = build_dashboard_stats()
    stats = {key: dashboard[key] for key in INSIGHTS_STATS_KEYS if key in dashboard}
    try:
        insights = generate_dashboard_insights(stats)
    except (AIDisabled, AIQuotaExceeded, AIServiceError) as exc:
        return _ai_error_response(exc)
    return Response({'insights': insights})


@api_view(['POST'])
@permission_classes([IsAdminUser])
def ai_faq(request):
    serializer = FaqRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    messages = [dict(message) for message in serializer.validated_data['messages']]
    # The API requires the conversation to start with a user turn.
    while messages[0]['role'] != 'user':
        messages.pop(0)
    try:
        result = answer_faq(request.user, messages)
    except (AIDisabled, AIQuotaExceeded, AIServiceError) as exc:
        return _ai_error_response(exc)
    return Response(result)
