import math
from decimal import Decimal
from typing import Tuple, Optional, Any, List

def validate_geojson_linestring(
    geometry: Any,
    max_coordinates: int = 10000
) -> Tuple[bool, Optional[str]]:
    """
    Validate a GeoJSON LineString geometry contract.
    
    Expected format:
    {
        "type": "LineString",
        "coordinates": [
            [longitude, latitude],
            ...
        ]
    }
    
    Coordinate order must be GeoJSON standard: [longitude, latitude].
    - Longitude must be between -180.0 and 180.0
    - Latitude must be between -90.0 and 90.0
    - Minimum 2 points required
    - Maximum max_coordinates points allowed
    - Values must be finite numbers (not NaN, not Infinity, not boolean)
    - Degenerate geometry (all coordinates identical) is rejected
    """
    if not isinstance(geometry, dict):
        return False, "Geometry must be a JSON object (dictionary)."

    geom_type = geometry.get("type")
    if geom_type is None:
        return False, "Geometry object is missing required 'type' field."
    if geom_type != "LineString":
        return False, f"Unsupported geometry type '{geom_type}'. Only 'LineString' is supported."

    if "coordinates" not in geometry:
        return False, "Geometry object is missing required 'coordinates' field."

    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list):
        return False, "Geometry 'coordinates' must be an array (list)."

    num_points = len(coordinates)
    if num_points < 2:
        return False, f"LineString coordinates must contain at least 2 points (received {num_points})."

    if num_points > max_coordinates:
        return False, f"LineString exceeds maximum permitted coordinate count of {max_coordinates} (received {num_points})."

    first_point = None
    all_identical = True

    for idx, point in enumerate(coordinates):
        if not isinstance(point, (list, tuple)):
            return False, f"Coordinate at index {idx} must be a 2-element array [longitude, latitude]."

        if len(point) != 2:
            return False, f"Coordinate at index {idx} has invalid length {len(point)} (must be exactly 2: [longitude, latitude])."

        lng, lat = point

        # Python bool is a subclass of int, so reject explicit booleans
        if isinstance(lng, bool) or not isinstance(lng, (int, float)):
            return False, f"Longitude at index {idx} must be a numeric value."
        if isinstance(lat, bool) or not isinstance(lat, (int, float)):
            return False, f"Latitude at index {idx} must be a numeric value."

        if math.isnan(lng) or math.isinf(lng):
            return False, f"Longitude at index {idx} cannot be NaN or Infinity."
        if math.isnan(lat) or math.isinf(lat):
            return False, f"Latitude at index {idx} cannot be NaN or Infinity."

        if lng < -180.0 or lng > 180.0:
            return False, f"Longitude at index {idx} ({lng}) out of bounds [-180.0, 180.0]."
        if lat < -90.0 or lat > 90.0:
            return False, f"Latitude at index {idx} ({lat}) out of bounds [-90.0, 90.0]."

        pt_tuple = (float(lng), float(lat))
        if first_point is None:
            first_point = pt_tuple
        elif pt_tuple != first_point:
            all_identical = False

    if all_identical:
        return False, "Degenerate geometry: LineString must contain at least two distinct points."

    return True, None


def calculate_linestring_distance_km(coordinates: List[List[float]]) -> Decimal:
    """
    Calculate the total path length in kilometers for a series of [lng, lat] coordinates
    using the Haversine formula on a spherical Earth (R = 6371.0 km).
    Returns a Decimal rounded to 2 decimal places.
    """
    if not coordinates or len(coordinates) < 2:
        return Decimal('0.00')

    r = 6371.0
    total_km = 0.0

    for i in range(len(coordinates) - 1):
        lng1, lat1 = coordinates[i]
        lng2, lat2 = coordinates[i + 1]

        phi1 = math.radians(float(lat1))
        phi2 = math.radians(float(lat2))
        delta_phi = math.radians(float(lat2) - float(lat1))
        delta_lambda = math.radians(float(lng2) - float(lng1))

        a = (
            math.sin(delta_phi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
        )
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        total_km += r * c

    return Decimal(str(round(total_km, 2)))
