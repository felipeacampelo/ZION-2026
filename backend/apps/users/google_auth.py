from django.contrib.auth import login
from django.views.decorators.csrf import csrf_exempt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from decouple import config
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import User, UserProfile
from .serializers import UserSerializer


@csrf_exempt
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def google_login(request):
    credential = request.data.get("credential")
    if not credential:
        return Response(
            {"detail": "Credential do Google não informada."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    client_id = config("GOOGLE_CLIENT_ID", default="")
    if not client_id:
        return Response(
            {"detail": "Login com Google não configurado no servidor."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    try:
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError:
        return Response(
            {"detail": "Token do Google inválido."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = idinfo.get("email")
    if not email:
        return Response(
            {"detail": "Conta do Google sem e-mail disponível."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    first_name = idinfo.get("given_name", "")
    last_name = idinfo.get("family_name", "")

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "username": email,
            "first_name": first_name,
            "last_name": last_name,
        },
    )

    updated_fields = []
    if not user.username:
        user.username = email
        updated_fields.append("username")
    if not user.first_name and first_name:
        user.first_name = first_name
        updated_fields.append("first_name")
    if not user.last_name and last_name:
        user.last_name = last_name
        updated_fields.append("last_name")
    if not user.has_usable_password():
        user.set_unusable_password()
        updated_fields.append("password")
    if updated_fields:
        user.save(update_fields=updated_fields)

    UserProfile.objects.get_or_create(user=user)
    token, _ = Token.objects.get_or_create(user=user)
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")

    return Response(
        {
            "user": UserSerializer(user).data,
            "token": token.key,
            "created": created,
        },
        status=status.HTTP_200_OK,
    )
