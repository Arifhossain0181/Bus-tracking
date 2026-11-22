from decimal import Decimal
from unittest.mock import patch, MagicMock
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

import requests

from accounts.models import User
from schedules.models import Route, RouteRevision
from schedules.routing.contracts import (
    RoutingRequest,
    RoutingResult,
    RoutingValidationError,
    RoutingProviderError,
)
from schedules.routing.providers import (
    ValhallaRoutingProvider,
    decode_polyline6,
    calculate_haversine_distance_m,
    get_routing_provider,
)
from schedules.routing.service import generate_route_geometry


class Polyline6DecoderTests(TestCase):
    """Unit tests for Polyline6 coordinate decoding."""

    def test_decode_single_point(self):
        # Coordinates: 23.810300, 90.412500
        # In polyline6: 23810300, 90412500
        encoded = "wngll@g|imkD"
        points = decode_polyline6(encoded)
        self.assertEqual(len(points), 1)
        self.assertAlmostEqual(points[0][0], 23.8103, places=4)
        self.assertAlmostEqual(points[0][1], 90.4125, places=4)

    def test_decode_empty_string(self):
        self.assertEqual(decode_polyline6(""), [])

    def test_haversine_distance_calculation(self):
        # Dhaka (23.8103, 90.4125) to Chittagong (22.3569, 91.7832) is ~210 km
        dist_m = calculate_haversine_distance_m(23.8103, 90.4125, 22.3569, 91.7832)
        dist_km = dist_m / 1000.0
        self.assertTrue(200.0 < dist_km < 225.0)


class RoutingContractUnitTests(TestCase):
    """Unit tests for RoutingRequest validation rules."""

    def test_valid_request_normalizes_coordinates(self):
        req = RoutingRequest(
            waypoints=[(23.8103000, 90.4125000), (23.8200000, 90.4200000)],
            profile="bus",
        )
        self.assertEqual(len(req.waypoints), 2)
        self.assertEqual(req.waypoints[0], (23.8103, 90.4125))
        self.assertEqual(req.waypoints[1], (23.82, 90.42))

    def test_insufficient_waypoints_rejected(self):
        with self.assertRaises(RoutingValidationError) as cm:
            RoutingRequest(waypoints=[(23.81, 90.41)])
        self.assertIn("At least 2 waypoints", str(cm.exception))

        with self.assertRaises(RoutingValidationError):
            RoutingRequest(waypoints=[])

    def test_excessive_waypoints_rejected(self):
        excessive = [(23.81 + (i * 0.001), 90.41 + (i * 0.001)) for i in range(55)]
        with self.assertRaises(RoutingValidationError) as cm:
            RoutingRequest(waypoints=excessive)
        self.assertIn("Maximum permitted waypoints", str(cm.exception))

    def test_invalid_coordinate_ranges_rejected(self):
        # Lat > 90
        with self.assertRaises(RoutingValidationError) as cm:
            RoutingRequest(waypoints=[(95.0, 90.0), (23.8, 90.4)])
        self.assertIn("latitude 95.0 is out of bounds", str(cm.exception))

        # Lng > 180
        with self.assertRaises(RoutingValidationError) as cm:
            RoutingRequest(waypoints=[(23.8, 190.0), (23.8, 90.4)])
        self.assertIn("longitude 190.0 is out of bounds", str(cm.exception))

    def test_non_numeric_and_nan_coordinates_rejected(self):
        with self.assertRaises(RoutingValidationError):
            RoutingRequest(waypoints=[(float('nan'), 90.4), (23.8, 90.4)])

        with self.assertRaises(RoutingValidationError):
            # @ts-expect-error test non-numeric
            RoutingRequest(waypoints=[("invalid", 90.4), (23.8, 90.4)])

    def test_all_identical_waypoints_rejected(self):
        with self.assertRaises(RoutingValidationError) as cm:
            RoutingRequest(waypoints=[(23.8103, 90.4125), (23.8103, 90.4125)])
        self.assertIn("All waypoints are identical", str(cm.exception))

    def test_unsupported_profile_rejected(self):
        with self.assertRaises(RoutingValidationError) as cm:
            RoutingRequest(
                waypoints=[(23.81, 90.41), (23.82, 90.42)],
                profile="airplane",
            )
        self.assertIn("Unsupported routing profile", str(cm.exception))


