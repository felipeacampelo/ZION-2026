from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_batch_next_batch'),
        ('enrollments', '0017_social_quota_contributions'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WaitlistEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('form_data', models.JSONField(blank=True, default=dict, verbose_name='Dados do Formulário')),
                ('coupon_code', models.CharField(blank=True, default='', max_length=50, verbose_name='Cupom Informado')),
                ('status', models.CharField(choices=[('WAITING', 'Aguardando'), ('INVITED', 'Convocado'), ('CONVERTED', 'Convertido'), ('EXPIRED', 'Expirado'), ('REMOVED', 'Removido')], default='WAITING', max_length=16, verbose_name='Status')),
                ('position', models.PositiveIntegerField(db_index=True, default=1, verbose_name='Posição')),
                ('batch_snapshot', models.JSONField(blank=True, default=dict, verbose_name='Snapshot Comercial do Lote')),
                ('invited_at', models.DateTimeField(blank=True, null=True, verbose_name='Convidado em')),
                ('invite_expires_at', models.DateTimeField(blank=True, null=True, verbose_name='Convite Expira em')),
                ('converted_at', models.DateTimeField(blank=True, null=True, verbose_name='Convertido em')),
                ('removed_at', models.DateTimeField(blank=True, null=True, verbose_name='Removido em')),
                ('removal_reason', models.CharField(blank=True, default='', max_length=64, verbose_name='Motivo da Remoção')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('product', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='waitlist_entries', to='products.product', verbose_name='Produto')),
                ('reference_batch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='waitlist_references', to='products.batch', verbose_name='Lote de Referência')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='waitlist_entries', to=settings.AUTH_USER_MODEL, verbose_name='Usuário')),
            ],
            options={
                'verbose_name': 'Entrada da Lista de Espera',
                'verbose_name_plural': 'Lista de Espera',
                'ordering': ['position', 'created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='waitlistentry',
            index=models.Index(fields=['product', 'status', 'position'], name='enrollment_product_478fa7_idx'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='pricing_snapshot',
            field=models.JSONField(blank=True, default=dict, help_text='Usado para preservar a condição comercial de inscrições oriundas da lista de espera', verbose_name='Snapshot de Preços'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='reservation_consumed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Reserva Consumida em'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='reservation_expires_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Reserva Expira em'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='reservation_token',
            field=models.CharField(blank=True, db_index=True, max_length=128, verbose_name='Token da Reserva'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='source',
            field=models.CharField(choices=[('PUBLIC', 'Pública'), ('WAITLIST', 'Lista de Espera')], default='PUBLIC', max_length=16, verbose_name='Origem'),
        ),
        migrations.AddField(
            model_name='enrollment',
            name='waitlist_entry',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reserved_enrollments', to='enrollments.waitlistentry', verbose_name='Entrada da Lista de Espera'),
        ),
        migrations.AddField(
            model_name='settings',
            name='waitlist_auto_invite_enabled',
            field=models.BooleanField(default=True, help_text='Quando ativo, novas vagas convocam automaticamente o próximo da fila.', verbose_name='Convocação Automática da Lista de Espera'),
        ),
    ]
