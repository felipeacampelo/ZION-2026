from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0019_settings_waitlist_public_start_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='enable_waitlist_public',
            field=models.BooleanField(
                default=True,
                help_text='Controla se o botão da lista de espera pode aparecer para o público.',
                verbose_name='Ativar Lista de Espera Pública',
            ),
        ),
    ]
