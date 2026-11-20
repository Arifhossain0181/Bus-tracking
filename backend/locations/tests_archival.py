import datetime
from decimal import Decimal
from io import StringIO
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from buses.models import Bus, BusAssignment, Journey
from locations.models import LocationHistory, ArchivedLocationHistory
from locations.archival_service import (
    archive_location_history,
    verify_archive_integrity,
    get_combined_location_history,
)
from schedules.models import Route


class TelemetryArchivalTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_superuser(
            username='admin_archival',
            email='admin_archival@example.com',
            password='AdminPassword123!',
            role='admin',
            is_active=True,
            approval_status='approved',
        )

        # Drivers
        self.driver1 = User.objects.create_user(
            username='driver1_archival',
            email='driver1_archival@example.com',
            password='DriverPassword123!',
            role='driver',
            first_name='Rahim',
            last_name='Driver',
            is_active=True,
            approval_status='approved',
        )

        self.driver2 = User.objects.create_user(
            username='driver2_archival',
            email='driver2_archival@example.com',
            password='DriverPassword123!',
            role='driver',
            first_name='Karim',
            last_name='Driver',
            is_active=True,
            approval_status='approved',
        )

        # Bus & Route for Journey tests
        self.bus = Bus.objects.create(
            bus_number='UB-ARCH-01',
            license_plate='DHK-11-9901',
            bus_type='long',
            is_active=True,
        )

        self.route = Route.objects.create(
            name='Campus - City Route',
            route_type='long',
            is_active=True,
            is_published=True,
        )

        self.now = timezone.now()

    def _create_history_record(self, driver, lat, lng, days_ago):
        """Helper to create a LocationHistory row with a backdated timestamp."""
        rec = LocationHistory.objects.create(
            driver=driver,
            latitude=Decimal(str(lat)),
            longitude=Decimal(str(lng)),
        )
        backdated_time = self.now - datetime.timedelta(days=days_ago)
        LocationHistory.objects.filter(id=rec.id).update(timestamp=backdated_time)
        rec.refresh_from_db()
        return rec

    def test_dry_run_mode_does_not_modify_records(self):
        # 3 records older than 14 days, 2 records newer than 14 days
        for i in range(3):
            self._create_history_record(self.driver1, 23.8100 + i * 0.001, 90.4100 + i * 0.001, days_ago=20)
        for i in range(2):
            self._create_history_record(self.driver1, 23.8200 + i * 0.001, 90.4200 + i * 0.001, days_ago=5)

        initial_source_count = LocationHistory.objects.count()
        self.assertEqual(initial_source_count, 5)

        result = archive_location_history(days=14, dry_run=True)

        self.assertTrue(result['dry_run'])
        self.assertEqual(result['qualifying_count'], 3)
        self.assertEqual(result['pending_archive_count'], 3)
        self.assertEqual(result['archived_count'], 0)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 0)
        self.assertEqual(LocationHistory.objects.count(), initial_source_count)

    def test_live_archival_copies_and_preserves_data_exactly(self):
        rec1 = self._create_history_record(self.driver1, 23.8105500, 90.4123500, days_ago=25)
        rec2 = self._create_history_record(self.driver1, 23.8109900, 90.4128800, days_ago=18)
        # 1 recent record that must NOT be archived
        rec_recent = self._create_history_record(self.driver1, 23.8150000, 90.4150000, days_ago=2)

        result = archive_location_history(days=14, dry_run=False)

        self.assertFalse(result['dry_run'])
        self.assertEqual(result['qualifying_count'], 2)
        self.assertEqual(result['archived_count'], 2)
        self.assertEqual(result['skipped_count'], 0)
        self.assertEqual(result['failed_count'], 0)
        self.assertTrue(result['verified'])

        # Verify archive table contents
        self.assertEqual(ArchivedLocationHistory.objects.count(), 2)
        arch1 = ArchivedLocationHistory.objects.get(original_id=rec1.id)
        self.assertEqual(arch1.driver, self.driver1)
        self.assertEqual(arch1.driver_username, self.driver1.username)
        self.assertEqual(arch1.latitude, Decimal('23.8105500'))
        self.assertEqual(arch1.longitude, Decimal('90.4123500'))
        self.assertEqual(arch1.timestamp, rec1.timestamp)
        self.assertIsNotNone(arch1.archive_batch_id)

        # Source rows remain completely intact (non-destructive guarantee)
        self.assertEqual(LocationHistory.objects.count(), 3)
        self.assertTrue(LocationHistory.objects.filter(id=rec1.id).exists())
        self.assertTrue(LocationHistory.objects.filter(id=rec2.id).exists())
        self.assertTrue(LocationHistory.objects.filter(id=rec_recent.id).exists())

    def test_idempotency_prevents_duplicate_records(self):
        for i in range(4):
            self._create_history_record(self.driver1, 23.8100 + i * 0.001, 90.4100 + i * 0.001, days_ago=20)

        # First run: archives 4
        res1 = archive_location_history(days=14, dry_run=False)
        self.assertEqual(res1['archived_count'], 4)
        self.assertEqual(res1['skipped_count'], 0)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 4)

        # Second run: archives 0, skips 4
        res2 = archive_location_history(days=14, dry_run=False)
        self.assertEqual(res2['archived_count'], 0)
        self.assertEqual(res2['skipped_count'], 4)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 4)

    def test_cutoff_boundary_strictly_respects_retention_days(self):
        # 15 days ago -> should archive
        rec_old = self._create_history_record(self.driver1, 23.8100, 90.4100, days_ago=15)
        # 13 days ago -> should NOT archive
        rec_new = self._create_history_record(self.driver1, 23.8200, 90.4200, days_ago=13)

        result = archive_location_history(days=14, dry_run=False)
        self.assertEqual(result['archived_count'], 1)
        self.assertTrue(ArchivedLocationHistory.objects.filter(original_id=rec_old.id).exists())
        self.assertFalse(ArchivedLocationHistory.objects.filter(original_id=rec_new.id).exists())

    def test_batch_processing_and_keyset_pagination(self):
        # Create 15 records older than 14 days
        for i in range(15):
            self._create_history_record(self.driver1, 23.8100 + i * 0.0001, 90.4100 + i * 0.0001, days_ago=25)

        # Run with batch_size=4 -> 4 batches (4, 4, 4, 3)
        result = archive_location_history(days=14, batch_size=4, dry_run=False)
        self.assertEqual(result['archived_count'], 15)
        self.assertEqual(result['batches_processed'], 4)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 15)

    def test_driver_filtering(self):
        # Driver 1: 3 records
        for i in range(3):
            self._create_history_record(self.driver1, 23.8100 + i * 0.001, 90.4100 + i * 0.001, days_ago=20)
        # Driver 2: 2 records
        for i in range(2):
            self._create_history_record(self.driver2, 23.8200 + i * 0.001, 90.4200 + i * 0.001, days_ago=20)

        # Archive only driver1
        result = archive_location_history(days=14, driver_id=self.driver1.id, dry_run=False)
        self.assertEqual(result['archived_count'], 3)
        self.assertEqual(ArchivedLocationHistory.objects.filter(driver=self.driver1).count(), 3)
        self.assertEqual(ArchivedLocationHistory.objects.filter(driver=self.driver2).count(), 0)

    def test_transparent_retrieval_combines_active_and_archived_telemetry(self):
        t0 = self.now - datetime.timedelta(days=20)
        t1 = self.now - datetime.timedelta(days=18)
        t2 = self.now - datetime.timedelta(days=5)

        # 2 older points
        rec1 = self._create_history_record(self.driver1, 23.8100, 90.4100, days_ago=20)
        rec2 = self._create_history_record(self.driver1, 23.8110, 90.4110, days_ago=18)
        # 1 recent point
        rec3 = self._create_history_record(self.driver1, 23.8120, 90.4120, days_ago=5)

        # Archive the older points
        archive_location_history(days=14, dry_run=False)

        # Retrieve combined points over the full 25-day span
        start_time = self.now - datetime.timedelta(days=25)
        combined = get_combined_location_history(self.driver1, start_time=start_time)

        # Should retrieve all 3 unique points in chronological order
        self.assertEqual(len(combined), 3)
        self.assertEqual(combined[0]['id'], rec1.id)
        self.assertEqual(combined[1]['id'], rec2.id)
        self.assertEqual(combined[2]['id'], rec3.id)
        # Verify chronological order
        self.assertLess(combined[0]['timestamp'], combined[1]['timestamp'])
        self.assertLess(combined[1]['timestamp'], combined[2]['timestamp'])

    def test_journey_path_api_retrieves_transparently(self):
        start_time = self.now - datetime.timedelta(days=30)
        end_time = self.now - datetime.timedelta(days=29)

        assignment = BusAssignment.objects.create(
            bus=self.bus,
            driver=self.driver1,
            route=self.route,
            is_active=False,
        )

        journey = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus,
            route=self.route,
            assignment=assignment,
            status='completed',
            start_time=start_time,
            end_time=end_time,
        )

        # Points during journey
        rec1 = LocationHistory.objects.create(driver=self.driver1, latitude=Decimal('23.8100'), longitude=Decimal('90.4100'))
        LocationHistory.objects.filter(id=rec1.id).update(timestamp=start_time + datetime.timedelta(minutes=10))
        rec2 = LocationHistory.objects.create(driver=self.driver1, latitude=Decimal('23.8150'), longitude=Decimal('90.4150'))
        LocationHistory.objects.filter(id=rec2.id).update(timestamp=start_time + datetime.timedelta(minutes=20))

        # Archive these points
        archive_location_history(days=14, dry_run=False)

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/locations/journey/{journey.id}/path/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        path = res.data['path']
        self.assertEqual(len(path), 2)
        self.assertEqual(path[0]['lat'], 23.81)
        self.assertEqual(path[1]['lat'], 23.815)

    def test_integrity_verification_detects_mismatches(self):
        rec = self._create_history_record(self.driver1, 23.8105, 90.4105, days_ago=20)
        archive_location_history(days=14, dry_run=False)

        # Normal verification: PASS
        v1 = verify_archive_integrity(cutoff_datetime=self.now)
        self.assertTrue(v1['verified'])
        self.assertEqual(v1['mismatches'], 0)

        # Deliberately modify archived coordinates to simulate corruption
        ArchivedLocationHistory.objects.filter(original_id=rec.id).update(latitude=Decimal('99.9999'))
        v2 = verify_archive_integrity(cutoff_datetime=self.now)
        self.assertFalse(v2['verified'])
        self.assertEqual(v2['mismatches'], 1)
        self.assertIn('latitude mismatch', v2['details'][0]['errors'][0])

    def test_management_command_execution(self):
        self._create_history_record(self.driver1, 23.8100, 90.4100, days_ago=20)
        self._create_history_record(self.driver1, 23.8200, 90.4200, days_ago=20)

        # 1. Dry run command
        out_dry = StringIO()
        call_command('archive_location_history', days=14, dry_run=True, stdout=out_dry)
        dry_output = out_dry.getvalue()
        self.assertIn('[DRY RUN - SIMULATION]', dry_output)
        self.assertIn('Pending archival:                         2', dry_output)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 0)

        # 2. Live execution command
        out_live = StringIO()
        call_command('archive_location_history', days=14, stdout=out_live)
        live_output = out_live.getvalue()
        self.assertIn('[LIVE EXECUTION]', live_output)
        self.assertIn('Newly archived records:                   2', live_output)
        self.assertIn('Integrity Verification:                   PASSED', live_output)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 2)

    # =========================================================================
    # Task 009.1 Integrity & Deduplication Regression Tests
    # =========================================================================

    def test_combined_history_active_only(self):
        """Active-only history returns all records with source='active' and no errors."""
        rec1 = self._create_history_record(self.driver1, 23.8101, 90.4101, days_ago=1)
        rec2 = self._create_history_record(self.driver1, 23.8102, 90.4102, days_ago=0)

        combined = get_combined_location_history(self.driver1, start_time=self.now - datetime.timedelta(days=2))
        self.assertEqual(len(combined), 2)
        self.assertEqual(combined[0]['id'], rec1.id)
        self.assertEqual(combined[0]['source'], 'active')
        self.assertEqual(combined[1]['id'], rec2.id)
        self.assertEqual(combined[1]['source'], 'active')

    def test_combined_history_archived_only(self):
        """Archived-only history (simulating purged active data) returns all archived records."""
        rec_time = self.now - datetime.timedelta(days=25)
        arch = ArchivedLocationHistory.objects.create(
            original_id=99999,
            driver=self.driver1,
            driver_username=self.driver1.username,
            latitude=Decimal('23.8105000'),
            longitude=Decimal('90.4105000'),
            timestamp=rec_time,
            archived_at=self.now,
            archive_batch_id='test_batch_arch_only',
        )

        combined = get_combined_location_history(self.driver1, start_time=self.now - datetime.timedelta(days=30))
        self.assertEqual(len(combined), 1)
        self.assertEqual(combined[0]['id'], 99999)
        self.assertEqual(combined[0]['source'], 'archive')
        self.assertEqual(combined[0]['lat'], 23.8105)

    def test_combined_history_active_and_archived_copies_of_same_records(self):
        """Active and archived copies of the exact same records are NOT returned twice."""
        rec1 = self._create_history_record(self.driver1, 23.8110, 90.4110, days_ago=20)
        rec2 = self._create_history_record(self.driver1, 23.8120, 90.4120, days_ago=19)

        # Archive them (creating copies in ArchivedLocationHistory)
        archive_location_history(days=14, dry_run=False)

        # Both records now exist in active and archive
        self.assertEqual(LocationHistory.objects.count(), 2)
        self.assertEqual(ArchivedLocationHistory.objects.count(), 2)

        # Query combined history
        combined = get_combined_location_history(self.driver1, start_time=self.now - datetime.timedelta(days=25))
        # Must return exactly 2 points, NOT 4 points
        self.assertEqual(len(combined), 2)
        self.assertEqual(combined[0]['id'], rec1.id)
        self.assertEqual(combined[1]['id'], rec2.id)

    def test_combined_history_mixed_active_and_archived(self):
        """Mixed history (some active-only, some archived-only, some overlapping) combines cleanly."""
        t1 = self.now - datetime.timedelta(days=30)
        t2 = self.now - datetime.timedelta(days=20)
        t3 = self.now - datetime.timedelta(days=5)

        # Record 1: in archive only (simulating purged from active)
        arch1 = ArchivedLocationHistory.objects.create(
            original_id=88801,
            driver=self.driver1,
            driver_username=self.driver1.username,
            latitude=Decimal('23.8101'),
            longitude=Decimal('90.4101'),
            timestamp=t1,
            archived_at=self.now,
        )

        # Record 2: in both active and archive
        rec2 = self._create_history_record(self.driver1, 23.8102, 90.4102, days_ago=20)
        ArchivedLocationHistory.objects.create(
            original_id=rec2.id,
            driver=self.driver1,
            driver_username=self.driver1.username,
            latitude=Decimal('23.8102'),
            longitude=Decimal('90.4102'),
            timestamp=t2,
            archived_at=self.now,
        )

        # Record 3: in active only (recent)
        rec3 = self._create_history_record(self.driver1, 23.8103, 90.4103, days_ago=5)

        combined = get_combined_location_history(self.driver1, start_time=self.now - datetime.timedelta(days=35))
        # Must contain exactly 3 points
        self.assertEqual(len(combined), 3)
        self.assertEqual([p['id'] for p in combined], [88801, rec2.id, rec3.id])
        self.assertEqual(combined[0]['source'], 'archive')
        self.assertEqual(combined[1]['source'], 'active')
        self.assertEqual(combined[2]['source'], 'active')

    def test_identical_coordinates_and_timestamps_distinct_records_preserved(self):
        """
        Two distinct original records with identical coordinates and timestamps
        (e.g., bus stationary at a bus stop) must BOTH be preserved and not incorrectly collapsed.
        """
        shared_time = self.now - datetime.timedelta(days=20)

        # Record A
        rec_a = LocationHistory.objects.create(
            driver=self.driver1,
            latitude=Decimal('23.8103000'),
            longitude=Decimal('90.4125000'),
        )
        LocationHistory.objects.filter(id=rec_a.id).update(timestamp=shared_time)
        rec_a.refresh_from_db()

        # Record B (distinct original record, identical coords and timestamp)
        rec_b = LocationHistory.objects.create(
            driver=self.driver1,
            latitude=Decimal('23.8103000'),
            longitude=Decimal('90.4125000'),
        )
        LocationHistory.objects.filter(id=rec_b.id).update(timestamp=shared_time)
        rec_b.refresh_from_db()

        self.assertNotEqual(rec_a.id, rec_b.id)

        # Archive them
        archive_location_history(days=14, dry_run=False)

        combined = get_combined_location_history(self.driver1, start_time=self.now - datetime.timedelta(days=25))
        # Both distinct events must be present
        self.assertEqual(len(combined), 2)
        returned_ids = {p['id'] for p in combined}
        self.assertIn(rec_a.id, returned_ids)
        self.assertIn(rec_b.id, returned_ids)

    def test_combined_history_empty(self):
        """Empty history returns an empty list without error."""
        combined = get_combined_location_history(self.driver1, start_time=self.now)
        self.assertEqual(combined, [])

    def test_combined_history_respects_limit(self):
        """Combined history correctly respects the limit parameter."""
        for i in range(10):
            self._create_history_record(self.driver1, 23.8100 + i * 0.001, 90.4100 + i * 0.001, days_ago=25 - i)

        combined_limited = get_combined_location_history(
            self.driver1,
            start_time=self.now - datetime.timedelta(days=30),
            limit=4
        )
        self.assertEqual(len(combined_limited), 4)

    def test_verify_archive_integrity_reports_verified_fields_and_catches_all_drift(self):
        """Verifies that verify_archive_integrity reports verified fields and flags any attribute mismatch."""
        rec = self._create_history_record(self.driver1, 23.8105, 90.4105, days_ago=20)
        archive_location_history(days=14, dry_run=False)

        report = verify_archive_integrity(cutoff_datetime=self.now)
        self.assertTrue(report['verified'])
        self.assertEqual(report['mismatches'], 0)
        self.assertIn('original_id', report['fields_verified'])
        self.assertIn('driver_id', report['fields_verified'])
        self.assertIn('driver_username', report['fields_verified'])
        self.assertIn('latitude', report['fields_verified'])
        self.assertIn('longitude', report['fields_verified'])
        self.assertIn('timestamp', report['fields_verified'])

        # Mismatch in driver_username
        ArchivedLocationHistory.objects.filter(original_id=rec.id).update(driver_username='tampered_driver')
        report_bad = verify_archive_integrity(cutoff_datetime=self.now)
        self.assertFalse(report_bad['verified'])
        self.assertEqual(report_bad['mismatches'], 1)
        self.assertIn('driver_username mismatch', report_bad['details'][0]['errors'][0])

    def test_concurrency_unique_constraint_enforced_by_database(self):
        """Database enforces unique constraint on original_id, preventing concurrent duplicates."""
        from django.db import IntegrityError
        rec = self._create_history_record(self.driver1, 23.8100, 90.4100, days_ago=20)

        ArchivedLocationHistory.objects.create(
            original_id=rec.id,
            driver=self.driver1,
            driver_username=self.driver1.username,
            latitude=Decimal('23.8100'),
            longitude=Decimal('90.4100'),
            timestamp=rec.timestamp,
        )

        # Attempt duplicate insert directly -> IntegrityError
        with self.assertRaises(IntegrityError):
            ArchivedLocationHistory.objects.create(
                original_id=rec.id,
                driver=self.driver1,
                driver_username=self.driver1.username,
                latitude=Decimal('23.8100'),
                longitude=Decimal('90.4100'),
                timestamp=rec.timestamp,
            )

    def test_cutoff_boundary_microsecond_precision(self):
        """Verify exact microsecond boundary comparison: timestamp < cutoff."""
        cutoff = self.now - datetime.timedelta(days=14)

        # Record 1: strictly older by 1 millisecond -> should archive
        rec_older = LocationHistory.objects.create(driver=self.driver1, latitude=Decimal('23.81'), longitude=Decimal('90.41'))
        LocationHistory.objects.filter(id=rec_older.id).update(timestamp=cutoff - datetime.timedelta(milliseconds=1))

        # Record 2: at exact cutoff -> should NOT archive (half-open <)
        rec_exact = LocationHistory.objects.create(driver=self.driver1, latitude=Decimal('23.82'), longitude=Decimal('90.42'))
        LocationHistory.objects.filter(id=rec_exact.id).update(timestamp=cutoff)

        # Record 3: strictly newer by 1 millisecond -> should NOT archive
        rec_newer = LocationHistory.objects.create(driver=self.driver1, latitude=Decimal('23.83'), longitude=Decimal('90.43'))
        LocationHistory.objects.filter(id=rec_newer.id).update(timestamp=cutoff + datetime.timedelta(milliseconds=1))

        res = archive_location_history(cutoff_datetime=cutoff, dry_run=False)
        self.assertEqual(res['archived_count'], 1)
        self.assertTrue(ArchivedLocationHistory.objects.filter(original_id=rec_older.id).exists())
        self.assertFalse(ArchivedLocationHistory.objects.filter(original_id=rec_exact.id).exists())
        self.assertFalse(ArchivedLocationHistory.objects.filter(original_id=rec_newer.id).exists())

    def test_recent_live_telemetry_is_never_archived(self):
        """Newly ingested GPS telemetry (e.g. 5 seconds ago) can never be accidentally archived."""
        # Live record created right now
        live_rec = LocationHistory.objects.create(driver=self.driver1, latitude=Decimal('23.8155'), longitude=Decimal('90.4155'))

        res = archive_location_history(days=14, dry_run=False)
        self.assertEqual(res['archived_count'], 0)
        self.assertFalse(ArchivedLocationHistory.objects.filter(original_id=live_rec.id).exists())

