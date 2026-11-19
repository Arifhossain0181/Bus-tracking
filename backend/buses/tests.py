import datetime
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from buses.models import Bus, BusLocation, BusAssignment, Journey
from buses.serializers import BusSerializer, BusLocationSerializer
from schedules.models import Route


class BusFollowSerializerAndAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.driver = User.objects.create_user(
            username='driver_test',
            email='driver_test@test.com',
            password='password123',
            role='driver',
            first_name='Alex',
            last_name='Driver',
            is_active=True,
            approval_status='approved',
        )

        self.student = User.objects.create_user(
            username='student_test',
            email='student_test@test.com',
            password='password123',
            role='student',
            is_active=True,
            approval_status='approved',
        )

        self.bus = Bus.objects.create(
            bus_number='BUS-200',
            license_plate='DHK-55-6677',
            bus_type='long',
            capacity=50,
            is_active=True,
        )

        self.route = Route.objects.create(
            name='Test Route',
            route_type='long',
            is_active=True,
            is_published=True,
        )

        self.assignment = BusAssignment.objects.create(
            bus=self.bus,
            driver=self.driver,
            route=self.route,
            is_active=True,
        )

    def test_bus_location_serializer_includes_accuracy(self):
        loc = BusLocation.objects.create(
            bus=self.bus,
            latitude=Decimal('23.8105000'),
            longitude=Decimal('90.4105000'),
            speed=Decimal('20.50'),
            heading=Decimal('180.00'),
            is_accurate=False,
        )
        data = BusLocationSerializer(loc).data
        self.assertIn('is_accurate', data)
        self.assertFalse(data['is_accurate'])
        self.assertEqual(float(data['speed']), 20.5)

    def test_bus_serializer_includes_active_journey(self):
        journey = Journey.objects.create(
            driver=self.driver,
            bus=self.bus,
            route=self.route,
            assignment=self.assignment,
            status='active',
            start_latitude=Decimal('23.8100000'),
            start_longitude=Decimal('90.4100000'),
        )
        data = BusSerializer(self.bus).data
        self.assertIn('active_journey', data)
        self.assertIsNotNone(data['active_journey'])
        self.assertEqual(data['active_journey']['id'], journey.id)
        self.assertEqual(data['active_journey']['status'], 'active')
        self.assertEqual(data['active_journey']['driver_name'], 'Alex Driver')

    def test_bus_serializer_includes_latest_journey_when_ended(self):
        journey = Journey.objects.create(
            driver=self.driver,
            bus=self.bus,
            route=self.route,
            assignment=self.assignment,
            status='completed',
            start_time=timezone.now() - timezone.timedelta(hours=1),
            end_time=timezone.now(),
        )
        data = BusSerializer(self.bus).data
        self.assertIsNone(data['active_journey'])
        self.assertIn('latest_journey', data)
        self.assertIsNotNone(data['latest_journey'])
        self.assertEqual(data['latest_journey']['status'], 'completed')

    def test_bus_detail_api_returns_all_follow_fields(self):
        BusLocation.objects.create(
            bus=self.bus,
            latitude=Decimal('23.8120000'),
            longitude=Decimal('90.4120000'),
            speed=Decimal('30.00'),
            heading=Decimal('90.00'),
            is_accurate=True,
        )
        self.client.force_authenticate(user=self.student)
        res = self.client.get(f'/api/buses/{self.bus.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        data = res.data
        self.assertIn('latest_location', data)
        self.assertIsNotNone(data['latest_location'])
        self.assertTrue(data['latest_location']['is_accurate'])
        self.assertIn('recent_locations', data)
        self.assertEqual(len(data['recent_locations']), 1)
        self.assertIn('active_journey', data)
        self.assertIn('latest_journey', data)
