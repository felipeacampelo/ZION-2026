from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0013_settings_responsible_fields_and_max_age'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='min_birth_year',
            field=models.IntegerField(
                default=2009,
                help_text='Permite inscrição apenas para nascidos neste ano ou depois',
                verbose_name='Ano Mínimo de Nascimento',
            ),
        ),
    ]
