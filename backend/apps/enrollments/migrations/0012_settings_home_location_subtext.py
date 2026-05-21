from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0011_settings_home_content'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='home_location_subtext',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Texto menor abaixo do local, útil para endereço ou complemento',
                max_length=255,
                verbose_name='Subtexto do local na Home',
            ),
        ),
    ]
