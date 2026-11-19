import datetime
from decimal import Decimal
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from accounts.serializers import UserSerializer
from buses.models import Bus, BusAssignment, Journey
from schedules.models import Route, Stop


class SecurityHardeningTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

        # Admin user
        self.admin = User.objects.create_superuser(
            username='admin_sec',
            email='admin_sec@example.com',
            password='AdminStrongPassword!123',
            role='admin',
            is_active=True,
            approval_status='approved',
        )

        # Driver 1
        self.driver1 = User.objects.create_user(
            username='driver1_sec',
            email='driver1_sec@example.com',
            password='DriverStrongPassword!123',
            role='driver',
            first_name='Dave',
            last_name='Driver',
            nid_number='19901234567890',
            address='123 Road, Dhaka',
            is_active=True,
            approval_status='approved',
        )

        # Driver 2
        self.driver2 = User.objects.create_user(
            username='driver2_sec',
            email='driver2_sec@example.com',
            password='Driver2StrongPassword!123',
            role='driver',
            first_name='Dan',
            last_name='Driver',
            is_active=True,
            approval_status='approved',
        )

        # Student user
        self.student = User.objects.create_user(
            username='student_sec',
            email='student_sec@example.com',
            password='StudentStrongPassword!123',
            role='student',
            first_name='Sam',
            last_name='Student',
            university_id='STU-2026-999',
            is_active=True,
            approval_status='approved',
        )

        # Bus & Route setup for telemetry tests
        self.bus1 = Bus.objects.create(
            bus_number='BUS-SEC-1',
            license_plate='DHK-SEC-01',
            bus_type='long',
            capacity=40,
            is_active=True,
        )
        self.route1 = Route.objects.create(
            name='Sec Route 1',
            route_type='long',
            is_active=True,
            is_published=True,
        )
        self.stop1 = Stop.objects.create(
            route=self.route1,
            name='Sec Stop 1',
            latitude=Decimal('23.8100000'),
            longitude=Decimal('90.4100000'),
            order=1,
        )
        self.assignment1 = BusAssignment.objects.create(
            bus=self.bus1,
            driver=self.driver1,
            route=self.route1,
            is_active=True,
        )
        self.journey1 = Journey.objects.create(
            driver=self.driver1,
            bus=self.bus1,
            route=self.route1,
            assignment=self.assignment1,
            status='active',
            start_latitude=Decimal('23.8100000'),
            start_longitude=Decimal('90.4100000'),
        )

    def tearDown(self):
        cache.clear()

    # 1. Registration cannot create privileged roles
    def test_registration_rejects_privileged_roles(self):
        privileged_roles = ['admin', 'authority', 'driver', 'superuser']
        for role in privileged_roles:
            res = self.client.post('/api/auth/register/', {
                'full_name': 'Hacker User',
                'username': f'hacker_{role}',
                'university_id': f'ID-{role}-123',
                'password': 'StrongPassword!2026',
                'role': role,
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('role', res.data)

    # 2. Insecure predictable passwords derived from University ID are rejected
    def test_registration_rejects_university_id_as_password(self):
        uid = 'STU-2026-555'
        res = self.client.post('/api/auth/register/', {
            'full_name': 'Test Student',
            'username': 'student_insecure_pw',
            'university_id': uid,
            'password': uid,  # Password identical to university_id
            'role': 'student',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', res.data)
        self.assertIn('University ID', str(res.data['password']))

    def test_registration_rejects_username_as_password(self):
        username = 'student_user_pw'
        res = self.client.post('/api/auth/register/', {
            'full_name': 'Test Student',
            'username': username,
            'university_id': 'STU-2026-666',
            'password': username,  # Password identical to username
            'role': 'student',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', res.data)

    def test_registration_enforces_minimum_length_and_complexity(self):
        # Short password
        res = self.client.post('/api/auth/register/', {
            'full_name': 'Short Pass Student',
            'username': 'student_short_pw',
            'university_id': 'STU-2026-777',
            'password': 'short',
            'role': 'student',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Entirely numeric common password
        res2 = self.client.post('/api/auth/register/', {
            'full_name': 'Numeric Pass Student',
            'username': 'student_numeric_pw',
            'university_id': 'STU-2026-888',
            'password': '12345678',
            'role': 'student',
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    # 3. Legitimate registration succeeds with strong password and creates pending account
    def test_registration_succeeds_with_strong_password(self):
        res = self.client.post('/api/auth/register/', {
            'full_name': 'Legit Student',
            'username': 'student_legit_2026',
            'university_id': 'STU-2026-111',
            'password': 'MyStrongSecurePassword#2026',
            'role': 'student',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('message', res.data)

        user = User.objects.get(username='student_legit_2026')
        self.assertFalse(user.is_active)
        self.assertEqual(user.approval_status, 'pending')
        self.assertTrue(user.check_password('MyStrongSecurePassword#2026'))

    # 4. Login correctly handles pending and rejected accounts with 403
    def test_login_rejects_pending_account_with_403(self):
        User.objects.create_user(
            username='pending_user',
            password='ValidPassword!123',
            university_id='STU-PENDING-01',
            role='student',
            is_active=False,
            approval_status='pending',
        )
        res = self.client.post('/api/auth/login/', {
            'username': 'pending_user',
            'password': 'ValidPassword!123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('pending admin approval', res.data.get('error', ''))

    def test_login_rejects_rejected_account_with_403(self):
        User.objects.create_user(
            username='rejected_user',
            password='ValidPassword!123',
            university_id='STU-REJECT-01',
            role='student',
            is_active=False,
            approval_status='rejected',
            rejection_reason='Invalid student ID',
        )
        res = self.client.post('/api/auth/login/', {
            'username': 'rejected_user',
            'password': 'ValidPassword!123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('rejected', res.data.get('error', ''))

    # 5. Invalid credentials return 401
    def test_login_rejects_invalid_credentials_with_401(self):
        res = self.client.post('/api/auth/login/', {
            'username': self.student.username,
            'password': 'WrongPassword999!',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('Invalid username or password', res.data.get('error', ''))

    # 6. Unauthenticated requests to protected endpoints return 401
    def test_unauthenticated_requests_return_401(self):
        protected_endpoints = [
            ('/api/auth/me/', 'GET'),
            ('/api/auth/profile/', 'GET'),
            ('/api/buses/', 'GET'),
            ('/api/locations/location/update/', 'POST'),
            ('/api/locations/journey/start/', 'POST'),
            ('/api/schedules/routes/', 'GET'),
        ]
        for url, method in protected_endpoints:
            if method == 'GET':
                res = self.client.get(url)
            else:
                res = self.client.post(url, {})
            self.assertEqual(
                res.status_code,
                status.HTTP_401_UNAUTHORIZED,
                f"Expected 401 for unauthenticated {method} {url}, got {res.status_code}"
            )

    # 7. Regular users cannot perform admin operations (return 403)
    def test_regular_user_cannot_perform_admin_actions(self):
        self.client.force_authenticate(user=self.student)

        # Attempt to access admin users list
        res = self.client.get('/api/auth/users/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to create a bus
        res2 = self.client.post('/api/buses/', {
            'bus_number': 'HACK-999',
            'license_plate': 'HACK-01',
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to create a route
        res3 = self.client.post('/api/schedules/routes/', {
            'name': 'Hacker Route',
        }, format='json')
        self.assertEqual(res3.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to approve a pending user
        res4 = self.client.post('/api/auth/pending/1/approve/')
        self.assertEqual(res4.status_code, status.HTTP_403_FORBIDDEN)

    # 8. Driver cannot manipulate another driver's journey or GPS
    def test_driver_cannot_update_another_drivers_gps(self):
        # Authenticated as driver2 (who has no active journey on bus1)
        self.client.force_authenticate(user=self.driver2)
        res = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8500000,
            'longitude': 90.4500000,
        }, format='json')
        # driver2 cannot share GPS without their own active journey
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # driver2 cannot end driver1's journey
        res2 = self.client.post('/api/locations/journey/end/', {
            'latitude': 23.8500000,
            'longitude': 90.4500000,
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

        # Verify driver1's journey is still active
        self.journey1.refresh_from_db()
        self.assertEqual(self.journey1.status, 'active')

    # 9. GPS Endpoint input validation rejects out-of-bounds & malicious data
    def test_gps_endpoint_rejects_out_of_bounds_and_invalid_coordinates(self):
        self.client.force_authenticate(user=self.driver1)

        # Latitude > 90
        res1 = self.client.post('/api/locations/location/update/', {
            'latitude': 95.0000000,
            'longitude': 90.4100000,
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('latitude', res1.data)

        # Longitude < -180
        res2 = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8100000,
            'longitude': -190.0000000,
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('longitude', res2.data)

        # Null Island (0, 0)
        res3 = self.client.post('/api/locations/location/update/', {
            'latitude': 0.0,
            'longitude': 0.0,
        }, format='json')
        self.assertEqual(res3.status_code, status.HTTP_400_BAD_REQUEST)

        # Negative speed
        res4 = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8100000,
            'longitude': 90.4100000,
            'speed': -20.0,
        }, format='json')
        self.assertEqual(res4.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('speed', res4.data)

        # Unrealistic speed (> 150 m/s = 540 km/h)
        res5 = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8100000,
            'longitude': 90.4100000,
            'speed': 500.0,
        }, format='json')
        self.assertEqual(res5.status_code, status.HTTP_400_BAD_REQUEST)

        # Invalid heading (> 360)
        res6 = self.client.post('/api/locations/location/update/', {
            'latitude': 23.8100000,
            'longitude': 90.4100000,
            'heading': 450.0,
        }, format='json')
        self.assertEqual(res6.status_code, status.HTTP_400_BAD_REQUEST)

    # 10. Sensitive data exposure protection in serializers
    def test_sensitive_fields_not_exposed_to_unauthorized_users(self):
        # Driver 1 has nid_number and address
        # 1. Admin viewing Driver 1 profile gets NID and address
        admin_data = UserSerializer(self.driver1, context={'request': type('Req', (), {'user': self.admin})()}).data
        self.assertIn('nid_number', admin_data)
        self.assertEqual(admin_data['nid_number'], '19901234567890')

        # 2. Driver viewing their own profile gets NID and address
        owner_data = UserSerializer(self.driver1, context={'request': type('Req', (), {'user': self.driver1})()}).data
        self.assertIn('nid_number', owner_data)

        # 3. Third-party student viewing driver data does NOT get NID or address
        student_data = UserSerializer(self.driver1, context={'request': type('Req', (), {'user': self.student})()}).data
        self.assertNotIn('nid_number', student_data)
        self.assertNotIn('address', student_data)

        # 4. Password hash is never exposed anywhere
        self.assertNotIn('password', student_data)
        self.assertNotIn('password', admin_data)

    # 11. Throttling blocks auth brute-force attacks (HTTP 429)
    def test_auth_rate_limiting_throttles_excessive_attempts(self):
        from core.throttling import AuthRateThrottle
        original_rate = getattr(AuthRateThrottle, 'rate', None)
        AuthRateThrottle.rate = '3/minute'
        cache.clear()
        try:
            # 3 attempts should be allowed under 3/min limit
            for i in range(3):
                res = self.client.post('/api/auth/login/', {
                    'username': 'bruteforce_user',
                    'password': f'wrong_pass_{i}',
                }, format='json')
                self.assertIn(res.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED])

            # 4th attempt must be throttled with HTTP 429
            res_throttled = self.client.post('/api/auth/login/', {
                'username': 'bruteforce_user',
                'password': 'wrong_pass_4',
            }, format='json')
            self.assertEqual(res_throttled.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
            self.assertIn('detail', res_throttled.data)
            self.assertIn('throttled', str(res_throttled.data['detail']).lower())
        finally:
            AuthRateThrottle.rate = original_rate
            cache.clear()

    # 12. Normal telemetry cadence is not throttled under standard settings
    def test_normal_telemetry_cadence_succeeds(self):
        self.client.force_authenticate(user=self.driver1)
        for i in range(5):
            res = self.client.post('/api/locations/location/update/', {
                'latitude': round(23.8100 + (i * 0.001), 6),
                'longitude': round(90.4100 + (i * 0.001), 6),
                'speed': 10.0,
                'heading': 90.0,
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertEqual(res.data['status'], 'success')
