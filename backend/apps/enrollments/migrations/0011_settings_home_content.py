from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0010_enrollment_window'),
    ]

    operations = [
        migrations.AddField(
            model_name='settings',
            name='home_date_text',
            field=models.CharField(blank=True, default='', help_text='Texto livre mostrado no bloco de data da página inicial', max_length=255, verbose_name='Data exibida na Home'),
        ),
        migrations.AddField(
            model_name='settings',
            name='home_description',
            field=models.TextField(blank=True, default='', help_text='Texto principal exibido na seção de descrição da página inicial', verbose_name='Descrição da Home'),
        ),
        migrations.AddField(
            model_name='settings',
            name='home_location_text',
            field=models.CharField(blank=True, default='', help_text='Texto livre mostrado no bloco de local da página inicial', max_length=255, verbose_name='Local exibido na Home'),
        ),
    ]
