from django.db import migrations, models


def disable_shirt_field(apps, schema_editor):
    Settings = apps.get_model('enrollments', 'Settings')

    for settings in Settings.objects.all():
        settings.enable_shirt_size_field = False

        form_fields_config = dict(settings.form_fields_config or {})
        shirt_field = dict(form_fields_config.get('tamanho_camiseta', {}))
        shirt_field['enabled'] = False
        shirt_field['required'] = False
        form_fields_config['tamanho_camiseta'] = shirt_field
        settings.form_fields_config = form_fields_config

        settings.save(update_fields=['enable_shirt_size_field', 'form_fields_config'])


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0015_settings_max_birth_year'),
    ]

    operations = [
        migrations.AlterField(
            model_name='settings',
            name='enable_shirt_size_field',
            field=models.BooleanField(
                default=False,
                help_text='Controla a exibição do campo de tamanho da camiseta em novas inscrições',
                verbose_name='Exibir Campo Tamanho da Camiseta',
            ),
        ),
        migrations.RunPython(disable_shirt_field, migrations.RunPython.noop),
    ]
