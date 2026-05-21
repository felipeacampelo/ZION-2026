from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_batch_is_visible_on_site'),
    ]

    operations = [
        migrations.AddField(
            model_name='batch',
            name='next_batch',
            field=models.ForeignKey(
                blank=True,
                help_text='Lote que será ativado automaticamente quando este encerrar ou esgotar',
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name='previous_batches',
                to='products.batch',
                verbose_name='Próximo Lote',
            ),
        ),
    ]
