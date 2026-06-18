from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0004_expand_finance_type_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='expenserequest',
            name='pix_key',
            field=models.CharField(blank=True, max_length=160, verbose_name='Chave PIX'),
        ),
        migrations.AlterField(
            model_name='expenserequest',
            name='recipient_name',
            field=models.CharField(blank=True, max_length=160, verbose_name='Nome do Favorecido'),
        ),
    ]
