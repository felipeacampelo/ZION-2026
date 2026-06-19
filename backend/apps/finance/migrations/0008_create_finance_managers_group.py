from django.db import migrations


def create_finance_managers_group(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.get_or_create(name='finance_managers')


def delete_finance_managers_group(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name='finance_managers').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0007_expenseexecution_settlement_fields'),
    ]

    operations = [
        migrations.RunPython(create_finance_managers_group, delete_finance_managers_group),
    ]
