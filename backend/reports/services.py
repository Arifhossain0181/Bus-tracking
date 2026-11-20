import logging
from datetime import datetime, time
from django.utils import timezone
from .models import TripLog

logger = logging.getLogger(__name__)


def sync_journey_to_trip_log(journey):
    """
    Synchronize a Journey lifecycle event to a TripLog record.
    Preserves historical operational data even if assignments or routes change later.
    Guarantees a 1-to-1 relationship preventing duplicate trip history entries.
    """
    if not journey:
        return None

    # Calculate or match scheduled times
    scheduled_departure = None
    scheduled_arrival = None

    if journey.assignment and journey.assignment.shift_start:
        scheduled_departure = journey.assignment.shift_start
        scheduled_arrival = journey.assignment.shift_end
    elif journey.route:
        # Check if route has trips and find the trip with departure time closest to journey start
        trips = list(journey.route.trips.all())
        if trips:
            start_t = journey.start_time.time()
            start_mins = start_t.hour * 60 + start_t.minute
            best_trip = min(
                trips,
                key=lambda t: abs((t.departure_time.hour * 60 + t.departure_time.minute) - start_mins)
            )
            scheduled_departure = best_trip.departure_time
            scheduled_arrival = best_trip.arrival_time
        elif journey.route.stops.exists():
            first_stop = journey.route.stops.order_by('order').first()
            last_stop = journey.route.stops.order_by('order').last()
            if first_stop and first_stop.scheduled_time:
                scheduled_departure = first_stop.scheduled_time
                scheduled_arrival = last_stop.scheduled_time if last_stop and last_stop.scheduled_time else first_stop.scheduled_time

    if not scheduled_departure and journey.start_time:
        scheduled_departure = journey.start_time.time()

    is_completed = (journey.status == 'completed')

    trip_log, _ = TripLog.objects.update_or_create(
        journey=journey,
        defaults={
            'bus': journey.bus,
            'route': journey.route,
            'driver': journey.driver,
            'date': journey.start_time.date() if journey.start_time else timezone.now().date(),
            'scheduled_departure': scheduled_departure,
            'actual_departure': journey.start_time.time() if journey.start_time else None,
            'scheduled_arrival': scheduled_arrival,
            'actual_arrival': journey.end_time.time() if journey.end_time else None,
            'is_completed': is_completed,
            'notes': journey.notes or '',
        }
    )
    return trip_log
