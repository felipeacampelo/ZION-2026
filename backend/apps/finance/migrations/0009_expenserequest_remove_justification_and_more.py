from django.db import migrations, models


def forward_fill_request_description_and_attachment_categories(apps, schema_editor):
    ExpenseRequest = apps.get_model('finance', 'ExpenseRequest')
    ExpenseExecution = apps.get_model('finance', 'ExpenseExecution')
    ExpenseAttachment = apps.get_model('finance', 'ExpenseAttachment')

    for request in ExpenseRequest.objects.exclude(justification='').iterator():
        description = (request.description or '').strip()
        justification = (request.justification or '').strip()
        if not justification:
            continue
        if not description:
            request.description = justification
        elif justification not in description:
            request.description = f'{description}\n\nJustificativa anterior: {justification}'
        else:
            continue
        request.save(update_fields=['description'])

    advance_execution_ids = set(
        ExpenseExecution.objects.filter(execution_type='ADVANCE').values_list('id', flat=True)
    )

    ExpenseAttachment.objects.filter(category='ADVANCE_SETTLEMENT').update(category='SETTLEMENT_PROOF')
    ExpenseAttachment.objects.filter(
        category='RECEIPT',
        execution_id__in=advance_execution_ids,
    ).update(category='DEPOSIT_RECEIPT')


def backward_restore_legacy_attachment_categories(apps, schema_editor):
    ExpenseAttachment = apps.get_model('finance', 'ExpenseAttachment')

    ExpenseAttachment.objects.filter(category='SETTLEMENT_PROOF').update(category='ADVANCE_SETTLEMENT')
    ExpenseAttachment.objects.filter(category='DEPOSIT_RECEIPT').update(category='RECEIPT')


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0008_create_finance_managers_group'),
    ]

    operations = [
        migrations.RunPython(
            forward_fill_request_description_and_attachment_categories,
            backward_restore_legacy_attachment_categories,
        ),
        migrations.RemoveField(
            model_name='expenserequest',
            name='justification',
        ),
        migrations.AlterField(
            model_name='expenseattachment',
            name='category',
            field=models.CharField(
                choices=[
                    ('SUPPORTING', 'Suporte'),
                    ('RECEIPT', 'Comprovante'),
                    ('DEPOSIT_RECEIPT', 'Comprovante de Depósito'),
                    ('SETTLEMENT_PROOF', 'Comprovante de Compra'),
                    ('RETURN_RECEIPT', 'Comprovante de Devolução'),
                ],
                default='SUPPORTING',
                max_length=20,
                verbose_name='Categoria',
            ),
        ),
    ]
