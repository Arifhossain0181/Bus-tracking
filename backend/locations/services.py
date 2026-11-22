import logging
import math
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.utils import timezone

from buses.models import BusLocation, Journey
from .models import DriverLocation, LocationHistory

logger = logging.getLogger(__name__)

ETA_THROTTLE_SECONDS = 15


def _to_decimal(value, max_digits=10, decimal_places=7):
    """
    Safely convert an input float/int/str/Decimal into a Decimal capped
    within the precision and scale bounds of Django's DecimalField.
    Returns None if value is None or cannot be parsed.
    """
    if value is None:
        return None
    try:
        f_val = float(value)
        if math.isnan(f_val) or math.isinf(f_val):
            return None
        rounded = round(f_val, decimal_places)
        max_integer_digits = max_digits - decimal_places
        max_limit = (Decimal(10) ** max_integer_digits) - (Decimal(10) ** -decimal_places)
        dec = Decimal(str(rounded))
        if dec > max_limit:
            dec = max_limit
        elif dec < -max_limit:
            dec = -max_limit
        return dec
    except (ValueError, TypeError, InvalidOperation):
        return None


def should_update_eta(bus, throttle_seconds=ETA_THROTTLE_SECONDS):
    """
    Check whether enough time has elapsed since the last ETA calculation for this bus.
    Returns True if ETAs should be recalculated, False otherwise.
    """
    from buses.models import ETACalculation
    latest_eta = ETACalculation.objects.filter(bus=bus).order_by('-calculated_at').first()
    if not latest_eta:
        return True
    
    elapsed = (timezone.now() - latest_eta.calculated_at).total_seconds()
    return elapsed >= throttle_seconds


def trigger_eta_update_if_needed(bus, route, throttle_seconds=ETA_THROTTLE_SECONDS, force=False):
    """
    Safely trigger ETA calculation for bus and route if throttling permits or if forced.
    Catches all exceptions to isolate ETA failures from core GPS tracking.
    Returns True if recalculation ran, False if throttled or on error.
    """
    if not route or not bus:
        return False

    if not force and not should_update_eta(bus, throttle_seconds=throttle_seconds):
        return False

    try:
        from buses.api_views import update_etas_for_bus
        update_etas_for_bus(bus, route)
        return True
    except Exception as e:
        logger.exception("Failed to update ETAs for bus %s (Route %s): %s", bus.id, route.id, e)
        return False


def record_driver_gps(driver, latitude, longitude, accuracy=None, speed=None, heading=None, force_eta=False, throttle_seconds=ETA_THROTTLE_SECONDS, timestamp=None):
    """
    Unified ingestion pipeline for driver GPS telemetry:
    1. Validates active journey for the driver.
    2. Atomically records DriverLocation, LocationHistory, and synchronized BusLocation.
    3. Safely triggers throttled ETA calculation without blocking or failing GPS recording.
    4. Protects against out-of-order delayed packets overwriting newer live location.
    5. Returns a standard status payload including bus_id for frontend tracking consumers.
    """
    journey = Journey.get_active_journey(driver)
    if not journey:
        raise ValueError("No active journey. Start a journey first.")

    # Convert coordinates and metrics safely
    dec_lat = _to_decimal(latitude, max_digits=10, decimal_places=7)
    dec_lon = _to_decimal(longitude, max_digits=10, decimal_places=7)
    if dec_lat is None or dec_lon is None:
        raise ValueError("Valid latitude and longitude are required.")
    if dec_lat < Decimal('-90.0') or dec_lat > Decimal('90.0'):
        raise ValueError("Latitude must be between -90 and 90 degrees.")
    if dec_lon < Decimal('-180.0') or dec_lon > Decimal('180.0'):
        raise ValueError("Longitude must be between -180 and 180 degrees.")
    if dec_lat == Decimal('0') and dec_lon == Decimal('0'):
        raise ValueError("Invalid coordinates: Null Island (0, 0) is rejected.")
    if speed is not None and (float(speed) < 0 or float(speed) > 150):
        raise ValueError("Speed must be between 0 and 150 m/s.")
    if heading is not None and (float(heading) < 0 or float(heading) > 360):
        raise ValueError("Heading must be between 0 and 360 degrees.")

    dec_speed = _to_decimal(speed, max_digits=5, decimal_places=2)
    dec_heading = _to_decimal(heading, max_digits=5, decimal_places=2)

    # GPS accuracy threshold: <= 50 meters considered accurate
    is_accurate = True if accuracy is None else (float(accuracy) <= 50.0)

    record_time = timezone.now()
    if timestamp is not None:
        parsed_ts = None
        if isinstance(timestamp, str):
            from django.utils.dateparse import parse_datetime
            parsed_ts = parse_datetime(timestamp)
        elif hasattr(timestamp, 'strftime'):
            parsed_ts = timestamp

        if parsed_ts is not None:
            if timezone.is_naive(parsed_ts):
                parsed_ts = timezone.make_aware(parsed_ts)

            # Check for out-of-order telemetry:
            # If live location has a newer timestamp (>2s), do not overwrite live state
            existing_loc = DriverLocation.objects.filter(driver=driver).first()
            if existing_loc and existing_loc.last_updated:
                if parsed_ts < (existing_loc.last_updated - timezone.timedelta(seconds=2)):
                    logger.warning(
                        "Ignored out-of-order GPS packet for driver %s (packet=%s, live=%s)",
                        driver.username, parsed_ts.isoformat(), existing_loc.last_updated.isoformat()
                    )
                    return {
                        'status': 'ignored',
                        'message': 'Out-of-order GPS update ignored for live state.',
                        'timestamp': existing_loc.last_updated.isoformat(),
                        'bus_id': journey.bus.id,
                        'bus_location_id': None,
                        'eta_updated': False,
                    }
            record_time = parsed_ts

    with transaction.atomic():
        # 1. Update or create DriverLocation
        driver_loc_defaults = {
            'latitude': dec_lat,
            'longitude': dec_lon,
            'accuracy': float(accuracy) if accuracy is not None else None,
            'heading': float(heading) if heading is not None else None,
            'speed': float(speed) if speed is not None else None,
            'is_sharing': True,
            'journey': journey,
        }
        driver_location, _ = DriverLocation.objects.update_or_create(
            driver=driver,
            defaults=driver_loc_defaults,
        )

        # 2. Append to LocationHistory for audit / analytics
        LocationHistory.objects.create(
            driver=driver,
            latitude=dec_lat,
            longitude=dec_lon,
        )

        # 3. Synchronize to BusLocation
        bus_location = BusLocation.objects.create(
            bus=journey.bus,
            latitude=dec_lat,
            longitude=dec_lon,
            speed=dec_speed,
            heading=dec_heading,
            is_accurate=is_accurate,
            timestamp=record_time,
        )

        # Ensure bus points to active route if not already set
        if journey.route and journey.bus.current_route_id != journey.route_id:
            journey.bus.current_route = journey.route
            journey.bus.save(update_fields=['current_route'])

    # 4. Safely trigger throttled ETA calculation outside transaction
    eta_updated = False
    if journey.route:
        eta_updated = trigger_eta_update_if_needed(
            bus=journey.bus,
            route=journey.route,
            throttle_seconds=throttle_seconds,
            force=force_eta,
        )

    return {
        'status': 'success',
        'message': 'Location updated',
        'timestamp': driver_location.last_updated.isoformat(),
        'bus_id': journey.bus.id,
        'bus_location_id': bus_location.id,
        'eta_updated': eta_updated,
    }
