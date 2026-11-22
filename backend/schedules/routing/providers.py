import logging
import math
import os
from abc import ABC, abstractmethod
from decimal import Decimal
from typing import List, Tuple, Dict, Any, Optional

import requests
from django.conf import settings

from schedules.geometry import validate_geojson_linestring
from .contracts import (
    RoutingRequest,
    RoutingResult,
    RoutingProviderError,
)

logger = logging.getLogger(__name__)


def decode_polyline6(encoded: str) -> List[Tuple[float, float]]:
    """
    Decodes an encoded polyline6 string into a list of (latitude, longitude) tuples.
    Polyline6 uses a scaling factor of 1e6 (standard for Valhalla and OSRM precision 6).
    """
    points: List[Tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0
    length = len(encoded)

    while index < length:
        # Decode Latitude delta
        shift = 0
        result = 0
        while True:
            if index >= length:
                break
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        # Decode Longitude delta
        shift = 0
        result = 0
        while True:
            if index >= length:
                break
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        points.append((lat / 1e6, lng / 1e6))

    return points


def calculate_haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in meters."""
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class RoutingProvider(ABC):
    """Abstract interface for road network routing providers."""

    @abstractmethod
    def route(self, request: RoutingRequest) -> RoutingResult:
        """Computes road geometry and transit metrics for the given request."""
        pass


class ValhallaRoutingProvider(RoutingProvider):
    """
    Valhalla Routing Engine adapter.
    
    Connects to a Valhalla HTTP service (self-hosted or local Docker)
    using the /route API with bus/transit costing.
    """

    def __init__(self, base_url: Optional[str] = None, timeout: Optional[float] = None):
        self.base_url = (
            base_url
            or getattr(settings, 'VALHALLA_URL', None)
            or os.getenv('VALHALLA_URL', 'http://localhost:8002')
        ).rstrip('/')
        self.timeout = (
            timeout
            if timeout is not None
            else getattr(settings, 'VALHALLA_TIMEOUT', None)
            or float(os.getenv('VALHALLA_TIMEOUT', '10.0'))
        )

    def route(self, request: RoutingRequest) -> RoutingResult:
        endpoint = f"{self.base_url}/route"

        # Map UBus profile to Valhalla costing
        costing = "bus" if request.profile in ("bus", "shuttle") else "auto"

        costing_options: Dict[str, Any] = {
            costing: {
                "u_turn_penalty": request.u_turn_penalty,
                "use_highways": 0.6,
                **(request.costing_options or {}),
            }
        }
        if request.avoid_tolls:
            costing_options[costing]["toll_booth_penalty"] = 500

        # Valhalla expects 'lon' (not 'lng') and ordered locations
        locations = [{"lat": wp[0], "lon": wp[1], "type": "break"} for wp in request.waypoints]

        payload = {
            "locations": locations,
            "costing": costing,
            "costing_options": costing_options,
            "directions_options": {
                "units": "kilometers",
            },
        }

        try:
            response = requests.post(
                endpoint,
                json=payload,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout:
            logger.warning("Valhalla routing engine timed out after %ss for %d waypoints", self.timeout, len(request.waypoints))
            raise RoutingProviderError(
                f"Valhalla routing engine timed out after {self.timeout}s.",
                provider="valhalla",
                status_code=504,
            )
        except requests.exceptions.ConnectionError as ce:
            logger.warning("Failed to connect to Valhalla at %s: %s", self.base_url, ce)
            raise RoutingProviderError(
                "Could not connect to Valhalla routing engine. Upstream service may be unavailable.",
                provider="valhalla",
                status_code=503,
            )
        except requests.exceptions.RequestException as re:
            logger.error("Valhalla request exception: %s", re)
            raise RoutingProviderError(
                f"Routing request error: {str(re)}",
                provider="valhalla",
                status_code=502,
            )

        return self._parse_valhalla_response(response, request, costing)

    def _parse_valhalla_response(self, response: requests.Response, request: RoutingRequest, costing: str) -> RoutingResult:
        status_code = response.status_code

        try:
            data = response.json()
        except Exception:
            raise RoutingProviderError(
                f"Valhalla returned non-JSON response (HTTP {status_code}).",
                provider="valhalla",
                status_code=status_code,
            )

        if status_code != 200:
            error_code = data.get("error_code")
            error_msg = data.get("error") or data.get("message") or f"HTTP {status_code}"

            # Valhalla specific error codes for unroutable paths
            # 170: No suitable edges near location
            # 171: No path could be found between locations
            # 154: Path distance exceeds limit
            if error_code in (170, 171) or "No path" in str(error_msg):
                raise RoutingProviderError(
                    f"No drivable road path could be found between the specified waypoints: {error_msg}",
                    provider="valhalla",
                    status_code=422,
                    details={"error_code": error_code, "raw_error": error_msg},
                )

            raise RoutingProviderError(
                f"Valhalla routing engine returned error: {error_msg}",
                provider="valhalla",
                status_code=status_code,
                details={"error_code": error_code, "raw_error": error_msg},
            )

        trip = data.get("trip")
        if not trip or not isinstance(trip, dict):
            raise RoutingProviderError(
                "Malformed Valhalla response: missing 'trip' object.",
                provider="valhalla",
                status_code=502,
            )

        legs = trip.get("legs", [])
        if not legs or not isinstance(legs, list):
            raise RoutingProviderError(
                "Malformed Valhalla response: missing 'legs' array in trip.",
                provider="valhalla",
                status_code=502,
            )

        # Extract and stitch coordinates across all legs
        coordinates: List[List[float]] = []

        for leg in legs:
            shape_str = leg.get("shape")
            if shape_str and isinstance(shape_str, str):
                decoded = decode_polyline6(shape_str)
                # GeoJSON coordinates standard: [longitude, latitude]
                leg_coords = [[round(pt[1], 7), round(pt[0], 7)] for pt in decoded]
            elif "coordinates" in leg and isinstance(leg["coordinates"], list):
                leg_coords = leg["coordinates"]
            else:
                continue

            # Deduplicate contiguous boundary coordinate between legs
            if coordinates and leg_coords and coordinates[-1] == leg_coords[0]:
                coordinates.extend(leg_coords[1:])
            else:
                coordinates.extend(leg_coords)

        if len(coordinates) < 2:
            raise RoutingProviderError(
                "Valhalla returned insufficient road geometry points (< 2 coordinates).",
                provider="valhalla",
                status_code=502,
            )

        geojson_geometry = {
            "type": "LineString",
            "coordinates": coordinates,
        }

        # Strict validation against UBus GeoJSON LineString standard
        is_valid, validation_err = validate_geojson_linestring(geojson_geometry)
        if not is_valid:
            raise RoutingProviderError(
                f"Valhalla returned invalid GeoJSON LineString: {validation_err}",
                provider="valhalla",
                status_code=502,
            )

        # Distance and duration normalization
        summary = trip.get("summary", {})
        length_km = summary.get("length", 0.0)
        time_sec = summary.get("time", 0.0)

        distance_km = Decimal(str(round(float(length_km), 2)))
        duration_mins = max(1, round(float(time_sec) / 60.0)) if time_sec > 0 else 0

        # Snapped waypoints extraction
        snapped_waypoints: List[Dict[str, Any]] = []
        valhalla_locs = trip.get("locations", [])
        warnings: List[str] = []

        for idx, orig_wp in enumerate(request.waypoints):
            loc_data = valhalla_locs[idx] if idx < len(valhalla_locs) else {}
            snapped_lat = loc_data.get("lat", orig_wp[0])
            snapped_lon = loc_data.get("lon", orig_wp[1])

            displacement_m = calculate_haversine_distance_m(orig_wp[0], orig_wp[1], snapped_lat, snapped_lon)

            snapped_waypoints.append({
                "original_index": idx,
                "original_lat": orig_wp[0],
                "original_lng": orig_wp[1],
                "snapped_lat": round(float(snapped_lat), 7),
                "snapped_lng": round(float(snapped_lon), 7),
                "displacement_meters": round(displacement_m, 1),
            })

            if displacement_m > 50.0:
                warnings.append(
                    f"Waypoint #{idx + 1} snapped {displacement_m:.0f}m away from the specified location."
                )

        # Check for excessive detour vs straight-line distance
        straight_dist_m = 0.0
        for i in range(len(request.waypoints) - 1):
            p1 = request.waypoints[i]
            p2 = request.waypoints[i + 1]
            straight_dist_m += calculate_haversine_distance_m(p1[0], p1[1], p2[0], p2[1])

        straight_dist_km = straight_dist_m / 1000.0
        detour_ratio = (float(distance_km) / straight_dist_km) if straight_dist_km > 0.1 else 1.0

        if straight_dist_km > 0.5 and detour_ratio > 2.5:
            warnings.append(
                f"Road distance ({distance_km} km) is {detour_ratio:.1f}× straight-line distance ({straight_dist_km:.2f} km). Verify route for unintended detours or flyover loops."
            )

        metadata = {
            "routing_engine": "valhalla",
            "costing": costing,
            "provider_distance_meters": round(float(length_km) * 1000.0, 1),
            "provider_duration_seconds": round(float(time_sec), 1),
            "straight_line_distance_km": round(straight_dist_km, 2),
            "detour_ratio": round(detour_ratio, 2),
        }

        return RoutingResult(
            geometry=geojson_geometry,
            distance_km=distance_km,
            duration_mins=duration_mins,
            coordinate_count=len(coordinates),
            waypoints_snapped=snapped_waypoints,
            provider="valhalla",
            warnings=warnings,
            metadata=metadata,
        )


class OSRMRoutingProvider(RoutingProvider):
    """
    OSRM (Open Source Routing Machine) Provider adapter.
    Connects to an OSRM HTTP service (e.g., https://router.project-osrm.org or custom OSRM).
    """

    def __init__(self, base_url: Optional[str] = None, timeout: Optional[float] = None):
        self.base_url = (
            base_url
            or getattr(settings, 'OSRM_URL', None)
            or os.getenv('OSRM_URL', 'https://router.project-osrm.org')
        ).rstrip('/')
        self.timeout = (
            timeout
            if timeout is not None
            else getattr(settings, 'OSRM_TIMEOUT', None)
            or float(os.getenv('OSRM_TIMEOUT', '10.0'))
        )

    def route(self, request: RoutingRequest) -> RoutingResult:
        # Build coordinates string in lng,lat;lng,lat format for OSRM
        coords_str = ';'.join(f"{wp[1]:.6f},{wp[0]:.6f}" for wp in request.waypoints)
        endpoint = f"{self.base_url}/route/v1/driving/{coords_str}?overview=full&geometries=geojson"

        try:
            response = requests.get(
                endpoint,
                timeout=self.timeout,
                headers={"User-Agent": "UBus-Transit-Platform/1.0"}
            )
        except requests.exceptions.Timeout:
            logger.warning("OSRM routing engine timed out after %ss for %d waypoints", self.timeout, len(request.waypoints))
            raise RoutingProviderError(
                f"OSRM routing engine timed out after {self.timeout}s.",
                provider="osrm",
                status_code=504,
            )
        except requests.exceptions.ConnectionError as ce:
            logger.warning("Failed to connect to OSRM at %s: %s", self.base_url, ce)
            raise RoutingProviderError(
                "Could not connect to OSRM routing engine. Upstream service may be unavailable.",
                provider="osrm",
                status_code=503,
            )
        except requests.exceptions.RequestException as re:
            logger.error("OSRM request exception: %s", re)
            raise RoutingProviderError(
                f"OSRM routing request failed: {re}",
                provider="osrm",
                status_code=502,
            )

        return self._parse_osrm_response(response, request)

    def _parse_osrm_response(self, response: requests.Response, request: RoutingRequest) -> RoutingResult:
        status_code = response.status_code
        try:
            data = response.json()
        except ValueError:
            raise RoutingProviderError(
                f"OSRM returned non-JSON response (HTTP {status_code}).",
                provider="osrm",
                status_code=502,
            )

        if status_code != 200 or data.get("code") != "Ok":
            code = data.get("code", "Error")
            msg = data.get("message", f"HTTP {status_code}")
            if code == "NoRoute":
                raise RoutingProviderError(
                    "No drivable road path could be found connecting the specified waypoints.",
                    provider="osrm",
                    status_code=422,
                )
            raise RoutingProviderError(
                f"OSRM routing engine returned error: {code} - {msg}",
                provider="osrm",
                status_code=502,
            )

        routes = data.get("routes", [])
        if not routes:
            raise RoutingProviderError(
                "Malformed OSRM response: empty 'routes' list.",
                provider="osrm",
                status_code=502,
            )

        primary_route = routes[0]
        geometry = primary_route.get("geometry")
        if not geometry or geometry.get("type") != "LineString" or "coordinates" not in geometry:
            raise RoutingProviderError(
                "Malformed OSRM response: missing or invalid GeoJSON geometry.",
                provider="osrm",
                status_code=502,
            )

        coordinates = geometry["coordinates"]
        if len(coordinates) < 2:
            raise RoutingProviderError(
                "OSRM returned insufficient road geometry points (< 2 coordinates).",
                provider="osrm",
                status_code=502,
            )

        # Distance is in meters, duration in seconds
        distance_meters = float(primary_route.get("distance", 0.0))
        duration_seconds = float(primary_route.get("duration", 0.0))
        distance_km = round(distance_meters / 1000.0, 2)
        duration_mins = max(1, round(duration_seconds / 60.0))

        # Snapped waypoints
        osrm_wps = data.get("waypoints", [])
        snapped_waypoints = []
        for idx, orig_wp in enumerate(request.waypoints):
            loc_data = osrm_wps[idx] if idx < len(osrm_wps) else {}
            snapped_loc = loc_data.get("location")
            if snapped_loc and len(snapped_loc) == 2:
                s_lng = round(float(snapped_loc[0]), 7)
                s_lat = round(float(snapped_loc[1]), 7)
                disp = round(float(loc_data.get("distance", 0.0)), 1)
            else:
                s_lat, s_lng, disp = orig_wp[0], orig_wp[1], 0.0

            snapped_waypoints.append({
                "original_index": idx,
                "original_lat": orig_wp[0],
                "original_lng": orig_wp[1],
                "snapped_lat": s_lat,
                "snapped_lng": s_lng,
                "displacement_meters": disp,
            })

        metadata = {
            "routing_engine": "osrm",
            "profile": request.profile,
            "weight_name": primary_route.get("weight_name", "routability"),
        }

        return RoutingResult(
            geometry=geometry,
            distance_km=distance_km,
            duration_mins=duration_mins,
            coordinate_count=len(coordinates),
            waypoints_snapped=snapped_waypoints,
            provider="osrm",
            warnings=[],
            metadata=metadata,
        )


class FallbackRoutingProvider(RoutingProvider):
    """
    Tries the primary routing provider (e.g. Valhalla).
    If the primary provider is unreachable (ConnectionError / 503) or times out (504),
    automatically and seamlessly falls back to the secondary provider (e.g. OSRM).
    """

    def __init__(self, primary: RoutingProvider, fallback: RoutingProvider):
        self.primary = primary
        self.fallback = fallback

    def route(self, request: RoutingRequest) -> RoutingResult:
        try:
            return self.primary.route(request)
        except RoutingProviderError as err:
            # Check if failure is due to primary provider being offline / unreachable
            if err.status_code in (503, 504) or "Could not connect" in str(err) or "timed out" in str(err):
                logger.info(
                    "Primary routing provider '%s' unavailable (%s). Falling back to secondary provider.",
                    err.provider,
                    err.message,
                )
                result = self.fallback.route(request)
                result.warnings.append(
                    f"Generated via fallback routing provider ({result.provider}) because primary ({err.provider}) was offline."
                )
                return result
            # Unroutable path (422) or client error -> re-raise
            raise


def get_routing_provider(provider_name: Optional[str] = None) -> RoutingProvider:
    """Factory function to instantiate the configured routing provider."""
    name = (provider_name or getattr(settings, 'ROUTING_PROVIDER', 'auto')).lower().strip()
    if name == 'osrm':
        return OSRMRoutingProvider()
    if name == 'valhalla_strict':
        return ValhallaRoutingProvider()
    if name == 'valhalla':
        if getattr(settings, 'ROUTING_FALLBACK_OSRM', True):
            return FallbackRoutingProvider(primary=ValhallaRoutingProvider(), fallback=OSRMRoutingProvider())
        return ValhallaRoutingProvider()
    # Default 'auto'
    return FallbackRoutingProvider(primary=ValhallaRoutingProvider(), fallback=OSRMRoutingProvider())
