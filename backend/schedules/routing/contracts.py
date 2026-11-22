import math
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Tuple, Dict, Any, Optional


class RoutingException(Exception):
    """Base exception for all routing-related errors."""
    def __init__(self, message: str, code: Optional[str] = None, details: Optional[Any] = None):
        super().__init__(message)
        self.message = message
        self.code = code or "ROUTING_ERROR"
        self.details = details


class RoutingValidationError(RoutingException):
    """Raised when routing inputs or waypoint coordinates fail validation."""
    def __init__(self, message: str, field_name: Optional[str] = None):
        super().__init__(message, code="INVALID_ROUTING_INPUT", details={"field": field_name} if field_name else None)
        self.field_name = field_name


class RoutingProviderError(RoutingException):
    """Raised when an external routing provider encounters a failure, timeout, or returns an unroutable path."""
    def __init__(self, message: str, provider: str = "valhalla", status_code: Optional[int] = None, details: Optional[Any] = None):
        super().__init__(message, code="ROUTING_PROVIDER_ERROR", details=details)
        self.provider = provider
        self.status_code = status_code


@dataclass
class RoutingRequest:
    """
    Provider-agnostic routing request.
    
    Coordinates are passed as ordered (latitude, longitude) float tuples.
    """
    waypoints: List[Tuple[float, float]]
    profile: str = "bus"
    avoid_tolls: bool = False
    u_turn_penalty: int = 300
    route_id: Optional[int] = None
    costing_options: Dict[str, Any] = field(default_factory=dict)

    MIN_WAYPOINTS: int = 2
    MAX_WAYPOINTS: int = 50

    ALLOWED_PROFILES: Tuple[str, ...] = ("bus", "automobile", "shuttle")

    def __post_init__(self):
        self.validate()

    def validate(self) -> None:
        if not self.waypoints or not isinstance(self.waypoints, (list, tuple)):
            raise RoutingValidationError("Waypoints must be provided as a list of coordinates.", field_name="waypoints")

        count = len(self.waypoints)
        if count < self.MIN_WAYPOINTS:
            raise RoutingValidationError(
                f"At least {self.MIN_WAYPOINTS} waypoints are required to calculate a route (received {count}).",
                field_name="waypoints"
            )
        if count > self.MAX_WAYPOINTS:
            raise RoutingValidationError(
                f"Maximum permitted waypoints is {self.MAX_WAYPOINTS} (received {count}).",
                field_name="waypoints"
            )

        if self.profile not in self.ALLOWED_PROFILES:
            raise RoutingValidationError(
                f"Unsupported routing profile '{self.profile}'. Allowed: {', '.join(self.ALLOWED_PROFILES)}",
                field_name="profile"
            )

        validated_coords = []
        for idx, wp in enumerate(self.waypoints):
            if not isinstance(wp, (list, tuple)) or len(wp) != 2:
                raise RoutingValidationError(
                    f"Waypoint #{idx + 1} must be a (latitude, longitude) coordinate pair.",
                    field_name="waypoints"
                )
            lat, lng = wp
            if not isinstance(lat, (int, float, Decimal)) or not isinstance(lng, (int, float, Decimal)):
                raise RoutingValidationError(
                    f"Waypoint #{idx + 1} contains non-numeric coordinate values.",
                    field_name="waypoints"
                )

            f_lat = float(lat)
            f_lng = float(lng)

            if math.isnan(f_lat) or math.isinf(f_lat) or math.isnan(f_lng) or math.isinf(f_lng):
                raise RoutingValidationError(
                    f"Waypoint #{idx + 1} contains non-finite coordinate values (NaN or Infinity).",
                    field_name="waypoints"
                )

            if not (-90.0 <= f_lat <= 90.0):
                raise RoutingValidationError(
                    f"Waypoint #{idx + 1} latitude {f_lat} is out of bounds [-90, 90].",
                    field_name="waypoints"
                )
            if not (-180.0 <= f_lng <= 180.0):
                raise RoutingValidationError(
                    f"Waypoint #{idx + 1} longitude {f_lng} is out of bounds [-180, 180].",
                    field_name="waypoints"
                )

            validated_coords.append((round(f_lat, 7), round(f_lng, 7)))

        # Verify not all points are identical
        first = validated_coords[0]
        if all(abs(c[0] - first[0]) < 1e-6 and abs(c[1] - first[1]) < 1e-6 for c in validated_coords):
            raise RoutingValidationError(
                "All waypoints are identical. A route requires at least two distinct locations.",
                field_name="waypoints"
            )

        self.waypoints = validated_coords


@dataclass
class RoutingResult:
    """
    Normalized provider-independent route result.
    
    Geometry follows RFC 7946 GeoJSON LineString standard:
    coordinates are [longitude, latitude].
    """
    geometry: Dict[str, Any]
    distance_km: Decimal
    duration_mins: int
    coordinate_count: int
    waypoints_snapped: List[Dict[str, Any]]
    provider: str
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
