from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0012_settings_home_location_subtext'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='max_age_years',
            field=models.IntegerField(
                default=17,
                help_text='Apenas pessoas com esta idade ou menos poderão se inscrever',
                verbose_name='Idade Máxima para Inscrição',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='responsible_fields_config',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Campos extras exibidos na seção de dados do responsável',
                verbose_name='Campos do Responsável',
            ),
        ),
    ]