class ValhallaProviderUnitTests(TestCase):
    """Unit tests for the Valhalla routing provider adapter."""

    def setUp(self):
        self.provider = ValhallaRoutingProvider(base_url="http://test-valhalla:8002", timeout=5.0)

    @patch("requests.post")
    def test_successful_valhalla_routing(self, mock_post):
        # Mock successful Valhalla response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "trip": {
                "status": 0,
                "summary": {
                    "length": 14.852,
                    "time": 2280.0,
                },
                "legs": [
                    {
                        # Mock pre-formatted coordinates
                        "coordinates": [
                            [90.4125, 23.8103],
                            [90.4150, 23.8130],
                            [90.4200, 23.8200],
                        ]
                    }
                ],
                "locations": [
                    {"lat": 23.81031, "lon": 90.41251},
                    {"lat": 23.82001, "lon": 90.42001},
                ],
            }
        }
        mock_post.return_value = mock_response

        request = RoutingRequest(
            waypoints=[(23.8103, 90.4125), (23.8200, 90.4200)],
            profile="bus",
        )

        result = self.provider.route(request)

        self.assertIsInstance(result, RoutingResult)
        self.assertEqual(result.provider, "valhalla")
        self.assertEqual(result.distance_km, Decimal("14.85"))
        self.assertEqual(result.duration_mins, 38)
        self.assertEqual(result.geometry["type"], "LineString")
        self.assertEqual(len(result.geometry["coordinates"]), 3)
        self.assertEqual(result.coordinate_count, 3)
        self.assertEqual(len(result.waypoints_snapped), 2)
        self.assertEqual(result.metadata["routing_engine"], "valhalla")

    @patch("requests.post")
    def test_valhalla_multi_leg_coordinate_stitching(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "trip": {
                "summary": {"length": 10.0, "time": 1200.0},
                "legs": [
                    {"coordinates": [[90.41, 23.81], [90.42, 23.82]]},
                    {"coordinates": [[90.42, 23.82], [90.43, 23.83]]},  # Overlaps at [90.42, 23.82]
                ],
                "locations": [{"lat": 23.81, "lon": 90.41}, {"lat": 23.82, "lon": 90.42}, {"lat": 23.83, "lon": 90.43}],
            }
        }
        mock_post.return_value = mock_response

        request = RoutingRequest(waypoints=[(23.81, 90.41), (23.82, 90.42), (23.83, 90.43)])
        result = self.provider.route(request)

        # Ensure stitched coordinates deduplicate the boundary point
        self.assertEqual(len(result.geometry["coordinates"]), 3)
        self.assertEqual(result.geometry["coordinates"][1], [90.42, 23.82])

    @patch("requests.post")
    def test_valhalla_timeout_handling(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout("Connection timed out")

        request = RoutingRequest(waypoints=[(23.81, 90.41), (23.82, 90.42)])
        with self.assertRaises(RoutingProviderError) as cm:
            self.provider.route(request)

        self.assertEqual(cm.exception.status_code, 504)
        self.assertIn("timed out", str(cm.exception))

    @patch("requests.post")
    def test_valhalla_connection_error_handling(self, mock_post):
        mock_post.side_effect = requests.exceptions.ConnectionError("Connection refused")

        request = RoutingRequest(waypoints=[(23.81, 90.41), (23.82, 90.42)])
        with self.assertRaises(RoutingProviderError) as cm:
            self.provider.route(request)

        self.assertEqual(cm.exception.status_code, 503)
        self.assertIn("Could not connect", str(cm.exception))

    @patch("requests.post")
    def test_valhalla_unroutable_path_handling(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "error_code": 171,
            "error": "No path could be found for input",
        }
        mock_post.return_value = mock_response

        request = RoutingRequest(waypoints=[(23.81, 90.41), (23.82, 90.42)])
        with self.assertRaises(RoutingProviderError) as cm:
            self.provider.route(request)

        self.assertEqual(cm.exception.status_code, 422)
        self.assertIn("No drivable road path could be found", str(cm.exception))

    @patch("requests.post")
    def test_valhalla_malformed_response_handling(self, mock_post):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"unexpected_key": 123}
        mock_post.return_value = mock_response

        request = RoutingRequest(waypoints=[(23.81, 90.41), (23.82, 90.42)])
        with self.assertRaises(RoutingProviderError) as cm:
            self.provider.route(request)

        self.assertEqual(cm.exception.status_code, 502)
        self.assertIn("missing 'trip' object", str(cm.exception))


