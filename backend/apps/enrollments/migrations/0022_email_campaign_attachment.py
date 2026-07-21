from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0021_add_enrollment_expired_email_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='emailcampaign',
            name='attachment',
            field=models.FileField(blank=True, null=True, upload_to='email_campaign_attachments/', verbose_name='Anexo'),
        ),
        migrations.AddField(
            model_name='emailcampaign',
            name='attachment_name',
            field=models.CharField(blank=True, max_length=255, verbose_name='Nome do Anexo'),
        ),
    ]
