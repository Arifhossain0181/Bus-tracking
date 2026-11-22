"""
Django Management Command: archive_location_history
Safely archives historical LocationHistory records older than a retention cutoff (default: 14 days)
into cold storage (ArchivedLocationHistory) with dry-run support, batching, idempotency, and verification.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from locations.archival_service import archive_location_history


class Command(BaseCommand):
    help = 'Safely archive LocationHistory records older than a retention cutoff (default: 14 days) into cold storage.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=14,
            help='Retention period in days (records older than this are archived). Default: 14'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Number of records to process per batch transaction. Default: 500'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate archival without modifying database records.'
        )
        parser.add_argument(
            '--driver-id',
            type=int,
            default=None,
            help='Optionally limit archival to a specific driver ID.'
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Maximum number of records to archive in this execution run.'
        )
        parser.add_argument(
            '--no-verify',
            action='store_true',
            help='Skip post-archival data verification sample check.'
        )

    def handle(self, *args, **options):
        days = options['days']
        batch_size = options['batch_size']
        dry_run = options['dry_run']
        driver_id = options['driver_id']
        limit = options['limit']
        verify = not options['no_verify']

        cutoff = timezone.now() - timedelta(days=days)

        self.stdout.write(self.style.MIGRATE_HEADING("================================================================="))
        self.stdout.write(self.style.MIGRATE_HEADING("              UBUS TELEMETRY ARCHIVAL ENGINE                     "))
        self.stdout.write(self.style.MIGRATE_HEADING("================================================================="))
        self.stdout.write(f" Mode:               {'[DRY RUN - SIMULATION]' if dry_run else '[LIVE EXECUTION]'}")
        self.stdout.write(f" Retention Cutoff:   {cutoff.strftime('%Y-%m-%d %H:%M:%S %Z')} ({days} days)")
        self.stdout.write(f" Batch Size:         {batch_size}")
        self.stdout.write(f" Target Driver:      {f'Driver ID #{driver_id}' if driver_id else 'All Drivers'}")
        self.stdout.write(f" Limit:              {limit if limit else 'None (all qualifying)'}")
        self.stdout.write(f" Post-Verification:  {'Enabled' if verify else 'Disabled'}")
        self.stdout.write("-----------------------------------------------------------------")

        result = archive_location_history(
            cutoff_datetime=cutoff,
            days=days,
            batch_size=batch_size,
            dry_run=dry_run,
            driver_id=driver_id,
            limit=limit,
            verify=verify,
        )

        if dry_run:
            self.stdout.write(self.style.WARNING("\n[DRY RUN SUMMARY]"))
            self.stdout.write(f" Qualifying records older than {days} days: {result['qualifying_count']}")
            self.stdout.write(f" Target records within scope/limit:       {result['target_count']}")
            self.stdout.write(f" Already archived in cold storage:         {result['already_archived_count']}")
            self.stdout.write(f" Pending archival:                         {result['pending_archive_count']}")
            self.stdout.write(self.style.SUCCESS(f"\n{result['message']}"))
            return

        self.stdout.write(self.style.SUCCESS("\n[EXECUTION SUMMARY]"))
        self.stdout.write(f" Batch Run ID:                             {result['batch_run_id']}")
        self.stdout.write(f" Qualifying records older than {days} days: {result['qualifying_count']}")
        self.stdout.write(f" Target records processed:                 {result['target_count']}")
        self.stdout.write(f" Newly archived records:                   {result['archived_count']}")
        self.stdout.write(f" Skipped records (already archived):       {result['skipped_count']}")
        self.stdout.write(f" Failed records:                           {result['failed_count']}")
        self.stdout.write(f" Batches committed:                        {result['batches_processed']}")

        if verify and result.get('verification_details'):
            v = result['verification_details']
            if v['verified']:
                self.stdout.write(self.style.SUCCESS(f" Integrity Verification:                   PASSED (Checked {v['checked']} samples, 0 mismatches)"))
            else:
                self.stdout.write(self.style.ERROR(f" Integrity Verification:                   FAILED ({v['mismatches']} mismatches detected)"))

        self.stdout.write(self.style.SUCCESS(f"\nStatus: {result['message']}"))
        self.stdout.write(self.style.NOTICE("Note: Source LocationHistory records remain safely intact in active storage."))
        self.stdout.write("=================================================================\n")
