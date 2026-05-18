from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0009_merge_20260512_1804'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='enrollment_end_at',
            field=models.DateTimeField(blank=True, help_text='Se definido, encerra novas inscrições após esta data e hora', null=True, verbose_name='Fim das Inscrições'),
        ),
        migrations.AddField(
            model_name='settings',
            name='enrollment_start_at',
            field=models.DateTimeField(blank=True, help_text='Se definido, impede novas inscrições antes desta data e hora', null=True, verbose_name='Início das Inscrições'),
        ),
    ]
