from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0016_disable_shirt_field_by_default'),
    ]

    operations = [
        migrations.CreateModel(
            name='SocialQuotaContribution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(help_text='Data em que o valor foi arrecadado', verbose_name='Data')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10, verbose_name='Valor')),
                ('notes', models.TextField(blank=True, help_text='Observações opcionais sobre a arrecadação', verbose_name='Observações')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Criado em')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atualizado em')),
                ('enrollment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='social_quota_contributions', to='enrollments.enrollment', verbose_name='Inscrição')),
            ],
            options={
                'verbose_name': 'Lançamento de Cota Social',
                'verbose_name_plural': 'Lançamentos de Cota Social',
                'ordering': ['-date', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='socialquotacontribution',
            index=models.Index(fields=['enrollment', 'date'], name='enrollments_social_enrollm_6f40a3_idx'),
        ),
    ]
