from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0009_expenserequest_remove_justification_and_more'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='arealeaderassignment',
            name='finance_unique_leader_per_area',
        ),
        migrations.AlterField(
            model_name='arealeaderassignment',
            name='area',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='leader_assignments',
                to='finance.area',
                verbose_name='Área',
            ),
        ),
        migrations.AddConstraint(
            model_name='arealeaderassignment',
            constraint=models.UniqueConstraint(fields=('area', 'user'), name='finance_unique_leader_user_per_area'),
        ),
        migrations.AlterField(
            model_name='arealeaderassignment',
            name='user',
            field=models.ForeignKey(
                on_delete=models.CASCADE,
                related_name='finance_area_assignments',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Líder',
            ),
        ),
    ]
