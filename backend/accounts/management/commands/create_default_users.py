import os
from django.core.management.base import BaseCommand
from accounts.models import User

class Command(BaseCommand):
    help = 'Create default superusers and authority users for deployment from environment variables.'

    def handle(self, *args, **options):
        # Admin superuser
        admin_password = os.environ.get('DJANGO_SUPERUSER_PASSWORD')
        if admin_password:
            admin_username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
            admin_email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
            if not User.objects.filter(username=admin_username).exists():
                User.objects.create_superuser(
                    username=admin_username,
                    email=admin_email,
                    password=admin_password,
                    role='admin',
                    is_active=True,
                    approval_status='approved'
                )
                self.stdout.write(self.style.SUCCESS(f'Created admin: {admin_username}'))
            else:
                self.stdout.write(f'Admin user {admin_username} already exists.')
        else:
            self.stdout.write(self.style.WARNING('DJANGO_SUPERUSER_PASSWORD not set, skipping admin creation.'))

        # Authority user
        authority_password = os.environ.get('DEFAULT_AUTHORITY_PASSWORD')
        if authority_password:
            auth_username = os.environ.get('DEFAULT_AUTHORITY_USERNAME', 'authority')
            auth_email = os.environ.get('DEFAULT_AUTHORITY_EMAIL', 'authority@example.com')
            if not User.objects.filter(username=auth_username).exists():
                User.objects.create_user(
                    username=auth_username,
                    email=auth_email,
                    password=authority_password,
                    role='authority',
                    is_active=True,
                    approval_status='approved'
                )
                self.stdout.write(self.style.SUCCESS(f'Created authority: {auth_username}'))
            else:
                self.stdout.write(f'Authority user {auth_username} already exists.')
        else:
            self.stdout.write(self.style.WARNING('DEFAULT_AUTHORITY_PASSWORD not set, skipping authority creation.'))
