from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion
import apps.finance.models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Area',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, unique=True, verbose_name='Nome')),
                ('description', models.TextField(blank=True, verbose_name='Descrição')),
                ('is_active', models.BooleanField(default=True, verbose_name='Ativa')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criada em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizada em')),
            ],
            options={'verbose_name': 'Área', 'verbose_name_plural': 'Áreas', 'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='ExpenseRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(0.01)], verbose_name='Valor')),
                ('description', models.TextField(verbose_name='Descrição')),
                ('justification', models.TextField(verbose_name='Justificativa')),
                ('status', models.CharField(choices=[('PENDING', 'Pendente'), ('UNDER_REVIEW', 'Em análise'), ('APPROVED', 'Aprovada'), ('REJECTED', 'Rejeitada'), ('CANCELLED', 'Cancelada')], default='PENDING', max_length=20, verbose_name='Status')),
                ('rejection_reason', models.TextField(blank=True, verbose_name='Justificativa da Rejeição')),
                ('reviewed_at', models.DateTimeField(blank=True, null=True, verbose_name='Analisado em')),
                ('approved_at', models.DateTimeField(blank=True, null=True, verbose_name='Aprovado em')),
                ('rejected_at', models.DateTimeField(blank=True, null=True, verbose_name='Rejeitado em')),
                ('cancelled_at', models.DateTimeField(blank=True, null=True, verbose_name='Cancelado em')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='expense_requests', to='finance.area', verbose_name='Área')),
            ],
            options={
                'verbose_name': 'Solicitação de Despesa',
                'verbose_name_plural': 'Solicitações de Despesa',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='AreaLeaderAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('area', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='leader_assignment', to='finance.area', verbose_name='Área')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='finance_area_assignments', to=settings.AUTH_USER_MODEL, verbose_name='Líder')),
            ],
            options={'verbose_name': 'Vínculo de Líder', 'verbose_name_plural': 'Vínculos de Líder'},
        ),
        migrations.CreateModel(
            name='AreaBudget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('allocated_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12, validators=[django.core.validators.MinValueValidator(0)], verbose_name='Valor Orçado')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('area', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='budget', to='finance.area', verbose_name='Área')),
            ],
            options={'verbose_name': 'Orçamento da Área', 'verbose_name_plural': 'Orçamentos das Áreas'},
        ),
        migrations.CreateModel(
            name='BudgetRubric',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, verbose_name='Nome')),
                ('description', models.TextField(blank=True, verbose_name='Descrição')),
                ('allocated_amount', models.DecimalField(decimal_places=2, default=0, max_digits=12, validators=[django.core.validators.MinValueValidator(0)], verbose_name='Valor Orçado')),
                ('is_active', models.BooleanField(default=True, verbose_name='Ativa')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criada em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizada em')),
                ('area', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rubrics', to='finance.area', verbose_name='Área')),
            ],
            options={'verbose_name': 'Rubrica', 'verbose_name_plural': 'Rubricas', 'ordering': ['area__name', 'name']},
        ),
        migrations.AddField(
            model_name='expenserequest',
            name='requester',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='expense_requests', to=settings.AUTH_USER_MODEL, verbose_name='Solicitante'),
        ),
        migrations.AddField(
            model_name='expenserequest',
            name='rubric',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='expense_requests', to='finance.budgetrubric', verbose_name='Rubrica'),
        ),
        migrations.AddField(
            model_name='expenserequest',
            name='reviewed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_expense_requests', to=settings.AUTH_USER_MODEL, verbose_name='Analisado por'),
        ),
        migrations.CreateModel(
            name='ExpenseExecution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('execution_type', models.CharField(blank=True, choices=[('ADVANCE', 'Adiantamento'), ('REIMBURSEMENT', 'Reembolso')], max_length=20, null=True, verbose_name='Tipo de Execução')),
                ('status', models.CharField(choices=[('NOT_EXECUTED', 'Não executado'), ('EXECUTED', 'Executado')], default='NOT_EXECUTED', max_length=20, verbose_name='Status')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(0.01)], verbose_name='Valor')),
                ('notes', models.TextField(blank=True, verbose_name='Observações')),
                ('executed_at', models.DateTimeField(blank=True, null=True, verbose_name='Executado em')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('executed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='executed_expense_requests', to=settings.AUTH_USER_MODEL, verbose_name='Executado por')),
                ('expense_request', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='execution', to='finance.expenserequest', verbose_name='Solicitação')),
            ],
            options={'verbose_name': 'Execução Financeira', 'verbose_name_plural': 'Execuções Financeiras'},
        ),
        migrations.CreateModel(
            name='ExpenseAuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(choices=[('CREATED', 'Criada'), ('UNDER_REVIEW', 'Em análise'), ('APPROVED', 'Aprovada'), ('REJECTED', 'Rejeitada'), ('CANCELLED', 'Cancelada'), ('EXECUTED', 'Executada'), ('ATTACHMENT_ADDED', 'Anexo adicionado')], max_length=32, verbose_name='Ação')),
                ('note', models.TextField(blank=True, verbose_name='Observação')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='Metadados')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='expense_audit_logs', to=settings.AUTH_USER_MODEL, verbose_name='Responsável')),
                ('expense_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='audit_logs', to='finance.expenserequest', verbose_name='Solicitação')),
            ],
            options={'verbose_name': 'Log de Auditoria', 'verbose_name_plural': 'Logs de Auditoria', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='ExpenseAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('SUPPORTING', 'Suporte'), ('RECEIPT', 'Comprovante')], default='SUPPORTING', max_length=20, verbose_name='Categoria')),
                ('file', models.FileField(upload_to=apps.finance.models.attachment_upload_to, verbose_name='Arquivo')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('execution', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='finance.expenseexecution', verbose_name='Execução')),
                ('expense_request', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='finance.expenserequest', verbose_name='Solicitação')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='uploaded_expense_attachments', to=settings.AUTH_USER_MODEL, verbose_name='Enviado por')),
            ],
            options={'verbose_name': 'Anexo', 'verbose_name_plural': 'Anexos', 'ordering': ['-created_at']},
        ),
        migrations.AddIndex(
            model_name='expenserequest',
            index=models.Index(fields=['area', 'status'], name='finance_exp_area_st_5f3935_idx'),
        ),
        migrations.AddIndex(
            model_name='expenserequest',
            index=models.Index(fields=['rubric', 'status'], name='finance_exp_rubric__ea4bb6_idx'),
        ),
        migrations.AddIndex(
            model_name='expenserequest',
            index=models.Index(fields=['requester', 'status'], name='finance_exp_request_1eb367_idx'),
        ),
        migrations.AddConstraint(
            model_name='arealeaderassignment',
            constraint=models.UniqueConstraint(fields=('area',), name='finance_unique_leader_per_area'),
        ),
        migrations.AddConstraint(
            model_name='budgetrubric',
            constraint=models.UniqueConstraint(fields=('area', 'name'), name='finance_unique_rubric_name_per_area'),
        ),
    ]