class RoutingServiceUnitTests(TestCase):
    """Unit tests for generate_route_geometry service function and caching."""

    def setUp(self):
        cache.clear()

    def test_service_caching_behavior(self):
        mock_provider = MagicMock()
        mock_provider.base_url = "http://mock-valhalla"
        mock_result = RoutingResult(
            geometry={"type": "LineString", "coordinates": [[90.41, 23.81], [90.42, 23.82]]},
            distance_km=Decimal("2.50"),
            duration_mins=6,
            coordinate_count=2,
            waypoints_snapped=[],
            provider="valhalla",
        )
        mock_provider.route.return_value = mock_result

        wps = [(23.81, 90.41), (23.82, 90.42)]

        # First invocation calls provider
        res1 = generate_route_geometry(waypoints=wps, provider=mock_provider)
        self.assertEqual(mock_provider.route.call_count, 1)
        self.assertEqual(res1.distance_km, Decimal("2.50"))

        # Second identical invocation hits cache
        res2 = generate_route_geometry(waypoints=wps, provider=mock_provider)
        self.assertEqual(mock_provider.route.call_count, 1)  # Still 1, served from cache!
        self.assertEqual(res2.distance_km, Decimal("2.50"))

        # Bypassing cache executes query
        res3 = generate_route_geometry(waypoints=wps, provider=mock_provider, no_cache=True)
        self.assertEqual(mock_provider.route.call_count, 2)
        self.assertEqual(res3.distance_km, Decimal("2.50"))


