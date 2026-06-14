from django.db import migrations


def create_enrollment_expired_template(apps, schema_editor):
    EmailTemplate = apps.get_model('enrollments', 'EmailTemplate')

    from apps.enrollments.email_service import get_email_template_defaults

    default = get_email_template_defaults()['enrollment_expired']
    EmailTemplate.objects.get_or_create(
        key='enrollment_expired',
        defaults={
            'name': default['name'],
            'subject': default['subject'],
            'html_content': default['html_content'],
            'text_content': default['text_content'],
            'is_active': True,
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('enrollments', '0020_settings_enable_waitlist_public'),
    ]

    operations = [
        migrations.RunPython(create_enrollment_expired_template, migrations.RunPython.noop),
    ]
