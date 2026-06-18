from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0003_expenserequest_bank_details'),
    ]

    operations = [
        migrations.AlterField(
            model_name='expenserequest',
            name='request_type',
            field=models.CharField(
                choices=[
                    ('ADVANCE', 'Solicitação de transferência'),
                    ('REIMBURSEMENT', 'Reembolso'),
                    ('DIRECT_PAYMENT', 'Pagamento direto'),
                ],
                default='ADVANCE',
                max_length=20,
                verbose_name='Tipo de Solicitação',
            ),
        ),
        migrations.AlterField(
            model_name='expenseexecution',
            name='execution_type',
            field=models.CharField(
                blank=True,
                choices=[
                    ('ADVANCE', 'Adiantamento'),
                    ('REIMBURSEMENT', 'Reembolso'),
                    ('DIRECT_PAYMENT', 'Pagamento direto'),
                ],
                max_length=20,
                null=True,
                verbose_name='Tipo de Execução',
            ),
        ),
    ]
