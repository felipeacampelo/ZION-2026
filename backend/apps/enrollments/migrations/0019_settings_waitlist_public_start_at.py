from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0018_waitlist_and_reservations'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='waitlist_public_start_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Antes deste horário, o botão da lista de espera não aparece no site.',
                null=True,
                verbose_name='Abertura Pública da Lista de Espera',
            ),
        ),
    ]
