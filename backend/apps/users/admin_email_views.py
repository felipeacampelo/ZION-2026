"""
Admin email views for templates and bulk campaigns.
"""
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .permissions import IsAdminUser
from apps.enrollments.email_service import (
    build_campaign_snapshot,
    build_email_context,
    get_campaign_recipients_queryset,
    get_email_template_defaults,
    get_preview_context_for_template,
    get_template_tokens,
    render_email_template,
    send_campaign_test_email,
    send_template_test_email,
    start_campaign_send,
)
from apps.enrollments.models import EmailCampaign, EmailCampaignRecipient, EmailTemplate


class EmailTemplateSerializer(serializers.ModelSerializer):
    available_tokens = serializers.SerializerMethodField()

    class Meta:
        model = EmailTemplate
        fields = [
            'key',
            'name',
            'subject',
            'html_content',
            'text_content',
            'is_active',
            'available_tokens',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['key', 'created_at', 'updated_at', 'available_tokens']

    def get_available_tokens(self, obj):
        return get_template_tokens(obj.key)


class EmailTemplateTestSerializer(serializers.Serializer):
    to_email = serializers.EmailField()


class EmailCampaignRecipientSerializer(serializers.ModelSerializer):
    enrollment_id = serializers.IntegerField(source='enrollment_id', read_only=True)

    class Meta:
        model = EmailCampaignRecipient
        fields = [
            'id',
            'enrollment_id',
            'email',
            'name',
            'status',
            'error_message',
            'sent_at',
        ]


class EmailCampaignSerializer(serializers.ModelSerializer):
    recipients = EmailCampaignRecipientSerializer(many=True, read_only=True)
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)

    class Meta:
        model = EmailCampaign
        fields = [
            'id',
            'name',
            'subject',
            'html_content',
            'text_content',
            'filters',
            'status',
            'recipient_count',
            'sent_count',
            'failed_count',
            'test_email',
            'started_at',
            'finished_at',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
            'recipients',
        ]
        read_only_fields = [
            'status',
            'recipient_count',
            'sent_count',
            'failed_count',
            'started_at',
            'finished_at',
            'created_by',
            'created_by_email',
            'created_at',
            'updated_at',
            'recipients',
        ]

    def validate_filters(self, value):
        normalized = {}
        value = value or {}

        if value.get('product') not in (None, ''):
            normalized['product'] = value['product']
        if value.get('status') not in (None, ''):
            normalized['status'] = value['status']
        if value.get('payment_method') not in (None, ''):
            normalized['payment_method'] = value['payment_method']
        if value.get('search') not in (None, ''):
            normalized['search'] = value['search']

        enrollment_ids = value.get('enrollment_ids') or []
        if enrollment_ids:
            normalized['enrollment_ids'] = [
                int(enrollment_id)
                for enrollment_id in enrollment_ids
                if str(enrollment_id).strip()
            ]

        return normalized


class EmailCampaignListSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailCampaign
        fields = [
            'id',
            'name',
            'subject',
            'filters',
            'status',
            'recipient_count',
            'sent_count',
            'failed_count',
            'test_email',
            'started_at',
            'finished_at',
            'created_at',
            'updated_at',
        ]


class EmailCampaignTestSerializer(serializers.Serializer):
    to_email = serializers.EmailField()


class EmailCampaignPreviewFiltersSerializer(serializers.Serializer):
    product = serializers.IntegerField(required=False)
    status = serializers.CharField(required=False)
    payment_method = serializers.CharField(required=False)
    search = serializers.CharField(required=False, allow_blank=True)
    enrollment_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=False,
        allow_empty=True,
    )


class EmailCampaignDraftTestSerializer(EmailCampaignTestSerializer):
    subject = serializers.CharField()
    html_content = serializers.CharField()
    text_content = serializers.CharField(required=False, allow_blank=True)
    filters = serializers.JSONField(required=False)


def _ensure_default_templates():
    for key, default in get_email_template_defaults().items():
        EmailTemplate.objects.get_or_create(
            key=key,
            defaults={
                'name': default['name'],
                'subject': default['subject'],
                'html_content': default['html_content'],
                'text_content': default['text_content'],
                'is_active': True,
            },
        )


def _get_template_or_404(key):
    _ensure_default_templates()
    try:
        return EmailTemplate.objects.get(key=key)
    except EmailTemplate.DoesNotExist:
        return None


def _get_campaign_or_404(pk):
    try:
        return EmailCampaign.objects.prefetch_related('recipients').get(pk=pk)
    except EmailCampaign.DoesNotExist:
        return None


def _build_recipient_preview_payload(filters):
    queryset = get_campaign_recipients_queryset(filters)
    sample = []
    seen = set()
    total_seen = set()

    for enrollment in queryset.iterator():
        email = (enrollment.form_data.get('email') or enrollment.user.email or '').strip().lower()
        if not email:
            continue
        total_seen.add(email)
        if email in seen:
            continue
        seen.add(email)
        sample.append({
            'enrollment_id': enrollment.id,
            'email': email,
            'name': enrollment.form_data.get('nome_completo', enrollment.user.get_full_name()) or email,
        })

    return {
        'count': len(total_seen),
        'sample': sample,
    }


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_email_templates_list(request):
    _ensure_default_templates()
    templates = EmailTemplate.objects.all().order_by('name')
    serializer = EmailTemplateSerializer(templates, many=True)
    return Response(serializer.data)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAdminUser])
