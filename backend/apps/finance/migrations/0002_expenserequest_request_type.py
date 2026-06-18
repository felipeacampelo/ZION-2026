from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='expenserequest',
            name='request_type',
            field=models.CharField(
                choices=[
                    ('ADVANCE', 'Solicitação de transferência'),
                    ('REIMBURSEMENT', 'Reembolso'),
                ],
                default='ADVANCE',
                max_length=20,
                verbose_name='Tipo de Solicitação',
            ),
        ),
    ]
