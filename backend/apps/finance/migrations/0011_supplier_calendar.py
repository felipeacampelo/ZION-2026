from django.conf import settings
from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0010_allow_two_leaders_per_area'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Supplier',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=160, unique=True, verbose_name='Nome')),
                ('notes', models.TextField(blank=True, verbose_name='Observações')),
                ('is_active', models.BooleanField(default=True, verbose_name='Ativo')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
            ],
            options={
                'verbose_name': 'Fornecedor',
                'verbose_name_plural': 'Fornecedores',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='SupplierPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(0.01)], verbose_name='Valor')),
                ('scheduled_date', models.DateField(verbose_name='Data prevista')),
                ('paid_on', models.DateField(blank=True, null=True, verbose_name='Data efetiva de pagamento')),
                ('status', models.CharField(choices=[('PENDING', 'Pendente'), ('PAID', 'Pago')], default='PENDING', max_length=12, verbose_name='Status')),
                ('notes', models.TextField(blank=True, verbose_name='Observações')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('expense_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='supplier_payments', to='finance.expenserequest', verbose_name='Solicitação')),
                ('paid_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='supplier_payments_paid', to=settings.AUTH_USER_MODEL, verbose_name='Pago por')),
                ('supplier', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payments', to='finance.supplier', verbose_name='Fornecedor')),
            ],
            options={
                'verbose_name': 'Pagamento de Fornecedor',
                'verbose_name_plural': 'Pagamentos de Fornecedores',
                'ordering': ['scheduled_date', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='supplierpayment',
            index=models.Index(fields=['scheduled_date', 'status'], name='finance_sup_scheduled_95b15a_idx'),
        ),
        migrations.AddIndex(
            model_name='supplierpayment',
            index=models.Index(fields=['expense_request', 'status'], name='finance_sup_request_896353_idx'),
        ),
        migrations.AddIndex(
            model_name='supplierpayment',
            index=models.Index(fields=['supplier', 'status'], name='finance_sup_supplier_496653_idx'),
        ),
    ]