def admin_email_template_detail(request, key):
    template = _get_template_or_404(key)
    if template is None:
        return Response({'detail': 'Template não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(EmailTemplateSerializer(template).data)

    serializer = EmailTemplateSerializer(template, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_template_preview(request, key):
    template = _get_template_or_404(key)
    if template is None:
        return Response({'detail': 'Template não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    context = get_preview_context_for_template(key)
    rendered = render_email_template(key, context)
    return Response({
        'subject': rendered['subject'],
        'html_content': rendered['html_content'],
        'text_content': rendered['text_content'],
        'context': context,
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_template_send_test(request, key):
    template = _get_template_or_404(key)
    if template is None:
        return Response({'detail': 'Template não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = EmailTemplateTestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    send_template_test_email(key, serializer.validated_data['to_email'])
    return Response({'detail': 'Email de teste enviado com sucesso.'})


@api_view(['GET', 'POST'])
@permission_classes([IsAdminUser])
def admin_email_campaigns(request):
    if request.method == 'GET':
        campaigns = EmailCampaign.objects.all().order_by('-created_at')
        serializer = EmailCampaignListSerializer(campaigns, many=True)
        return Response(serializer.data)

    serializer = EmailCampaignSerializer(data=request.data)
    if serializer.is_valid():
        campaign = serializer.save(created_by=request.user)
        return Response(EmailCampaignListSerializer(campaign).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_campaigns_preview_recipients(request):
    serializer = EmailCampaignPreviewFiltersSerializer(data=request.data or {})
    serializer.is_valid(raise_exception=True)
    return Response(_build_recipient_preview_payload(serializer.validated_data))


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_campaigns_send_test_draft(request):
    serializer = EmailCampaignDraftTestSerializer(data=request.data or {})
    serializer.is_valid(raise_exception=True)

    filters_serializer = EmailCampaignPreviewFiltersSerializer(data=serializer.validated_data.get('filters') or {})
    filters_serializer.is_valid(raise_exception=True)

    sample_enrollment = get_campaign_recipients_queryset(filters_serializer.validated_data).first()
    context = build_email_context(enrollment=sample_enrollment) if sample_enrollment else get_preview_context_for_template('enrollment_confirmation')
    send_campaign_test_email(
        serializer.validated_data['subject'],
        serializer.validated_data['html_content'],
        serializer.validated_data.get('text_content', ''),
        serializer.validated_data['to_email'],
        context=context,
    )
    return Response({'detail': 'Email de teste da campanha enviado com sucesso.'})


@api_view(['GET', 'PATCH'])
@permission_classes([IsAdminUser])
def admin_email_campaign_detail(request, pk):
    campaign = _get_campaign_or_404(pk)
    if campaign is None:
        return Response({'detail': 'Campanha não encontrada.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(EmailCampaignSerializer(campaign).data)

    if campaign.status != 'DRAFT':
        return Response({'detail': 'Apenas campanhas em rascunho podem ser alteradas.'}, status=status.HTTP_400_BAD_REQUEST)

    serializer = EmailCampaignSerializer(campaign, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_campaign_preview_recipients(request, pk):
    campaign = _get_campaign_or_404(pk)
    if campaign is None:
        return Response({'detail': 'Campanha não encontrada.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(_build_recipient_preview_payload(campaign.filters))


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_campaign_send_test(request, pk):
    campaign = _get_campaign_or_404(pk)
    if campaign is None:
        return Response({'detail': 'Campanha não encontrada.'}, status=status.HTTP_404_NOT_FOUND)

    serializer = EmailCampaignTestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    sample_enrollment = get_campaign_recipients_queryset(campaign.filters).first()
    context = build_email_context(enrollment=sample_enrollment) if sample_enrollment else get_preview_context_for_template('enrollment_confirmation')
    send_campaign_test_email(
        campaign.subject,
        campaign.html_content,
        campaign.text_content,
        serializer.validated_data['to_email'],
        context=context,
    )
    campaign.test_email = serializer.validated_data['to_email']
    campaign.save(update_fields=['test_email', 'updated_at'])
    return Response({'detail': 'Email de teste da campanha enviado com sucesso.'})


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_email_campaign_send(request, pk):
    campaign = _get_campaign_or_404(pk)
    if campaign is None:
        return Response({'detail': 'Campanha não encontrada.'}, status=status.HTTP_404_NOT_FOUND)

    if campaign.status != 'DRAFT':
        return Response({'detail': 'Somente campanhas em rascunho podem ser enviadas.'}, status=status.HTTP_400_BAD_REQUEST)

    build_campaign_snapshot(campaign)
    if campaign.recipient_count == 0:
        return Response({'detail': 'Nenhum destinatário encontrado para os filtros informados.'}, status=status.HTTP_400_BAD_REQUEST)

    campaign.status = 'SENDING'
    campaign.started_at = None
    campaign.finished_at = None
    campaign.sent_count = 0
    campaign.failed_count = 0
    campaign.save(update_fields=['status', 'started_at', 'finished_at', 'sent_count', 'failed_count', 'updated_at'])
    start_campaign_send(campaign)
    return Response({'detail': 'Envio iniciado.', 'recipient_count': campaign.recipient_count})
