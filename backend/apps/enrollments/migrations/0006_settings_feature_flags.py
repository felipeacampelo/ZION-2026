from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0005_add_settings_model'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='enable_pix_installment',
            field=models.BooleanField(
                default=True,
                help_text='Controla a disponibilidade do PIX parcelado para novos pagamentos',
                verbose_name='Permitir PIX Parcelado',
            ),
        ),
        migrations.AddField(
            model_name='settings',
            name='enable_shirt_size_field',
            field=models.BooleanField(
                default=True,
                help_text='Controla a exibição do campo de tamanho da camiseta em novas inscrições',
                verbose_name='Exibir Campo Tamanho da Camiseta',
            ),
        ),
    ]
