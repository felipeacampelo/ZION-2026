from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0006_settings_feature_flags'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='enable_credit_card',
            field=models.BooleanField(
                default=True,
                help_text='Controla a disponibilidade do cartão de crédito para novos pagamentos',
                verbose_name='Permitir Cartão de Crédito',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='enable_pix_cash',
            field=models.BooleanField(
                default=True,
                help_text='Controla a disponibilidade do PIX à vista para novos pagamentos',
                verbose_name='Permitir PIX à Vista',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='form_fields_config',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Define quais campos do formulário ficam visíveis e obrigatórios',
                verbose_name='Configuração dos Campos do Formulário',
            ),
        ),
    ]