class RouteGenerateGeometryApiTests(TestCase):
    """Integration tests for POST /api/schedules/routes/<id>/generate-geometry/."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username='admin_user',
            email='admin@example.com',
            password='Password123!',
            role='admin',
            approval_status='approved'
        )
        self.authority = User.objects.create_user(
            username='authority_user',
            email='authority@example.com',
            password='Password123!',
            role='authority',
            approval_status='approved'
        )
        self.student = User.objects.create_user(
            username='student_user',
            email='student@example.com',
            password='Password123!',
            role='student',
            approval_status='approved'
        )
        self.driver = User.objects.create_user(
            username='driver_user',
            email='driver@example.com',
            password='Password123!',
            role='driver',
            approval_status='approved'
        )

        self.route = Route.objects.create(
            name="Campus Express",
            route_type="shuttle",
            is_active=True,
            is_published=False,
            color="#2563eb",
        )

    @patch("requests.post")
    def test_admin_can_generate_route_geometry(self, mock_post):
        self.client.force_authenticate(user=self.admin)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "trip": {
                "summary": {"length": 5.4, "time": 720.0},
                "legs": [
                    {"coordinates": [[90.4125, 23.8103], [90.4200, 23.8200]]}
                ],
                "locations": [{"lat": 23.8103, "lon": 90.4125}, {"lat": 23.8200, "lon": 90.4200}],
            }
        }
        mock_post.return_value = mock_response

        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"
        payload = {
            "waypoints": [
                {"lat": 23.8103, "lng": 90.4125},
                {"lat": 23.8200, "lng": 90.4200},
            ],
            "profile": "bus",
        }

        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.data

        self.assertEqual(data["route_id"], self.route.id)
        self.assertEqual(data["distance_km"], 5.4)
        self.assertEqual(data["duration_mins"], 12)
        self.assertEqual(data["geometry"]["type"], "LineString")
        self.assertEqual(len(data["geometry"]["coordinates"]), 2)
        self.assertEqual(data["provider"], "valhalla")

    @patch("requests.post")
    def test_authority_can_generate_route_geometry(self, mock_post):
        self.client.force_authenticate(user=self.authority)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "trip": {
                "summary": {"length": 3.0, "time": 300.0},
                "legs": [{"coordinates": [[90.41, 23.81], [90.42, 23.82]]}],
                "locations": [{"lat": 23.81, "lon": 90.41}, {"lat": 23.82, "lon": 90.42}],
            }
        }
        mock_post.return_value = mock_response

        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"
        payload = {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}

        resp = self.client.post(url, payload, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_regular_user_is_forbidden(self):
        self.client.force_authenticate(user=self.student)
        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"
        resp = self.client.post(url, {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_driver_is_forbidden(self):
        self.client.force_authenticate(user=self.driver)
        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"
        resp = self.client.post(url, {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_user_is_unauthorized(self):
        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"
        resp = self.client.post(url, {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_nonexistent_route_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        url = "/api/schedules/routes/999999/generate-geometry/"
        resp = self.client.post(url, {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_waypoints_payload_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"

        # Insufficient waypoints
        resp = self.client.post(url, {"waypoints": [[23.81, 90.41]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("At least 2 waypoints", resp.data["error"])

        # Non-array waypoints
        resp = self.client.post(url, {"waypoints": "invalid"}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("requests.post")
    def test_provider_failure_returns_clean_error(self, mock_post):
        self.client.force_authenticate(user=self.admin)

        mock_post.side_effect = requests.exceptions.ConnectionError("Connection refused")
        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"

        resp = self.client.post(url, {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(resp.data["provider"], "valhalla")
        self.assertIn("Could not connect", resp.data["error"])

    @patch("requests.post")
    def test_preview_endpoint_does_not_mutate_route_or_create_revision(self, mock_post):
        """CRITICAL: Ensure preview endpoint leaves Route and RouteRevision completely unchanged."""
        self.client.force_authenticate(user=self.admin)

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "trip": {
                "summary": {"length": 8.0, "time": 900.0},
                "legs": [{"coordinates": [[90.41, 23.81], [90.42, 23.82]]}],
                "locations": [{"lat": 23.81, "lon": 90.41}, {"lat": 23.82, "lon": 90.42}],
            }
        }
        mock_post.return_value = mock_response

        # Snapshot initial state
        initial_route = Route.objects.get(pk=self.route.id)
        initial_revision_count = RouteRevision.objects.filter(route=self.route).count()
        initial_active_rev = initial_route.active_revision

        url = f"/api/schedules/routes/{self.route.id}/generate-geometry/"
        resp = self.client.post(url, {"waypoints": [[23.81, 90.41], [23.82, 90.42]]}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Refresh route and verify state has NOT changed
        refreshed_route = Route.objects.get(pk=self.route.id)
        after_revision_count = RouteRevision.objects.filter(route=self.route).count()

        self.assertEqual(after_revision_count, initial_revision_count)
        self.assertEqual(refreshed_route.active_revision, initial_active_rev)
        self.assertEqual(refreshed_route.is_published, initial_route.is_published)
        self.assertEqual(refreshed_route.total_distance_km, initial_route.total_distance_km)
