import datetime
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from buses.models import Bus, BusLocation, BusAssignment, Journey, ETACalculation
from locations.models import DriverLocation, LocationHistory
from locations.services import (
    record_driver_gps,
    should_update_eta,
    trigger_eta_update_if_needed,
    ETA_THROTTLE_SECONDS,
)
from schedules.models import Route, Stop


class UnifiedTrackingPipelineTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Driver 1
        self.driver1 = User.objects.create_user(
            username='driver1',
            email='driver1@test.com',
            password='password123',
            role='driver',
            first_name='John',
            last_name='Driver',
            is_active=True,
            approval_status='approved',
        )

        # Driver 2
        self.driver2 = User.objects.create_user(
            username='driver2',
            email='driver2@test.com',
            password='password123',
            role='driver',
            first_name='Bob',
            last_name='Driver2',
            is_active=True,
            approval_status='approved',
        )

        # Regular user (Student)
        self.student = User.objects.create_user(
            username='student1',
            email='student1@test.com',
            password='password123',
            role='student',
            is_active=True,
            approval_status='approved',
        )

        # Buses
        self.bus1 = Bus.objects.create(
            bus_number='BUS-101',
            license_plate='DHK-11-2233',
            bus_type='long',
            capacity=40,
            is_active=True,
        )
        self.bus2 = Bus.objects.create(
            bus_number='BUS-102',
            license_plate='DHK-11-4455',
            bus_type='shuttle',
            capacity=30,
            is_active=True,
        )

        # Routes
        self.route1 = Route.objects.create(
            name='Route 1: Campus to City',
            route_type='long',
            is_active=True,
            is_published=True,
        )
        self.route2 = Route.objects.create(
            name='Route 2: Shuttle Loop',
            route_type='shuttle',
            is_active=True,
            is_published=True,
        )

        # Stops for Route 1
        self.stop1 = Stop.objects.create(
            route=self.route1,
            name='Campus Main Gate',
            latitude=Decimal('23.8100000'),
            longitude=Decimal('90.4100000'),
            order=1,
            scheduled_time=datetime.time(10, 0),
        )
        self.stop2 = Stop.objects.create(
            route=self.route1,
            name='City Center',
            latitude=Decimal('23.8200000'),
            longitude=Decimal('90.4200000'),
            order=2,
            scheduled_time=datetime.time(10, 30),
        )

        # Bus Assignments
        self.assignment1 = BusAssignment.objects.create(
            bus=self.bus1,
            driver=self.driver1,
            route=self.route1,
            is_active=True,
        )
        self.assignment2 = BusAssignment.objects.create(
            bus=self.bus2,
            driver=self.driver2,
            route=self.route2,
            is_active=True,
        )

        # Active Journey for Driver 1
        self.journey1 = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            assignment=self.assignment1,
            status='active',
            start_latitude=Decimal('23.8103000'),
            start_longitude=Decimal('90.4125000'),
        )

    # 1. GPS update updates DriverLocation
    def test_gps_update_updates_driver_location(self):
        self.client.force_authenticate(user=self.driver1)
        payload = {
            'latitude': 23.8123456,
            'longitude': 90.4156789,
            'accuracy': 15.0,
            'speed': 25.5,
            'heading': 180.0,
        }
        response = self.client.post('/api/locations/location/update/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'success')
        self.assertEqual(response.data['bus_id'], self.bus1.id)

        driver_loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertEqual(round(float(driver_loc.latitude), 6), round(23.8123456, 6))
        self.assertEqual(round(float(driver_loc.longitude), 6), round(90.4156789, 6))
        self.assertEqual(driver_loc.speed, 25.5)
        self.assertEqual(driver_loc.heading, 180.0)
        self.assertTrue(driver_loc.is_sharing)
        self.assertEqual(driver_loc.journey, self.journey1)

    # 2. GPS update appends LocationHistory
    def test_gps_update_appends_location_history(self):
        self.client.force_authenticate(user=self.driver1)
        initial_history_count = LocationHistory.objects.filter(driver=self.driver1).count()

        coords = [
            (23.8110000, 90.4110000),
            (23.8120000, 90.4120000),
            (23.8130000, 90.4130000),
        ]
        for lat, lon in coords:
            res = self.client.post('/api/locations/location/update/', {
                'latitude': lat,
                'longitude': lon,
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

        new_history_count = LocationHistory.objects.filter(driver=self.driver1).count()
        self.assertEqual(new_history_count, initial_history_count + 3)

    # 3. GPS update synchronizes BusLocation for the correct bus
    def test_gps_update_synchronizes_bus_location(self):
        self.client.force_authenticate(user=self.driver1)
        payload = {
            'latitude': 23.8145000,
            'longitude': 90.4182000,
            'accuracy': 8.0,
            'speed': 35.2,
            'heading': 270.0,
        }
        response = self.client.post('/api/locations/location/update/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        bus_location = BusLocation.objects.filter(bus=self.bus1).order_by('-timestamp').first()
        self.assertIsNotNone(bus_location)
        self.assertEqual(round(float(bus_location.latitude), 6), round(23.8145000, 6))
        self.assertEqual(round(float(bus_location.longitude), 6), round(90.4182000, 6))
        self.assertEqual(float(bus_location.speed), 35.2)
        self.assertEqual(float(bus_location.heading), 270.0)
        self.assertTrue(bus_location.is_accurate)

    # 4. Bus detail endpoint returns latest live coordinates
    def test_bus_detail_endpoint_returns_latest_live_coordinates(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/location/update/', {
            'latitude': 23.8199999,
            'longitude': 90.4199999,
            'speed': 42.0,
            'heading': 90.0,
        }, format='json')

        # Query bus detail as student
        self.client.force_authenticate(user=self.student)
        detail_res = self.client.get(f'/api/buses/{self.bus1.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)

        data = detail_res.data
        self.assertIn('latest_location', data)
        self.assertIsNotNone(data['latest_location'])
        self.assertEqual(round(float(data['latest_location']['latitude']), 6), round(23.8199999, 6))
        self.assertEqual(round(float(data['latest_location']['longitude']), 6), round(90.4199999, 6))
        self.assertEqual(float(data['latest_location']['speed']), 42.0)

    # 5. Active locations endpoint includes bus_id
    def test_active_locations_endpoint_includes_bus_id(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/location/update/', {
            'latitude': 23.8150000,
            'longitude': 90.4150000,
        }, format='json')

        self.client.force_authenticate(user=self.student)
        res = self.client.get('/api/locations/location/active/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        items = res.data
        self.assertGreater(len(items), 0)
        driver_entry = next((i for i in items if i['driver_id'] == self.driver1.id), None)
        self.assertIsNotNone(driver_entry)
        self.assertIn('bus_id', driver_entry)
        self.assertEqual(driver_entry['bus_id'], self.bus1.id)
        self.assertEqual(driver_entry['bus_number'], self.bus1.bus_number)

    # 6. ETA calculation is triggered when appropriate
    def test_eta_calculation_triggered_on_gps_update(self):
        self.client.force_authenticate(user=self.driver1)
        self.assertEqual(ETACalculation.objects.filter(bus=self.bus1).count(), 0)

        res = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8110000,
            'longitude': 90.4110000,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        etas = ETACalculation.objects.filter(bus=self.bus1)
        self.assertEqual(etas.count(), 2)  # Route 1 has 2 stops
        stop_names = set(etas.values_list('stop__name', flat=True))
        self.assertIn('Campus Main Gate', stop_names)
        self.assertIn('City Center', stop_names)

    # 7. ETA throttling prevents excessive recalculation
    def test_eta_throttling_prevents_excessive_recalculation(self):
        with patch('buses.api_views.update_etas_for_bus') as mock_eta:
            # First update: no prior ETA calculation, so ETA update must trigger
            res1 = record_driver_gps(
                driver=self.driver1,
                latitude=23.811,
                longitude=90.411,
                throttle_seconds=15,
            )
            self.assertTrue(res1['eta_updated'])
            self.assertEqual(mock_eta.call_count, 1)

            # Manually seed an ETACalculation with calculated_at = now
            ETACalculation.objects.create(
                bus=self.bus1,
                stop=self.stop1,
                calculated_eta=timezone.now() + timezone.timedelta(minutes=10),
                scheduled_time=timezone.now(),
                distance_km=Decimal('2.5'),
            )

            # Second update within 15 seconds: should throttle
            mock_eta.reset_mock()
            res2 = record_driver_gps(
                driver=self.driver1,
                latitude=23.812,
                longitude=90.412,
                throttle_seconds=15,
                force_eta=False,
            )
            self.assertFalse(res2['eta_updated'])
            mock_eta.assert_not_called()

            # Third update with force_eta=True: should bypass throttle
            res3 = record_driver_gps(
                driver=self.driver1,
                latitude=23.813,
                longitude=90.413,
                throttle_seconds=15,
                force_eta=True,
            )
            self.assertTrue(res3['eta_updated'])
            mock_eta.assert_called_once()

    # 8. GPS update succeeds even if ETA calculation fails
    def test_gps_update_succeeds_even_if_eta_calculation_fails(self):
        self.client.force_authenticate(user=self.driver1)
        with patch('buses.api_views.update_etas_for_bus', side_effect=RuntimeError("ETA service broke down")):
            res = self.client.post('/api/locations/location/update/', {
                'latitude': 23.8160000,
                'longitude': 90.4160000,
                'speed': 20.0,
                'heading': 45.0,
            }, format='json')

            # HTTP request must still succeed
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['status'], 'success')
            self.assertFalse(res.data['eta_updated'])

            # Driver and Bus locations must still be updated
            driver_loc = DriverLocation.objects.get(driver=self.driver1)
            self.assertEqual(round(float(driver_loc.latitude), 6), round(23.8160000, 6))

            bus_loc = BusLocation.objects.filter(bus=self.bus1).latest('timestamp')
            self.assertEqual(round(float(bus_loc.latitude), 6), round(23.8160000, 6))

    # 9. Driver without active journey cannot update bus coordinates
    def test_driver_without_active_journey_cannot_update_bus(self):
        self.client.force_authenticate(user=self.driver2)  # driver2 has no active journey
        res = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8500000,
            'longitude': 90.4500000,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No active journey', res.data.get('error', ''))
        self.assertEqual(BusLocation.objects.filter(bus=self.bus2).count(), 0)

    # 10. Driver's GPS does not update another driver's bus
    def test_driver_gps_does_not_update_another_drivers_bus(self):
        # Start active journey for driver2 on bus2
        Journey.objects.create(
            driver=self.driver2,
            bus=self.bus2,
            route=self.route2,
            assignment=self.assignment2,
            status='active',
            start_latitude=Decimal('23.8500000'),
            start_longitude=Decimal('90.4500000'),
        )

        # Update driver 1 location
        self.client.force_authenticate(user=self.driver1)
        res = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8188888,
            'longitude': 90.4188888,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Check bus1 location updated
        bus1_loc = BusLocation.objects.filter(bus=self.bus1).latest('timestamp')
        self.assertEqual(round(float(bus1_loc.latitude), 6), round(23.8188888, 6))

        # Check bus2 has no location update from driver1
        self.assertEqual(BusLocation.objects.filter(bus=self.bus2).count(), 0)

    # 11. Journey ending stops active GPS tracking
    def test_journey_ending_stops_active_gps_tracking(self):
        self.client.force_authenticate(user=self.driver1)

        # Initial location update during active journey
        self.client.post('/api/locations/location/update/', {
            'latitude': 23.8150000,
            'longitude': 90.4150000,
        }, format='json')

        # End the journey
        end_res = self.client.post('/api/locations/journey/end/', {
            'latitude': 23.8200000,
            'longitude': 90.4200000,
        }, format='json')
        self.assertEqual(end_res.status_code, status.HTTP_200_OK)
        self.assertEqual(end_res.data['status'], 'success')

        # Check driver location sharing is stopped
        driver_loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertFalse(driver_loc.is_sharing)
        self.assertIsNone(driver_loc.journey)

        # Attempt to send GPS update after journey ended
        update_res = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8210000,
            'longitude': 90.4210000,
        }, format='json')
        self.assertEqual(update_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('No active journey', update_res.data.get('error', ''))

    # 12. Repeated identical GPS updates behave safely
    def test_repeated_identical_gps_updates_behave_safely(self):
        self.client.force_authenticate(user=self.driver1)
        payload = {
            'latitude': 23.8105000,
            'longitude': 90.4105000,
            'speed': 0.0,
            'heading': 90.0,
            'accuracy': 5.0,
        }
        for _ in range(5):
            res = self.client.post('/api/locations/location/update/', payload, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['status'], 'success')

        # History should have 5 records
        self.assertEqual(LocationHistory.objects.filter(driver=self.driver1).count(), 5)
        # BusLocations should have 5 records
        self.assertEqual(BusLocation.objects.filter(bus=self.bus1).count(), 5)

    # 13. start_journey rejects Null Island (0, 0)
    def test_start_journey_rejects_null_island(self):
        self.client.force_authenticate(user=self.driver2)
        res = self.client.post('/api/locations/journey/start/', {
            'latitude': 0,
            'longitude': 0,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Null Island', res.data.get('error', ''))

    # 14. start_journey rejects out-of-range coordinates
    def test_start_journey_rejects_out_of_range_coordinates(self):
        self.client.force_authenticate(user=self.driver2)
        res = self.client.post('/api/locations/journey/start/', {
            'latitude': 95.0,
            'longitude': 90.0,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Latitude must be between -90 and 90', res.data.get('error', ''))

    # 15. start_journey stores accuracy, speed, heading and creates initial BusLocation
    def test_start_journey_stores_telemetry_and_creates_bus_location(self):
        self.client.force_authenticate(user=self.driver2)
        res = self.client.post('/api/locations/journey/start/', {
            'latitude': 23.8550000,
            'longitude': 90.4550000,
            'accuracy': 12.0,
            'speed': 8.5,
            'heading': 180.0,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'success')

        journey = Journey.objects.get(id=res.data['journey_id'])
        self.assertEqual(round(float(journey.start_latitude), 6), round(23.8550000, 6))
        self.assertEqual(round(float(journey.start_longitude), 6), round(90.4550000, 6))

        driver_loc = DriverLocation.objects.get(driver=self.driver2)
        self.assertTrue(driver_loc.is_sharing)
        self.assertEqual(driver_loc.accuracy, 12.0)
        self.assertEqual(driver_loc.speed, 8.5)
        self.assertEqual(driver_loc.heading, 180.0)

        # Initial BusLocation created
        bus_loc = BusLocation.objects.filter(bus=self.bus2).latest('timestamp')
        self.assertIsNotNone(bus_loc)
        self.assertEqual(round(float(bus_loc.latitude), 6), round(23.8550000, 6))
        self.assertEqual(round(float(bus_loc.longitude), 6), round(90.4550000, 6))
        self.assertEqual(float(bus_loc.speed), 8.5)
        self.assertTrue(bus_loc.is_accurate)

    # 16. LocationUpdateSerializer and update_location reject Null Island (0, 0)
    def test_location_update_rejects_null_island(self):
        self.client.force_authenticate(user=self.driver1)
        res = self.client.post('/api/locations/location/update/', {
            'latitude': 0,
            'longitude': 0,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # 17. Active locations endpoint exposes numeric accuracy
    def test_active_locations_endpoint_exposes_numeric_accuracy(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/location/update/', {
            'latitude': 23.8155000,
            'longitude': 90.4155000,
            'accuracy': 18.5,
        }, format='json')

        self.client.force_authenticate(user=self.student)
        res = self.client.get('/api/locations/location/active/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        driver_entry = next((i for i in res.data if i['driver_id'] == self.driver1.id), None)
        self.assertIsNotNone(driver_entry)
        self.assertEqual(driver_entry['accuracy'], 18.5)

    # 18. Out-of-order GPS update with older timestamp does not overwrite newer live location
    def test_out_of_order_gps_update_ignored_for_live_state(self):
        self.client.force_authenticate(user=self.driver1)
        t_newer = timezone.now()

        # Newer update first
        res_newer = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8200000,
            'longitude': 90.4200000,
            'timestamp': t_newer.isoformat(),
        }, format='json')
        self.assertEqual(res_newer.status_code, status.HTTP_200_OK)
        self.assertEqual(res_newer.data['status'], 'success')

        # Delayed older update arrives later with timestamp 30 seconds in the past
        t_older = t_newer - timezone.timedelta(seconds=30)
        res_older = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8000000,
            'longitude': 90.4000000,
            'timestamp': t_older.isoformat(),
        }, format='json')
        self.assertEqual(res_older.status_code, status.HTTP_200_OK)
        self.assertEqual(res_older.data['status'], 'ignored')

        # Verify DriverLocation still holds the newer coordinates (23.82, 90.42)
        driver_loc = DriverLocation.objects.get(driver=self.driver1)
        self.assertEqual(round(float(driver_loc.latitude), 6), round(23.8200000, 6))
        self.assertEqual(round(float(driver_loc.longitude), 6), round(90.4200000, 6))

    # 19. Bus detail and bus locations endpoints expose numeric accuracy and heading
    def test_bus_detail_and_locations_expose_numeric_accuracy(self):
        self.client.force_authenticate(user=self.driver1)
        self.client.post('/api/locations/location/update/', {
            'latitude': 23.8177000,
            'longitude': 90.4177000,
            'accuracy': 14.2,
            'heading': 225.0,
            'speed': 30.0,
        }, format='json')

        self.client.force_authenticate(user=self.student)
        # Check /api/buses/<id>/
        detail_res = self.client.get(f'/api/buses/{self.bus1.id}/')
        self.assertEqual(detail_res.status_code, status.HTTP_200_OK)
        latest_loc = detail_res.data.get('latest_location')
        self.assertIsNotNone(latest_loc)
        self.assertEqual(latest_loc.get('accuracy'), 14.2)
        self.assertEqual(float(latest_loc.get('heading')), 225.0)

        # Check /api/buses/locations/
        locations_res = self.client.get('/api/buses/locations/')
        self.assertEqual(locations_res.status_code, status.HTTP_200_OK)
        bus_entry = next((b for b in locations_res.data if b['id'] == self.bus1.id), None)
        self.assertIsNotNone(bus_entry)
        self.assertEqual(bus_entry.get('accuracy'), 14.2)
        self.assertEqual(float(bus_entry.get('heading')), 225.0)
        self.assertTrue(bus_entry.get('is_accurate'))
        self.assertIsNotNone(bus_entry.get('timestamp'))
