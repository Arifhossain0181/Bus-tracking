import math
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from buses.models import Bus, BusAssignment, Journey
from schedules.models import Route, RouteRevision, Stop
from schedules.geometry import validate_geojson_linestring, calculate_linestring_distance_km


class RouteGeometryContractTests(TestCase):
    """Phase 7.1: Comprehensive unit tests for GeoJSON LineString geometry validation."""

    def test_valid_linestring_passes(self):
        geom = {
            "type": "LineString",
            "coordinates": [
                [90.4125, 23.8103],
                [90.4150, 23.8120],
                [90.4200, 23.8150]
            ]
        }
        is_valid, err = validate_geojson_linestring(geom)
        self.assertTrue(is_valid)
        self.assertIsNone(err)

    def test_coordinate_order_contract_bounds(self):
        # Longitude in [-180, 180], Latitude in [-90, 90]
        # Valid edge coordinates: [lng, lat]
        geom = {
            "type": "LineString",
            "coordinates": [
                [-180.0, -90.0],
                [180.0, 90.0]
            ]
        }
        is_valid, err = validate_geojson_linestring(geom)
        self.assertTrue(is_valid)

    def test_invalid_geometry_type_rejected(self):
        for bad_type in ["Point", "Polygon", "MultiLineString", "Feature", ""]:
            geom = {
                "type": bad_type,
                "coordinates": [[90.41, 23.81], [90.42, 23.82]]
            }
            is_valid, err = validate_geojson_linestring(geom)
            self.assertFalse(is_valid)
            self.assertIn("Unsupported geometry type", err if err else "")

    def test_missing_or_non_dict_geometry_rejected(self):
        for bad_geom in [None, [], "LineString", 123]:
            is_valid, err = validate_geojson_linestring(bad_geom)
            self.assertFalse(is_valid)
            self.assertIn("Geometry must be a JSON object", err if err else "")

    def test_missing_coordinates_or_type_rejected(self):
        geom_no_coords = {"type": "LineString"}
        is_valid, err = validate_geojson_linestring(geom_no_coords)
        self.assertFalse(is_valid)
        self.assertIn("missing required 'coordinates' field", err)

        geom_no_type = {"coordinates": [[90.41, 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_no_type)
        self.assertFalse(is_valid)
        self.assertIn("missing required 'type' field", err)

    def test_too_few_coordinates_rejected(self):
        # Empty coordinates array
        is_valid, err = validate_geojson_linestring({"type": "LineString", "coordinates": []})
        self.assertFalse(is_valid)
        self.assertIn("at least 2 points", err)

        # Single point LineString
        is_valid, err = validate_geojson_linestring({"type": "LineString", "coordinates": [[90.41, 23.81]]})
        self.assertFalse(is_valid)
        self.assertIn("at least 2 points", err)

    def test_malformed_nested_coordinate_arrays_rejected(self):
        # 1D array instead of 2D
        geom_1d = {"type": "LineString", "coordinates": [90.41, 23.81]}
        is_valid, err = validate_geojson_linestring(geom_1d)
        self.assertFalse(is_valid)
        self.assertIn("must be a 2-element array", err)

        # 3-element coordinate
        geom_3d = {"type": "LineString", "coordinates": [[90.41, 23.81, 10.0], [90.42, 23.82, 10.0]]}
        is_valid, err = validate_geojson_linestring(geom_3d)
        self.assertFalse(is_valid)
        self.assertIn("invalid length 3", err)

        # 1-element coordinate
        geom_single = {"type": "LineString", "coordinates": [[90.41], [90.42]]}
        is_valid, err = validate_geojson_linestring(geom_single)
        self.assertFalse(is_valid)
        self.assertIn("invalid length 1", err)

    def test_out_of_range_coordinates_rejected(self):
        # Longitude > 180
        geom_bad_lng = {"type": "LineString", "coordinates": [[180.1, 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_bad_lng)
        self.assertFalse(is_valid)
        self.assertIn("Longitude at index 0 (180.1) out of bounds", err)

        # Longitude < -180
        geom_bad_lng_neg = {"type": "LineString", "coordinates": [[-185.0, 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_bad_lng_neg)
        self.assertFalse(is_valid)
        self.assertIn("out of bounds", err)

        # Latitude > 90
        geom_bad_lat = {"type": "LineString", "coordinates": [[90.41, 95.0], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_bad_lat)
        self.assertFalse(is_valid)
        self.assertIn("Latitude at index 0 (95.0) out of bounds", err)

        # Latitude < -90
        geom_bad_lat_neg = {"type": "LineString", "coordinates": [[90.41, -95.0], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_bad_lat_neg)
        self.assertFalse(is_valid)
        self.assertIn("out of bounds", err)

    def test_non_numeric_and_boolean_coordinates_rejected(self):
        # String inside coordinate
        geom_str = {"type": "LineString", "coordinates": [["90.41", 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_str)
        self.assertFalse(is_valid)
        self.assertIn("must be a numeric value", err)

        # Boolean inside coordinate (Python bool is subclass of int)
        geom_bool = {"type": "LineString", "coordinates": [[True, 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_bool)
        self.assertFalse(is_valid)
        self.assertIn("must be a numeric value", err)

        # None inside coordinate
        geom_none = {"type": "LineString", "coordinates": [[None, 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_none)
        self.assertFalse(is_valid)
        self.assertIn("must be a numeric value", err)

    def test_nan_and_infinity_rejected(self):
        geom_nan = {"type": "LineString", "coordinates": [[float('nan'), 23.81], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_nan)
        self.assertFalse(is_valid)
        self.assertIn("cannot be NaN or Infinity", err)

        geom_inf = {"type": "LineString", "coordinates": [[90.41, float('inf')], [90.42, 23.82]]}
        is_valid, err = validate_geojson_linestring(geom_inf)
        self.assertFalse(is_valid)
        self.assertIn("cannot be NaN or Infinity", err)

    def test_excessively_large_payload_rejected(self):
        # Generate 10005 points
        huge_coords = [[90.0 + (i * 0.0001), 20.0 + (i * 0.0001)] for i in range(10005)]
        geom = {"type": "LineString", "coordinates": huge_coords}
        is_valid, err = validate_geojson_linestring(geom, max_coordinates=10000)
        self.assertFalse(is_valid)
        self.assertIn("exceeds maximum permitted coordinate count of 10000", err)

    def test_degenerate_identical_coordinates_rejected(self):
        # LineString with identical points (0 distance)
        geom = {
            "type": "LineString",
            "coordinates": [
                [90.4125, 23.8103],
                [90.4125, 23.8103],
                [90.4125, 23.8103]
            ]
        }
        is_valid, err = validate_geojson_linestring(geom)
        self.assertFalse(is_valid)
        self.assertIn("Degenerate geometry: LineString must contain at least two distinct points", err)

    def test_calculate_linestring_distance_km(self):
        coords = [
            [90.4125, 23.8103],  # Point A
            [90.4200, 23.8200]   # Point B (~1.32 km away)
        ]
        dist = calculate_linestring_distance_km(coords)
        self.assertGreater(dist, 1.0)
        self.assertLess(dist, 2.0)

        # Empty / single point
        self.assertEqual(calculate_linestring_distance_km([]), 0.0)
        self.assertEqual(calculate_linestring_distance_km([[90.41, 23.81]]), 0.0)


class RouteRevisionLifecycleTests(TestCase):
    """Phase 7.2: Route revision lifecycle, immutability, and publishing behavior."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_test',
            email='admin@ubus.edu',
            password='Password123!',
            university_id='ADM-001'
        )
        self.route = Route.objects.create(
            name='Campus Shuttle 01',
            route_type='shuttle',
            color='#ffc107',
            is_active=True,
            is_published=False
        )
        self.valid_geometry = {
            "type": "LineString",
            "coordinates": [
                [90.4125, 23.8103],
                [90.4150, 23.8120],
                [90.4200, 23.8150]
            ]
        }

    def test_create_draft_revision(self):
        rev = RouteRevision.objects.create(
            route=self.route,
            status=RouteRevision.STATUS_DRAFT,
            geometry=self.valid_geometry,
            distance_km=Decimal('2.45'),
            duration_mins=8,
            change_summary='Initial draft route geometry',
            created_by=self.admin
        )
        self.assertEqual(rev.revision_number, 1)
        self.assertEqual(rev.status, RouteRevision.STATUS_DRAFT)
        self.assertIsNone(self.route.active_revision)

    def test_edit_draft_geometry_succeeds(self):
        rev = RouteRevision.objects.create(
            route=self.route,
            status=RouteRevision.STATUS_DRAFT,
            geometry=self.valid_geometry,
            created_by=self.admin
        )
        updated_geom = {
            "type": "LineString",
            "coordinates": [
                [90.4125, 23.8103],
                [90.4300, 23.8300]
            ]
        }
        rev.geometry = updated_geom
        rev.distance_km = Decimal('3.10')
        rev.save()

        rev.refresh_from_db()
        self.assertEqual(rev.geometry, updated_geom)
        self.assertEqual(rev.distance_km, Decimal('3.10'))

    def test_publish_revision_sets_active_and_archives_previous(self):
        # Create Rev 1 and publish it
        rev1 = RouteRevision.objects.create(
            route=self.route,
            geometry=self.valid_geometry,
            distance_km=Decimal('2.45'),
            duration_mins=8,
            created_by=self.admin
        )
        self.route.publish_revision(rev1, user=self.admin)

        self.route.refresh_from_db()
        rev1.refresh_from_db()
        self.assertEqual(rev1.status, RouteRevision.STATUS_PUBLISHED)
        self.assertEqual(self.route.active_revision, rev1)
        self.assertTrue(self.route.is_published)
        self.assertEqual(self.route.total_distance_km, Decimal('2.45'))
        self.assertEqual(self.route.estimated_duration_mins, 8)

        # Create Rev 2 draft
        rev2_geom = {
            "type": "LineString",
            "coordinates": [
                [90.4125, 23.8103],
                [90.4160, 23.8140],
                [90.4250, 23.8180]
            ]
        }
        rev2 = RouteRevision.objects.create(
            route=self.route,
            geometry=rev2_geom,
            distance_km=Decimal('3.20'),
            duration_mins=10,
            created_by=self.admin
        )
        self.assertEqual(rev2.revision_number, 2)
        self.assertEqual(rev2.status, RouteRevision.STATUS_DRAFT)

        # Publish Rev 2
        self.route.publish_revision(rev2, user=self.admin)
        self.route.refresh_from_db()
        rev1.refresh_from_db()
        rev2.refresh_from_db()

        # Rev 1 should now be archived, Rev 2 published and active
        self.assertEqual(rev1.status, RouteRevision.STATUS_ARCHIVED)
        self.assertEqual(rev2.status, RouteRevision.STATUS_PUBLISHED)
        self.assertEqual(self.route.active_revision, rev2)
        self.assertEqual(self.route.total_distance_km, Decimal('3.20'))
        self.assertEqual(self.route.estimated_duration_mins, 10)

    def test_published_revision_is_immutable(self):
        from django.core.exceptions import ValidationError

        rev = RouteRevision.objects.create(
            route=self.route,
            geometry=self.valid_geometry,
            created_by=self.admin
        )
        self.route.publish_revision(rev, user=self.admin)

        # Attempt to mutate published revision geometry
        rev.geometry = {
            "type": "LineString",
            "coordinates": [[90.1, 23.1], [90.2, 23.2]]
        }
        with self.assertRaises(ValidationError) as ctx:
            rev.save()
        self.assertIn("Published or archived route revisions are immutable", str(ctx.exception))

    def test_publish_revision_without_geometry_fails(self):
        from django.core.exceptions import ValidationError

        rev_no_geom = RouteRevision.objects.create(
            route=self.route,
            geometry=None,
            created_by=self.admin
        )
        with self.assertRaises(ValidationError) as ctx:
            self.route.publish_revision(rev_no_geom, user=self.admin)
        self.assertIn("Cannot publish a route revision without valid geometry", str(ctx.exception))


class JourneyRouteRevisionIntegrityTests(TestCase):
    """Phase 7.3: Journey binding, route publishing isolation, and legacy compatibility."""

    def setUp(self):
        self.driver = User.objects.create_user(
            username='driver_shuttle',
            password='Password123!',
            role='driver',
            university_id='DRV-001'
        )
        self.bus = Bus.objects.create(
            bus_number='UBUS-101',
            license_plate='DHK-1234',
            bus_type='shuttle'
        )
        self.route = Route.objects.create(
            name='Dhanmondi Shuttle',
            route_type='shuttle',
            is_active=True,
            is_published=True
        )
        self.assignment = BusAssignment.objects.create(
            bus=self.bus,
            driver=self.driver,
            route=self.route,
            is_active=True
        )
        self.valid_geom_v1 = {
            "type": "LineString",
            "coordinates": [[90.41, 23.81], [90.42, 23.82]]
        }
        self.valid_geom_v2 = {
            "type": "LineString",
            "coordinates": [[90.41, 23.81], [90.45, 23.85]]
        }

    def test_legacy_journey_without_revision_supported(self):
        # Journey created with null route_revision
        journey = Journey.objects.create(
            driver=self.driver,
            bus=self.bus,
            route=self.route,
            route_revision=None,
            status='completed',
            start_time=timezone.now()
        )
        self.assertIsNone(journey.route_revision)
        self.assertEqual(journey.route, self.route)

    def test_new_journey_binds_to_active_published_revision(self):
        # Publish Rev 1
        rev1 = RouteRevision.objects.create(
            route=self.route,
            geometry=self.valid_geom_v1,
            distance_km=Decimal('2.50')
        )
        self.route.publish_revision(rev1)

        # Driver starts journey via API
        client = APIClient()
        client.force_authenticate(user=self.driver)
        res = client.post('/api/locations/journey/start/', {
            'latitude': 23.8103,
            'longitude': 90.4125
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        journey = Journey.objects.get(id=res.data['journey_id'])
        self.assertEqual(journey.route_revision, rev1)
        self.assertEqual(journey.route, self.route)

    def test_publishing_new_route_revision_does_not_mutate_existing_journey(self):
        # Rev 1 published
        rev1 = RouteRevision.objects.create(
            route=self.route,
            geometry=self.valid_geom_v1,
            distance_km=Decimal('2.50')
        )
        self.route.publish_revision(rev1)

        # Journey 1 created under Rev 1
        j1 = Journey.objects.create(
            driver=self.driver,
            bus=self.bus,
            route=self.route,
            route_revision=self.route.active_revision,
            status='completed',
            start_time=timezone.now()
        )
        self.assertEqual(j1.route_revision, rev1)

        # Later, Rev 2 is created and published
        rev2 = RouteRevision.objects.create(
            route=self.route,
            geometry=self.valid_geom_v2,
            distance_km=Decimal('4.50')
        )
        self.route.publish_revision(rev2)

        # Confirm j1 STILL points to Rev 1!
        j1.refresh_from_db()
        self.assertEqual(j1.route_revision, rev1)
        self.assertEqual(j1.route_revision.revision_number, 1)
        self.assertEqual(self.route.active_revision, rev2)

        # New Journey 2 gets Rev 2
        j2 = Journey.objects.create(
            driver=self.driver,
            bus=self.bus,
            route=self.route,
            route_revision=self.route.active_revision,
            status='active',
            start_time=timezone.now()
        )
        self.assertEqual(j2.route_revision, rev2)
        self.assertEqual(j2.route_revision.revision_number, 2)


class RouteRevisionAPITests(TestCase):
    """Phase 7.4: REST API compatibility, permissions, and serialization."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='admin_api',
            password='Password123!',
            university_id='ADM-002'
        )
        self.student = User.objects.create_user(
            username='student_api',
            password='Password123!',
            role='student',
            university_id='STU-001',
            approval_status='approved',
            is_active=True
        )
        self.route = Route.objects.create(
            name='Metro Line 01',
            route_type='metro',
            color='#0d6efd',
            is_active=True,
            is_published=False
        )
        self.stop1 = Stop.objects.create(route=self.route, name='Campus', latitude=23.8103, longitude=90.4125, order=1)
        self.stop2 = Stop.objects.create(route=self.route, name='Airport', latitude=23.8500, longitude=90.4000, order=2)
        self.valid_geometry = {
            "type": "LineString",
            "coordinates": [
                [90.4125, 23.8103],
                [90.4050, 23.8300],
                [90.4000, 23.8500]
            ]
        }

    def test_existing_route_list_and_detail_remain_compatible(self):
        client = APIClient()
        client.force_authenticate(user=self.student)

        # List routes
        res_list = client.get('/api/schedules/routes/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_list.data), 1)
        route_data = res_list.data[0]
        self.assertEqual(route_data['name'], 'Metro Line 01')
        self.assertIn('active_revision', route_data)
        self.assertIn('active_geometry', route_data)
        self.assertIn('revisions_count', route_data)
        self.assertIsNone(route_data['active_revision'])
        self.assertEqual(route_data['revisions_count'], 0)

        # Detail route
        res_detail = client.get(f'/api/schedules/routes/{self.route.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_detail.data['stops']), 2)

    def test_student_cannot_create_or_publish_revision(self):
        client = APIClient()
        client.force_authenticate(user=self.student)

        # Create revision attempt
        res_create = client.post(f'/api/schedules/routes/{self.route.id}/revisions/', {
            'geometry': self.valid_geometry
        }, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_403_FORBIDDEN)

        # Publish revision attempt
        res_pub = client.post(f'/api/schedules/routes/{self.route.id}/revisions/1/publish/')
        self.assertEqual(res_pub.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_create_draft_revision_via_api(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        res = client.post(f'/api/schedules/routes/{self.route.id}/revisions/', {
            'geometry': self.valid_geometry,
            'change_summary': 'Draft created via API'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['revision_number'], 1)
        self.assertEqual(res.data['status'], 'draft')
        self.assertEqual(res.data['change_summary'], 'Draft created via API')
        # Distance was automatically computed from geometry
        self.assertIsNotNone(res.data['distance_km'])

    def test_admin_publish_revision_via_api(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        # Create revision
        res_create = client.post(f'/api/schedules/routes/{self.route.id}/revisions/', {
            'geometry': self.valid_geometry,
            'duration_mins': 15
        }, format='json')
        rev_id = res_create.data['id']

        # Publish revision
        res_pub = client.post(f'/api/schedules/routes/{self.route.id}/revisions/{rev_id}/publish/')
        self.assertEqual(res_pub.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pub.data['status'], 'published')
        self.assertEqual(res_pub.data['revision']['status'], 'published')
        self.assertTrue(res_pub.data['route']['is_published'])
        self.assertEqual(res_pub.data['route']['active_revision']['id'], rev_id)

    def test_cannot_publish_empty_geometry_revision_via_api(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        res_create = client.post(f'/api/schedules/routes/{self.route.id}/revisions/', {
            'geometry': None,
            'change_summary': 'No geometry yet'
        }, format='json')
        rev_id = res_create.data['id']

        # Attempt to publish
        res_pub = client.post(f'/api/schedules/routes/{self.route.id}/revisions/{rev_id}/publish/')
        self.assertEqual(res_pub.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot publish revision without valid geometry', res_pub.data['error'])

    def test_cannot_modify_published_revision_via_api(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        res_create = client.post(f'/api/schedules/routes/{self.route.id}/revisions/', {
            'geometry': self.valid_geometry
        }, format='json')
        rev_id = res_create.data['id']
        client.post(f'/api/schedules/routes/{self.route.id}/revisions/{rev_id}/publish/')

        # Attempt to PATCH published revision
        res_patch = client.patch(f'/api/schedules/routes/{self.route.id}/revisions/{rev_id}/', {
            'change_summary': 'Illegal mutation'
        }, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot be modified', res_patch.data['error'])

        # Attempt to DELETE published revision
        res_del = client.delete(f'/api/schedules/routes/{self.route.id}/revisions/{rev_id}/')
        self.assertEqual(res_del.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Only draft revisions can be deleted', res_del.data['error'])

    def test_publish_route_api_with_revision_id(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)

        res_create = client.post(f'/api/schedules/routes/{self.route.id}/revisions/', {
            'geometry': self.valid_geometry
        }, format='json')
        rev_id = res_create.data['id']

        # Call existing route publish endpoint with revision_id
        res_pub = client.post(f'/api/schedules/routes/{self.route.id}/publish/', {
            'revision_id': rev_id
        }, format='json')
        self.assertEqual(res_pub.status_code, status.HTTP_200_OK)
        self.assertTrue(res_pub.data['is_published'])
        self.assertEqual(res_pub.data['active_revision']['id'], rev_id)
        self.assertEqual(res_pub.data['active_geometry'], self.valid_geometry)


class RouteRevisionHardeningAndIntegrityTests(TestCase):
    """Task 014.1: Integrity audit tests for immutability, ownership, and concurrency."""

    def setUp(self):
        from django.core.exceptions import ValidationError
        self.admin = User.objects.create_superuser(
            username='admin_harden',
            password='Password123!',
            university_id='ADM-003'
        )
        self.driver = User.objects.create_user(
            username='driver_harden',
            password='Password123!',
            role='driver',
            university_id='DRV-002'
        )
        self.bus = Bus.objects.create(
            bus_number='UBUS-202',
            license_plate='DHK-5678',
            bus_type='shuttle'
        )
        self.route1 = Route.objects.create(name='Route Alpha', route_type='shuttle', color='#111111')
        self.route2 = Route.objects.create(name='Route Beta', route_type='metro', color='#222222')
        self.stop1 = Stop.objects.create(route=self.route1, name='Alpha Stop 1', latitude=23.8100, longitude=90.4100, order=1)
        self.stop2 = Stop.objects.create(route=self.route1, name='Alpha Stop 2', latitude=23.8200, longitude=90.4200, order=2)

        self.valid_geom = {
            "type": "LineString",
            "coordinates": [[90.4100, 23.8100], [90.4200, 23.8200]]
        }

    def test_cannot_delete_published_or_archived_revision_at_model_level(self):
        from django.core.exceptions import ValidationError

        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)
        rev.refresh_from_db()

        # Model instance delete must raise ValidationError
        with self.assertRaises(ValidationError) as ctx:
            rev.delete()
        self.assertIn("Cannot delete a published route revision", str(ctx.exception))

        # Create rev2 and publish to archive rev1
        rev2 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev2)
        rev1_archived = RouteRevision.objects.get(pk=rev.pk)
        self.assertEqual(rev1_archived.status, RouteRevision.STATUS_ARCHIVED)

        with self.assertRaises(ValidationError) as ctx2:
            rev1_archived.delete()
        self.assertIn("Cannot delete a archived route revision", str(ctx2.exception))

    def test_cannot_reassign_route_on_published_revision(self):
        from django.core.exceptions import ValidationError

        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)

        rev.route = self.route2
        with self.assertRaises(ValidationError) as ctx:
            rev.save()
        self.assertIn("Published or archived route revisions are immutable", str(ctx.exception))

    def test_bulk_update_blocked_on_published_revisions(self):
        from django.core.exceptions import ValidationError

        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)

        # Attempt to bypass model save via bulk QuerySet.update
        with self.assertRaises(ValidationError) as ctx:
            RouteRevision.objects.filter(pk=rev.pk).update(geometry={"type": "LineString", "coordinates": [[90.0, 20.0], [90.1, 20.1]]})
        self.assertIn("immutable and cannot be modified via bulk update", str(ctx.exception))

    def test_bulk_delete_blocked_on_published_revisions(self):
        from django.core.exceptions import ValidationError

        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)

        with self.assertRaises(ValidationError) as ctx:
            RouteRevision.objects.filter(route=self.route1).delete()
        self.assertIn("Published or archived route revisions cannot be deleted", str(ctx.exception))

    def test_route_active_revision_must_belong_to_same_route(self):
        from django.core.exceptions import ValidationError

        rev_route2 = RouteRevision.objects.create(route=self.route2, geometry=self.valid_geom)
        self.route2.publish_revision(rev_route2)

        # Setting route1's active revision to a revision belonging to route2
        self.route1.active_revision = rev_route2
        with self.assertRaises(ValidationError) as ctx:
            self.route1.save()
        self.assertIn("The active revision must belong to this route", str(ctx.exception))

    def test_route_active_revision_cannot_be_draft_or_archived(self):
        from django.core.exceptions import ValidationError

        draft_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, status=RouteRevision.STATUS_DRAFT)
        self.route1.active_revision = draft_rev
        with self.assertRaises(ValidationError) as ctx:
            self.route1.save()
        self.assertIn("Only published revisions can be set as the active revision", str(ctx.exception))

    def test_idempotent_republishing_same_revision(self):
        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)

        # Publishing the already active revision again must be idempotent and succeed
        same_rev = self.route1.publish_revision(rev)
        self.assertEqual(same_rev.pk, rev.pk)
        self.assertEqual(self.route1.active_revision, rev)
        rev.refresh_from_db()
        self.assertEqual(rev.status, RouteRevision.STATUS_PUBLISHED)

    def test_republishing_archived_revision_rejected_in_model_and_api(self):
        from django.core.exceptions import ValidationError

        # Publish rev1, then rev2, archiving rev1
        rev1 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev1)

        rev2 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev2)
        rev1.refresh_from_db()
        self.assertEqual(rev1.status, RouteRevision.STATUS_ARCHIVED)

        # Model level rejection
        with self.assertRaises(ValidationError) as ctx:
            self.route1.publish_revision(rev1)
        self.assertIn("Archived route revisions cannot be re-published", str(ctx.exception))

        # API level rejection with HTTP 400
        client = APIClient()
        client.force_authenticate(user=self.admin)
        res = client.post(f'/api/schedules/routes/{self.route1.id}/revisions/{rev1.id}/publish/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Archived route revisions cannot be re-published", res.data['error'])

    def test_publishing_revision_snapshots_stops_into_metadata(self):
        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)
        rev.refresh_from_db()

        self.assertIn('stops_snapshot', rev.metadata)
        snapshot = rev.metadata['stops_snapshot']
        self.assertEqual(len(snapshot), 2)
        self.assertEqual(snapshot[0]['name'], 'Alpha Stop 1')
        self.assertEqual(snapshot[1]['name'], 'Alpha Stop 2')

    def test_journey_rejects_revision_from_different_route(self):
        from django.core.exceptions import ValidationError

        rev_b = RouteRevision.objects.create(route=self.route2, geometry=self.valid_geom)
        self.route2.publish_revision(rev_b)

        # Attempt to create journey for route1 with route2's revision
        journey = Journey(
            driver=self.driver,
            bus=self.bus,
            route=self.route1,
            route_revision=rev_b,
            status='active'
        )
        with self.assertRaises(ValidationError) as ctx:
            journey.save()
        self.assertIn("Route revision must belong to the same route as the journey", str(ctx.exception))

    def test_journey_rejects_draft_revision(self):
        from django.core.exceptions import ValidationError

        draft_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, status=RouteRevision.STATUS_DRAFT)

        journey = Journey(
            driver=self.driver,
            bus=self.bus,
            route=self.route1,
            route_revision=draft_rev,
            status='active'
        )
        with self.assertRaises(ValidationError) as ctx:
            journey.save()
        self.assertIn("New journeys can only be bound to an active published route revision", str(ctx.exception))

    def test_start_journey_does_not_bind_draft_revision(self):
        # Create assignment for driver on route1
        assignment = BusAssignment.objects.create(
            bus=self.bus,
            driver=self.driver,
            route=self.route1,
            is_active=True
        )

        # Route only has a draft revision, no active published revision
        draft_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, status=RouteRevision.STATUS_DRAFT)

        client = APIClient()
        client.force_authenticate(user=self.driver)
        res = client.post('/api/locations/journey/start/', {
            'latitude': 23.8100,
            'longitude': 90.4100
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        journey = Journey.objects.get(id=res.data['journey_id'])
        # Draft revision must NOT be attached to the journey
        self.assertIsNone(journey.route_revision)
        self.assertEqual(journey.route, self.route1)

    def test_django_admin_revision_delete_permission(self):
        from django.contrib.admin.sites import AdminSite
        from schedules.admin import RouteRevisionAdmin

        site = AdminSite()
        admin_obj = RouteRevisionAdmin(RouteRevision, site)

        draft_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, status=RouteRevision.STATUS_DRAFT)
        pub_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(pub_rev)

        self.assertTrue(admin_obj.has_delete_permission(request=None, obj=draft_rev))
        self.assertFalse(admin_obj.has_delete_permission(request=None, obj=pub_rev))

    def test_route_queryset_bulk_update_active_revision_validations(self):
        from django.core.exceptions import ValidationError
        draft_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, status=RouteRevision.STATUS_DRAFT)
        pub_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(pub_rev)

        route2_rev = RouteRevision.objects.create(route=self.route2, geometry=self.valid_geom)
        self.route2.publish_revision(route2_rev)

        # Cross-route revision via bulk update is rejected
        with self.assertRaises(ValidationError) as ctx:
            Route.objects.filter(id=self.route1.id).update(active_revision=route2_rev)
        self.assertIn("The active revision must belong to this route", str(ctx.exception))

        # Draft revision via bulk update is rejected
        with self.assertRaises(ValidationError) as ctx:
            Route.objects.filter(id=self.route1.id).update(active_revision=draft_rev)
        self.assertIn("Only published revisions can be set as the active revision", str(ctx.exception))

        # Valid published revision updates successfully
        rows = Route.objects.filter(id=self.route1.id).update(active_revision=pub_rev)
        self.assertEqual(rows, 1)

    def test_route_revision_bulk_update_blocked_on_published(self):
        from django.core.exceptions import ValidationError
        pub_rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(pub_rev)

        pub_rev.change_summary = "Malicious bypass"
        with self.assertRaises(ValidationError) as ctx:
            RouteRevision.objects.bulk_update([pub_rev], ['change_summary'])
        self.assertIn("Published or archived route revisions are immutable", str(ctx.exception))

    def test_journey_save_rejects_archived_revision_for_new_journey(self):
        from django.core.exceptions import ValidationError
        rev1 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev1)

        # Publish rev2 which archives rev1
        rev2 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev2)
        rev1.refresh_from_db()
        self.assertEqual(rev1.status, RouteRevision.STATUS_ARCHIVED)

        new_journey = Journey(
            driver=self.driver,
            bus=self.bus,
            route=self.route1,
            route_revision=rev1,
            status='active'
        )
        with self.assertRaises(ValidationError) as ctx:
            new_journey.save()
        self.assertIn("New journeys can only be bound to an active published route revision", str(ctx.exception))

    def test_journey_save_permits_update_on_existing_journey_with_archived_revision(self):
        rev1 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev1)

        journey = Journey.objects.create(
            driver=self.driver,
            bus=self.bus,
            route=self.route1,
            route_revision=rev1,
            status='active'
        )

        # Later, revision 2 is published, archiving revision 1
        rev2 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev2)
        rev1.refresh_from_db()
        self.assertEqual(rev1.status, RouteRevision.STATUS_ARCHIVED)

        # Existing journey can complete and save without being blocked by archived status
        journey.status = 'completed'
        journey.end_time = timezone.now()
        journey.save()
        journey.refresh_from_db()
        self.assertEqual(journey.status, 'completed')
        self.assertEqual(journey.route_revision, rev1)

    def test_deterministic_stops_snapshot_order(self):
        from schedules.models import Stop
        route3 = Route.objects.create(name='Route Gamma', route_type='shuttle')
        s1 = Stop.objects.create(route=route3, name="Alpha Stop", latitude=23.81, longitude=90.41, order=0, average_wait_time=3)
        s2 = Stop.objects.create(route=route3, name="Beta Stop", latitude=23.82, longitude=90.42, order=1, average_wait_time=5)
        s3 = Stop.objects.create(route=route3, name="Gamma Stop", latitude=23.83, longitude=90.43, order=2, average_wait_time=4)

        rev = RouteRevision.objects.create(route=route3, geometry=self.valid_geom)
        route3.publish_revision(rev)
        rev.refresh_from_db()

        snapshot = rev.metadata.get('stops_snapshot', [])
        self.assertEqual(len(snapshot), 3)
        self.assertEqual(snapshot[0]['id'], s1.id)
        self.assertEqual(snapshot[0]['order'], 0)
        self.assertEqual(snapshot[0]['average_wait_time'], 3)
        self.assertEqual(snapshot[1]['id'], s2.id)
        self.assertEqual(snapshot[1]['order'], 1)
        self.assertEqual(snapshot[1]['average_wait_time'], 5)
        self.assertEqual(snapshot[2]['id'], s3.id)
        self.assertEqual(snapshot[2]['order'], 2)
        self.assertEqual(snapshot[2]['average_wait_time'], 4)

    def test_active_published_revision_cannot_be_arbitrarily_archived_via_bulk_update(self):
        from django.core.exceptions import ValidationError
        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)
        self.assertEqual(self.route1.active_revision, rev)
        self.assertEqual(rev.status, RouteRevision.STATUS_PUBLISHED)

        # Bulk update attempting to archive active revision must fail
        with self.assertRaises(ValidationError) as ctx:
            RouteRevision.objects.filter(id=rev.id).update(status=RouteRevision.STATUS_ARCHIVED)
        self.assertIn("Published or archived route revisions are immutable and cannot be modified via bulk update", str(ctx.exception))

        # Invariant preserved
        self.route1.refresh_from_db()
        rev.refresh_from_db()
        self.assertEqual(self.route1.active_revision, rev)
        self.assertEqual(self.route1.active_revision.status, RouteRevision.STATUS_PUBLISHED)
        self.assertTrue(self.route1.is_published)

    def test_active_published_revision_cannot_be_archived_via_instance_save(self):
        from django.core.exceptions import ValidationError
        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev)
        self.assertEqual(self.route1.active_revision, rev)

        rev.status = RouteRevision.STATUS_ARCHIVED
        with self.assertRaises(ValidationError) as ctx:
            rev.save()
        self.assertIn("An active route revision cannot be archived while it is set as the active revision of a route", str(ctx.exception))

        # Invariant preserved
        self.route1.refresh_from_db()
        self.assertEqual(self.route1.active_revision.status, RouteRevision.STATUS_PUBLISHED)

    def test_publishing_new_revision_archives_previous_and_maintains_invariant(self):
        from decimal import Decimal
        # 1. Publish rev1
        rev1 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, distance_km=Decimal('3.50'), duration_mins=15)
        self.route1.publish_revision(rev1)
        self.assertEqual(self.route1.active_revision, rev1)
        self.assertEqual(self.route1.active_revision.status, RouteRevision.STATUS_PUBLISHED)
        self.assertEqual(self.route1.total_distance_km, Decimal('3.50'))
        self.assertEqual(self.route1.estimated_duration_mins, 15)

        # 2. Publish rev2
        geom2 = {"type": "LineString", "coordinates": [[90.41, 23.81], [90.43, 23.83]]}
        rev2 = RouteRevision.objects.create(route=self.route1, geometry=geom2, distance_km=Decimal('5.20'), duration_mins=22)
        published_rev2 = self.route1.publish_revision(rev2)

        # 3. Invariant checks
        self.route1.refresh_from_db()
        rev1.refresh_from_db()
        rev2.refresh_from_db()

        # The new active revision remains published and belongs to its Route
        self.assertEqual(self.route1.active_revision, rev2)
        self.assertEqual(self.route1.active_revision.status, RouteRevision.STATUS_PUBLISHED)
        self.assertEqual(self.route1.active_revision.route, self.route1)
        self.assertTrue(self.route1.is_published)
        self.assertEqual(self.route1.total_distance_km, Decimal('5.20'))
        self.assertEqual(self.route1.estimated_duration_mins, 22)

        # Previous revision is archived correctly
        self.assertEqual(rev1.status, RouteRevision.STATUS_ARCHIVED)

        # Route.active_revision NEVER points to an archived revision
        self.assertNotEqual(self.route1.active_revision, rev1)
        self.assertNotEqual(self.route1.active_revision.status, RouteRevision.STATUS_ARCHIVED)

    def test_republishing_active_revision_is_idempotent(self):
        from decimal import Decimal
        rev = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, distance_km=Decimal('3.50'), duration_mins=15)
        self.route1.publish_revision(rev)
        published_at_orig = rev.published_at

        # Call publish_revision again on same revision
        result = self.route1.publish_revision(rev)
        self.assertEqual(result.id, rev.id)
        self.assertEqual(result.status, RouteRevision.STATUS_PUBLISHED)

        self.route1.refresh_from_db()
        rev.refresh_from_db()
        self.assertEqual(self.route1.active_revision, rev)
        self.assertEqual(self.route1.active_revision.status, RouteRevision.STATUS_PUBLISHED)
        self.assertEqual(rev.published_at, published_at_orig)

    def test_draft_revision_cannot_be_bulk_promoted_to_published(self):
        from django.core.exceptions import ValidationError
        draft = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.assertEqual(draft.status, RouteRevision.STATUS_DRAFT)

        # 1. QuerySet.update(status='published') is blocked
        with self.assertRaises(ValidationError) as ctx:
            RouteRevision.objects.filter(id=draft.id).update(status=RouteRevision.STATUS_PUBLISHED)
        self.assertIn("Route revisions cannot be published via bulk update", str(ctx.exception))

        # 2. QuerySet.bulk_update([draft], ['status']) is blocked
        draft.status = RouteRevision.STATUS_PUBLISHED
        with self.assertRaises(ValidationError) as ctx2:
            RouteRevision.objects.bulk_update([draft], ['status'])
        self.assertIn("Route revisions cannot be published via bulk_update", str(ctx2.exception))

        # 3. Direct instance save() to published without controlled publishing is blocked
        with self.assertRaises(ValidationError) as ctx3:
            draft.save()
        self.assertIn("Route revisions cannot be directly published via save()", str(ctx3.exception))

        # 4. Direct creation in published status is blocked
        with self.assertRaises(ValidationError) as ctx4:
            RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, status=RouteRevision.STATUS_PUBLISHED)
        self.assertIn("Route revisions must be created as drafts", str(ctx4.exception))

        # Invariant preserved: Route was never published and has no active revision
        self.route1.refresh_from_db()
        self.assertIsNone(self.route1.active_revision)
        self.assertFalse(self.route1.is_published)

    def test_draft_revision_cannot_be_archived(self):
        from django.core.exceptions import ValidationError
        draft = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.assertEqual(draft.status, RouteRevision.STATUS_DRAFT)

        # 1. QuerySet.update(status='archived') is blocked
        with self.assertRaises(ValidationError) as ctx:
            RouteRevision.objects.filter(id=draft.id).update(status=RouteRevision.STATUS_ARCHIVED)
        self.assertIn("Route revisions cannot be archived via bulk update", str(ctx.exception))

        # 2. QuerySet.bulk_update([draft], ['status']) is blocked
        draft.status = RouteRevision.STATUS_ARCHIVED
        with self.assertRaises(ValidationError) as ctx2:
            RouteRevision.objects.bulk_update([draft], ['status'])
        self.assertIn("Route revisions cannot be archived via bulk_update", str(ctx2.exception))

        # 3. Direct instance save() to archived is blocked
        with self.assertRaises(ValidationError) as ctx3:
            draft.save()
        self.assertIn("Draft route revisions cannot be archived", str(ctx3.exception))

    def test_draft_revision_permits_bulk_update_of_non_status_fields(self):
        draft1 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, change_summary="Draft 1")
        draft2 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom, change_summary="Draft 2")

        # Non-status bulk update on drafts succeeds
        rows = RouteRevision.objects.filter(id__in=[draft1.id, draft2.id]).update(change_summary="Batch Updated")
        self.assertEqual(rows, 2)

        draft1.refresh_from_db()
        draft2.refresh_from_db()
        self.assertEqual(draft1.change_summary, "Batch Updated")
        self.assertEqual(draft2.change_summary, "Batch Updated")
        self.assertEqual(draft1.status, RouteRevision.STATUS_DRAFT)
        self.assertEqual(draft2.status, RouteRevision.STATUS_DRAFT)

    def test_archived_revision_permanently_immutable_to_status_changes(self):
        from django.core.exceptions import ValidationError
        rev1 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev1)

        rev2 = RouteRevision.objects.create(route=self.route1, geometry=self.valid_geom)
        self.route1.publish_revision(rev2)

        rev1.refresh_from_db()
        self.assertEqual(rev1.status, RouteRevision.STATUS_ARCHIVED)

        # Attempt to transition archived -> draft
        rev1.status = RouteRevision.STATUS_DRAFT
        with self.assertRaises(ValidationError) as ctx:
            rev1.save()
        self.assertIn("Archived route revisions are immutable", str(ctx.exception))

        # Attempt to transition archived -> published
        rev1.status = RouteRevision.STATUS_PUBLISHED
        with self.assertRaises(ValidationError) as ctx2:
            rev1.save()
        self.assertIn("Archived route revisions are immutable", str(ctx2.exception))





