from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0002_expenserequest_request_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='expenserequest',
            name='pix_key',
            field=models.CharField(default='', max_length=160, verbose_name='Chave PIX'),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='expenserequest',
            name='recipient_name',
            field=models.CharField(default='', max_length=160, verbose_name='Nome do Favorecido'),
            preserve_default=False,
        ),
    ]
