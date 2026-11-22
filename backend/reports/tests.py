import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from buses.models import Bus, BusAssignment, BusLocation, Journey
from issues.models import Issue
from locations.models import DriverLocation, LocationHistory
from locations.services import record_driver_gps
from reports.models import TripLog
from reports.services import sync_journey_to_trip_log
from reports.analytics_service import (
    parse_date_boundaries,
    get_reports_overview_data,
    get_route_analytics_data,
    get_performance_summary_data,
    get_driver_logs_data,
)
from schedules.models import Route, Trip, Stop


class TripLogIntegrityAndAnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_superuser(
            username='admin_test',
            email='admin_test@test.com',
            password='adminpassword123',
            role='admin',
            is_active=True,
            approval_status='approved',
        )

        # Authority user
        self.authority = User.objects.create_user(
            username='auth_test',
            email='auth_test@test.com',
            password='authpassword123',
            role='authority',
            is_active=True,
            approval_status='approved',
        )

        # Drivers
        self.driver1 = User.objects.create_user(
            username='driver1',
            email='driver1@test.com',
            password='driverpassword123',
            role='driver',
            first_name='John',
            last_name='Driver',
            phone='01711111111',
            is_active=True,
            approval_status='approved',
        )

        self.driver2 = User.objects.create_user(
            username='driver2',
            email='driver2@test.com',
            password='driverpassword123',
            role='driver',
            first_name='Dave',
            last_name='Driver2',
            phone='01722222222',
            is_active=True,
            approval_status='approved',
        )

        # Buses
        self.bus1 = Bus.objects.create(
            bus_number='UB-101',
            license_plate='DHK-11-1001',
            bus_type='long',
            capacity=40,
            is_active=True,
        )
        self.bus2 = Bus.objects.create(
            bus_number='UB-102',
            license_plate='DHK-11-1002',
            bus_type='shuttle',
            capacity=25,
            is_active=True,
        )

        # Routes
        self.route1 = Route.objects.create(
            name='Campus - City Express',
            route_type='long',
            is_active=True,
            is_published=True,
            estimated_duration_mins=45,
        )
        self.route2 = Route.objects.create(
            name='Campus Loop Shuttle',
            route_type='shuttle',
            is_active=True,
            is_published=True,
            estimated_duration_mins=15,
        )

        # Trips on Route 1
        self.trip1 = Trip.objects.create(
            route=self.route1,
            name='Trip 01',
            trip_number=1,
            departure_time=datetime.time(8, 0),
            arrival_time=datetime.time(8, 45),
            is_active=True,
        )

        # Active Bus Assignments
        self.assignment1 = BusAssignment.objects.create(
            bus=self.bus1,
            driver=self.driver1,
            route=self.route1,
            date=timezone.now().date(),
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(12, 0),
            is_active=True,
        )

    # 1. Journey start creates correct lifecycle state
    def test_journey_start_lifecycle_state(self):
        self.client.force_authenticate(user=self.driver1)
        res = self.client.post('/api/locations/journey/start/', {
            'latitude': 23.8103,
            'longitude': 90.4125,
            'notes': 'Test morning journey'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')
        journey_id = res.data['journey_id']

        journey = Journey.objects.get(id=journey_id)
        self.assertEqual(journey.status, 'active')
        self.assertEqual(journey.driver, self.driver1)
        self.assertEqual(journey.bus, self.bus1)
        self.assertEqual(journey.route, self.route1)
        self.assertIsNotNone(journey.start_time)
        self.assertIsNone(journey.end_time)

        # DriverLocation must be marked sharing with journey attached
        loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertTrue(loc.is_sharing)
        self.assertEqual(loc.journey, journey)

    # 2. Journey completion records correct end timestamp and status 'completed'
    def test_journey_completion_records_end_timestamp_and_status(self):
        self.client.force_authenticate(user=self.driver1)
        start_res = self.client.post('/api/locations/journey/start/', {
            'latitude': 23.8100,
            'longitude': 90.4100
        }, format='json')
        journey_id = start_res.data['journey_id']

        end_res = self.client.post('/api/locations/journey/end/', {
            'latitude': 23.8200,
            'longitude': 90.4200,
            'notes': 'Arrived on time'
        }, format='json')

        self.assertEqual(end_res.status_code, status.HTTP_200_OK)
        journey = Journey.objects.get(id=journey_id)
        self.assertEqual(journey.status, 'completed')
        self.assertIsNotNone(journey.end_time)
        self.assertGreaterEqual(journey.end_time, journey.start_time)

        # DriverLocation must stop sharing
        loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertFalse(loc.is_sharing)
        self.assertIsNone(loc.journey)

        # TripLog must be synchronized
        trip_log = TripLog.objects.get(journey=journey)
        self.assertTrue(trip_log.is_completed)
        self.assertEqual(trip_log.bus, self.bus1)
        self.assertEqual(trip_log.route, self.route1)

    # 3. Journey duration calculation
    def test_journey_duration_calculation(self):
        start = timezone.now() - datetime.timedelta(minutes=37)
        end = timezone.now()
        j = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=start,
            end_time=end,
        )
        self.assertEqual(j.duration_minutes, 37)

        # Missing end_time returns None safely
        j_active = Journey.objects.create(
            driver=self.driver2,
            bus=self.bus2,
            route=self.route2,
            status='active',
            start_time=start,
            end_time=None,
        )
        self.assertIsNone(j_active.duration_minutes)

        # Clock drift / negative delta safely returns None and logs warning (not falsely 0)
        j_skew = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=timezone.now(),
            end_time=timezone.now() - datetime.timedelta(minutes=5),
        )
        self.assertIsNone(j_skew.duration_minutes)

    # 4. Aborted journey does not count as completed
    def test_aborted_journey_does_not_count_as_completed(self):
        self.client.force_authenticate(user=self.driver1)
        start_res = self.client.post('/api/locations/journey/start/', format='json')
        journey_id = start_res.data['journey_id']

        abort_res = self.client.post('/api/locations/journey/abort/', {
            'reason': 'Engine overheating'
        }, format='json')
        self.assertEqual(abort_res.status_code, status.HTTP_200_OK)
        self.assertEqual(abort_res.data['status'], 'aborted')

        journey = Journey.objects.get(id=journey_id)
        self.assertEqual(journey.status, 'aborted')
        self.assertIn('Engine overheating', journey.notes)

        # Overview statistics must NOT count this as completed
        overview = get_reports_overview_data(days=30)
        self.assertEqual(overview['stats']['total_trips_30d'], 0)
        self.assertEqual(overview['stats']['aborted_trips_30d'], 1)

    # 5. Duplicate journey prevention for same driver
    def test_duplicate_journey_prevention_driver(self):
        self.client.force_authenticate(user=self.driver1)
        res1 = self.client.post('/api/locations/journey/start/', format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second start attempt must be rejected
        res2 = self.client.post('/api/locations/journey/start/', format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already have an active journey', res2.data['error'])

    # 6. Bus conflict prevention (another driver cannot start on a bus with active journey)
    def test_bus_conflict_prevention(self):
        # Driver 1 starts journey on Bus 1
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')

        # Create assignment for Driver 2 to the same bus (Bus 1)
        # First deactivate driver1's assignment without clearing bus
        self.assignment1.is_active = False
        self.assignment1.save()

        BusAssignment.objects.create(
            bus=self.bus1,
            driver=self.driver2,
            route=self.route1,
            is_active=True,
        )

        # Driver 2 tries to start journey on Bus 1 while Bus 1 still has active journey from Driver 1
        self.client.force_authenticate(user=self.driver2)
        res = self.client.post('/api/locations/journey/start/', format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already has an active journey', res.data['error'])

    # 7. Assignment clearing auto-aborts active journeys
    def test_assignment_clear_aborts_active_journey(self):
        self.client.force_authenticate(user=self.driver1)
        start_res = self.client.post('/api/locations/journey/start/', format='json')
        journey_id = start_res.data['journey_id']

        # Admin clears assignment
        self.client.force_authenticate(user=self.admin)
        res = self.client.post(f'/api/buses/{self.bus1.id}/clear-assignment/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        journey = Journey.objects.get(id=journey_id)
        self.assertEqual(journey.status, 'aborted')
        self.assertIn('Auto-aborted: Bus assignment cleared', journey.notes)

        # Driver location sharing must be deactivated
        loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertFalse(loc.is_sharing)
        self.assertIsNone(loc.journey)

    # 8. Historical bus/driver/route integrity preserved after assignment changes
    def test_historical_integrity_preserved_after_assignment_changes(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')
        self.client.post('/api/locations/journey/end/', format='json')

        journey = Journey.objects.first()
        self.assertEqual(journey.status, 'completed')

        # Reassign bus1 to driver2 and route2
        self.assignment1.is_active = False
        self.assignment1.save()
        new_assignment = BusAssignment.objects.create(
            bus=self.bus1,
            driver=self.driver2,
            route=self.route2,
            is_active=True,
        )

        # Historical journey must still point to original driver1, bus1, route1
        journey.refresh_from_db()
        self.assertEqual(journey.driver, self.driver1)
        self.assertEqual(journey.bus, self.bus1)
        self.assertEqual(journey.route, self.route1)

        # TripLog also preserves original entities
        trip_log = TripLog.objects.get(journey=journey)
        self.assertEqual(trip_log.driver, self.driver1)
        self.assertEqual(trip_log.bus, self.bus1)
        self.assertEqual(trip_log.route, self.route1)

    # 9. Invalid lifecycle transition rejection
    def test_invalid_lifecycle_transition_rejection(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')
        self.client.post('/api/locations/journey/end/', format='json')

        # Cannot end an already completed journey
        res_end = self.client.post('/api/locations/journey/end/', format='json')
        self.assertEqual(res_end.status_code, status.HTTP_400_BAD_REQUEST)

        # Cannot abort an already completed journey
        res_abort = self.client.post('/api/locations/journey/abort/', format='json')
        self.assertEqual(res_abort.status_code, status.HTTP_400_BAD_REQUEST)

    # 10. Analytics counts match underlying records
    def test_analytics_counts_match_underlying_records(self):
        # Create 3 completed journeys on route 1
        for i in range(3):
            j = Journey.objects.create(
                driver=self.driver1,
                bus=self.bus1,
                route=self.route1,
                status='completed',
                start_time=timezone.now() - datetime.timedelta(hours=i * 2 + 1),
                end_time=timezone.now() - datetime.timedelta(hours=i * 2),
            )
            sync_journey_to_trip_log(j)

        # Create 1 completed journey on route 2
        j2 = Journey.objects.create(
            driver=self.driver2,
            bus=self.bus2,
            route=self.route2,
            status='completed',
            start_time=timezone.now() - datetime.timedelta(hours=5),
            end_time=timezone.now() - datetime.timedelta(hours=4),
        )
        sync_journey_to_trip_log(j2)

        # Create 1 aborted journey (should NOT be counted in completed)
        j_aborted = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='aborted',
            start_time=timezone.now() - datetime.timedelta(hours=6),
            end_time=timezone.now() - datetime.timedelta(hours=5),
        )
        sync_journey_to_trip_log(j_aborted)

        overview = get_reports_overview_data(days=30)
        self.assertEqual(overview['stats']['total_trips_30d'], 4)
        self.assertEqual(overview['stats']['aborted_trips_30d'], 1)

        # Check API endpoint as admin
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/reports/overview/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['stats']['total_trips_30d'], 4)

    # 11. Analytics date filtering
    def test_analytics_date_filtering(self):
        # Journey within the last 5 days
        j_recent = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=timezone.now() - datetime.timedelta(days=2),
            end_time=timezone.now() - datetime.timedelta(days=2, hours=-1),
        )
        sync_journey_to_trip_log(j_recent)

        # Journey older than 40 days
        j_old = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=timezone.now() - datetime.timedelta(days=45),
            end_time=timezone.now() - datetime.timedelta(days=45, hours=-1),
        )
        sync_journey_to_trip_log(j_old)

        # Query 10 days window
        today = timezone.now().date()
        s_date = (today - datetime.timedelta(days=10)).isoformat()
        e_date = today.isoformat()

        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'/api/reports/analytics/?start_date={s_date}&end_date={e_date}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        routes = res.data['routes']
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0]['total_trips'], 1)

    # 12. Empty analytics dataset returns safe defaults
    def test_empty_analytics_dataset_safe_defaults(self):
        self.client.force_authenticate(user=self.admin)

        res_overview = self.client.get('/api/reports/overview/')
        self.assertEqual(res_overview.status_code, status.HTTP_200_OK)
        self.assertEqual(res_overview.data['stats']['total_trips_30d'], 0)
        self.assertEqual(res_overview.data['route_performance'], [])

        res_analytics = self.client.get('/api/reports/analytics/?days=7')
        self.assertEqual(res_analytics.status_code, status.HTTP_200_OK)
        self.assertEqual(res_analytics.data['routes'], [])

        res_perf = self.client.get('/api/reports/performance/?days=7')
        self.assertEqual(res_perf.status_code, status.HTTP_200_OK)
        self.assertEqual(res_perf.data['overall']['total'], 0)
        self.assertEqual(res_perf.data['by_route'], [])
        self.assertEqual(res_perf.data['daily'], [])

    # 13. GPS updates do not create or complete journeys
    def test_gps_updates_do_not_create_or_complete_journeys(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')
        initial_count = Journey.objects.count()

        # Send 3 GPS updates
        for i in range(3):
            lat = round(23.8100 + (i * 0.001), 4)
            lng = round(90.4100 + (i * 0.001), 4)
            res = self.client.post('/api/locations/location/update/', {
                'latitude': lat,
                'longitude': lng,
                'speed': 10.0,
                'heading': 90.0,
                'accuracy': 15.0,
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Journey count must not change
        self.assertEqual(Journey.objects.count(), initial_count)
        journey = Journey.objects.first()
        self.assertEqual(journey.status, 'active')

        # BusLocation records are created, but Journey remains active
        self.assertEqual(BusLocation.objects.count(), 3)
        self.assertEqual(LocationHistory.objects.count(), 3)

    # 14. Export endpoints return consistent data
    def test_export_data_endpoints(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')
        self.client.post('/api/locations/journey/end/', format='json')

        self.client.force_authenticate(user=self.admin)
        res_trips = self.client.get('/api/reports/export/?type=trips&days=30')
        self.assertEqual(res_trips.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_trips.data), 1)
        self.assertEqual(res_trips.data[0]['bus_number'], 'UB-101')
        self.assertTrue(res_trips.data[0]['is_completed'])

        res_perf = self.client.get('/api/reports/export/?type=performance&days=30')
        self.assertEqual(res_perf.status_code, status.HTTP_200_OK)

    # 15. Timezone boundary precision (half-open interval [start_dt, next_day_dt))
    def test_timezone_boundary_precision(self):
        today = timezone.now().date()
        s_date, e_date, s_dt, e_dt = parse_date_boundaries(today.isoformat(), today.isoformat())
        self.assertEqual(s_dt.time(), datetime.time.min)
        self.assertEqual(e_dt.time(), datetime.time.min)
        self.assertEqual(e_dt.date(), today + datetime.timedelta(days=1))
        self.assertTrue(timezone.is_aware(s_dt))
        self.assertTrue(timezone.is_aware(e_dt))

    # 16. TripLog synchronization failure and transaction rollback
    def test_sync_failure_transaction_rollback(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')
        journey = Journey.objects.get(driver=self.driver1, status='active')

        from unittest.mock import patch
        with patch('locations.api_views.sync_journey_to_trip_log', side_effect=RuntimeError('Database disk I/O error')):
            with self.assertRaises(RuntimeError):
                self.client.post('/api/locations/journey/end/', format='json')

        # Verify that atomic transaction rolled back: journey is still active and location still sharing
        journey.refresh_from_db()
        self.assertEqual(journey.status, 'active')
        self.assertIsNone(journey.end_time)

        loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertTrue(loc.is_sharing)
        self.assertEqual(loc.journey, journey)

        # No TripLog should have been committed
        self.assertFalse(TripLog.objects.filter(journey=journey).exists())

    # 17. Simultaneous journey completion and duplicate end requests
    def test_duplicate_end_requests_rejected(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')

        res1 = self.client.post('/api/locations/journey/end/', format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second completion attempt must fail cleanly
        res2 = self.client.post('/api/locations/journey/end/', format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        # Exactly 1 TripLog should exist for this journey
        journey = Journey.objects.get(driver=self.driver1)
        self.assertEqual(TripLog.objects.filter(journey=journey).count(), 1)

    # 18. Duplicate abort requests rejected
    def test_duplicate_abort_requests_rejected(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')

        res1 = self.client.post('/api/locations/journey/abort/', {'reason': 'Traffic gridlock'}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        res2 = self.client.post('/api/locations/journey/abort/', {'reason': 'Second abort attempt'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    # 19. Negative or invalid duration handling
    def test_negative_or_corrupted_duration_handling(self):
        # Case A: Model property duration_minutes returns None for corrupted negative duration and logs warning
        j_corrupt = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=timezone.now(),
            end_time=timezone.now() - datetime.timedelta(minutes=10),
        )
        self.assertIsNone(j_corrupt.duration_minutes)

        # Case B: API rejects ending journey with end_time < start_time
        j_future = Journey.objects.create(
            driver=self.driver2,
            bus=self.bus2,
            route=self.route2,
            status='active',
            start_time=timezone.now() + datetime.timedelta(hours=2),
        )
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/locations/journey/end/', {'journey_id': j_future.id}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot be earlier than start time', res.data['error'])

    # 20. Date boundary and fractional-second precision handling
    def test_date_boundary_and_fractional_second_handling(self):
        tz = timezone.get_current_timezone()
        target_date = datetime.date(2026, 6, 15)

        # Record A: Exactly midnight of target date (00:00:00.000000)
        dt_start = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time.min), tz)
        j_a = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=dt_start,
            end_time=dt_start + datetime.timedelta(minutes=30),
        )
        sync_journey_to_trip_log(j_a)

        # Record B: Fractional microsecond before midnight (23:59:59.999999)
        dt_end_sec = timezone.make_aware(datetime.datetime(2026, 6, 15, 23, 59, 59, 999999), tz)
        j_b = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=dt_end_sec,
            end_time=dt_end_sec + datetime.timedelta(minutes=30),
        )
        sync_journey_to_trip_log(j_b)

        # Record C: Next day exactly at midnight (2026-06-16 00:00:00.000000) - MUST BE EXCLUDED
        dt_next_day = timezone.make_aware(datetime.datetime.combine(datetime.date(2026, 6, 16), datetime.time.min), tz)
        j_c = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            status='completed',
            start_time=dt_next_day,
            end_time=dt_next_day + datetime.timedelta(minutes=30),
        )
        sync_journey_to_trip_log(j_c)

        # Query single day: 2026-06-15
        s_date, e_date, s_dt, next_dt = parse_date_boundaries('2026-06-15', '2026-06-15')
        data = get_performance_summary_data(s_date, e_date, s_dt, next_dt)

        # Exactly 2 trips should be included (Record A and B); Record C must be excluded
        self.assertEqual(data['overall']['total'], 2)

    # 21. Assignment clear auto-abort cause is distinguishable
    def test_assignment_clear_auto_abort_distinguishable_from_driver_abort(self):
        # Driver-initiated abort
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/journey/start/', format='json')
        self.client.post('/api/locations/journey/abort/', {'reason': 'Flat tyre'}, format='json')
        j_driver_abort = Journey.objects.first()
        self.assertIn('[Aborted by driver:driver1]', j_driver_abort.notes)
        self.assertIn('Flat tyre', j_driver_abort.notes)

        # Now test auto-abort from admin clearing assignment
        self.client.force_authenticate(user=self.driver2)
        # Create new assignment for driver2 on bus2
        BusAssignment.objects.create(
            bus=self.bus2,
            driver=self.driver2,
            route=self.route2,
            is_active=True,
        )
        self.client.post('/api/locations/journey/start/', format='json')
        j_auto = Journey.objects.get(driver=self.driver2, status='active')

        # Admin clears assignment
        self.client.force_authenticate(user=self.admin)
        self.client.post(f'/api/buses/{self.bus2.id}/clear-assignment/')

        j_auto.refresh_from_db()
        self.assertEqual(j_auto.status, 'aborted')
        self.assertIn('[Auto-aborted: Bus assignment cleared by admin:admin_test]', j_auto.notes)
        self.assertNotIn('[Aborted by driver', j_auto.notes)

    # 22. Punctuality metric consistency with centralized constant
    def test_punctuality_consistency_with_constant(self):
        from reports.constants import ON_TIME_TOLERANCE_MINUTES
        self.assertEqual(ON_TIME_TOLERANCE_MINUTES, 5)

        # Journey 1: departure delay is 4 minutes (<= 5) -> on time
        t_sched = datetime.time(8, 0)
        t_act_ontime = datetime.time(8, 4)
        tl_ontime = TripLog.objects.create(
            bus=self.bus1,
            route=self.route1,
            driver=self.driver1,
            date=datetime.date(2026, 6, 1),
            scheduled_departure=t_sched,
            actual_departure=t_act_ontime,
            is_completed=True,
        )
        self.assertEqual(tl_ontime.departure_delay_mins, 4)
        self.assertTrue(tl_ontime.is_on_time)

        # Journey 2: departure delay is 8 minutes (> 5) -> delayed
        t_act_delayed = datetime.time(8, 8)
        tl_delayed = TripLog.objects.create(
            bus=self.bus1,
            route=self.route1,
            driver=self.driver1,
            date=datetime.date(2026, 6, 1),
            scheduled_departure=t_sched,
            actual_departure=t_act_delayed,
            is_completed=True,
        )
        self.assertEqual(tl_delayed.departure_delay_mins, 8)
        self.assertFalse(tl_delayed.is_on_time)

    def test_export_data_api_trips_bounded_and_access_controlled(self):
        # 1. Non-admin user gets 403 Forbidden
        self.client.force_authenticate(user=self.driver1)
        res_forbidden = self.client.get('/api/reports/export/?type=trips')
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Admin user gets 200 OK with bounded results
        self.client.force_authenticate(user=self.admin)
        res_ok = self.client.get('/api/reports/export/?type=trips&days=30')
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertIsInstance(res_ok.data, list)
        self.assertLessEqual(len(res_ok.data), 1000)

