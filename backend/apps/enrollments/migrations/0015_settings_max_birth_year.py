from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0014_settings_min_birth_year'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='max_birth_year',
            field=models.IntegerField(
                blank=True,
                help_text='Permite inscrição apenas para nascidos neste ano ou antes',
                null=True,
                validators=[django.core.validators.MinValueValidator(1900), django.core.validators.MaxValueValidator(2100)],
                verbose_name='Ano Máximo de Nascimento',
            ),
        ),
    ]
