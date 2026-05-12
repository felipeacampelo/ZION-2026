from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def bootstrap_email_templates(apps, schema_editor):
    from apps.enrollments.email_service import get_email_template_defaults

    EmailTemplate = apps.get_model('enrollments', 'EmailTemplate')

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


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0007_settings_payment_and_form_config'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailCampaign',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160, verbose_name='Nome Interno')),
                ('subject', models.CharField(max_length=255, verbose_name='Assunto')),
                ('html_content', models.TextField(verbose_name='Conteúdo HTML')),
                ('text_content', models.TextField(blank=True, verbose_name='Conteúdo Texto')),
                ('filters', models.JSONField(blank=True, default=dict, verbose_name='Filtros')),
                ('status', models.CharField(choices=[('DRAFT', 'Rascunho'), ('SENDING', 'Enviando'), ('SENT', 'Enviado'), ('FAILED', 'Falhou'), ('PARTIAL', 'Parcial')], default='DRAFT', max_length=16, verbose_name='Status')),
                ('recipient_count', models.IntegerField(default=0, verbose_name='Destinatários')),
                ('sent_count', models.IntegerField(default=0, verbose_name='Enviados')),
                ('failed_count', models.IntegerField(default=0, verbose_name='Falhas')),
                ('test_email', models.EmailField(blank=True, max_length=254, verbose_name='Email de Teste')),
                ('started_at', models.DateTimeField(blank=True, null=True, verbose_name='Iniciado em')),
                ('finished_at', models.DateTimeField(blank=True, null=True, verbose_name='Finalizado em')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='email_campaigns', to=settings.AUTH_USER_MODEL, verbose_name='Criado por')),
            ],
            options={
                'verbose_name': 'Campanha de Email',
                'verbose_name_plural': 'Campanhas de Email',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(choices=[('enrollment_confirmation', 'Confirmação de Inscrição'), ('payment_confirmation', 'Confirmação de Pagamento'), ('installment_reminder', 'Lembrete de Parcela'), ('password_reset', 'Recuperação de Senha')], max_length=64, unique=True, verbose_name='Chave')),
                ('name', models.CharField(max_length=120, verbose_name='Nome')),
                ('subject', models.CharField(max_length=255, verbose_name='Assunto')),
                ('html_content', models.TextField(verbose_name='Conteúdo HTML')),
                ('text_content', models.TextField(blank=True, verbose_name='Conteúdo Texto')),
                ('is_active', models.BooleanField(default=True, help_text='Quando desativado, o envio automático deste template é ignorado.', verbose_name='Ativo')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Template de Email',
                'verbose_name_plural': 'Templates de Email',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='EmailCampaignRecipient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254, verbose_name='Email')),
                ('name', models.CharField(blank=True, max_length=200, verbose_name='Nome')),
                ('status', models.CharField(choices=[('PENDING', 'Pendente'), ('SENT', 'Enviado'), ('FAILED', 'Falhou')], default='PENDING', max_length=16, verbose_name='Status')),
                ('error_message', models.TextField(blank=True, verbose_name='Erro')),
                ('sent_at', models.DateTimeField(blank=True, null=True, verbose_name='Enviado em')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('campaign', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='recipients', to='enrollments.emailcampaign', verbose_name='Campanha')),
                ('enrollment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='email_campaign_recipients', to='enrollments.enrollment', verbose_name='Inscrição')),
            ],
            options={
                'verbose_name': 'Destinatário de Campanha',
                'verbose_name_plural': 'Destinatários de Campanha',
                'ordering': ['id'],
            },
        ),
        migrations.AddConstraint(
            model_name='emailcampaignrecipient',
            constraint=models.UniqueConstraint(fields=('campaign', 'email'), name='unique_campaign_email'),
        ),
        migrations.RunPython(bootstrap_email_templates, migrations.RunPython.noop),
    ]
