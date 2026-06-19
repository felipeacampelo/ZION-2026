from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0006_extracontribution_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='expenseexecution',
            name='returned_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                validators=[MinValueValidator(0)],
                verbose_name='Valor Devolvido',
            ),
        ),
        migrations.AddField(
            model_name='expenseexecution',
            name='settled_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Prestado em'),
        ),
        migrations.AddField(
            model_name='expenseexecution',
            name='settled_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='settled_expense_requests',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Prestado por',
            ),
        ),
        migrations.AddField(
            model_name='expenseexecution',
            name='settlement_notes',
            field=models.TextField(blank=True, verbose_name='Observações da Prestação'),
        ),
        migrations.AddField(
            model_name='expenseexecution',
            name='settlement_status',
            field=models.CharField(
                choices=[
                    ('NOT_REQUIRED', 'Não aplicável'),
                    ('PENDING_PROOF', 'Pendente de prestação'),
                    ('PENDING_RETURN', 'Pendente de devolução'),
                    ('SETTLED', 'Prestação concluída'),
                    ('MANUALLY_CLOSED', 'Encerrado manualmente'),
                ],
                default='NOT_REQUIRED',
                max_length=24,
                verbose_name='Status da Prestação',
            ),
        ),
        migrations.AddField(
            model_name='expenseexecution',
            name='spent_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                validators=[MinValueValidator(0)],
                verbose_name='Valor Gasto',
            ),
        ),
        migrations.AlterField(
            model_name='expenseattachment',
            name='category',
            field=models.CharField(
                choices=[
                    ('SUPPORTING', 'Suporte'),
                    ('RECEIPT', 'Comprovante'),
                    ('ADVANCE_SETTLEMENT', 'Prestação de contas'),
                ],
                default='SUPPORTING',
                max_length=20,
                verbose_name='Categoria',
            ),
        ),
        migrations.AlterField(
            model_name='expenseauditlog',
            name='action',
            field=models.CharField(
                choices=[
                    ('CREATED', 'Criada'),
                    ('UNDER_REVIEW', 'Em análise'),
                    ('APPROVED', 'Aprovada'),
                    ('REJECTED', 'Rejeitada'),
                    ('CANCELLED', 'Cancelada'),
                    ('EXECUTED', 'Executada'),
                    ('ATTACHMENT_ADDED', 'Anexo adicionado'),
                    ('ATTACHMENT_REPLACED', 'Anexo substituído'),
                    ('ATTACHMENT_REMOVED', 'Anexo removido'),
                    ('ADVANCE_SETTLEMENT_SUBMITTED', 'Prestação enviada'),
                    ('ADVANCE_RETURN_CONFIRMED', 'Devolução confirmada'),
                    ('ADVANCE_MANUALLY_CLOSED', 'Encerrado manualmente'),
                ],
                max_length=32,
                verbose_name='Ação',
            ),
        ),
    ]
