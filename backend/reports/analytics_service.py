import datetime
from django.db.models import Avg, Count, F, Q, Sum
from django.utils import timezone

from accounts.models import User
from buses.models import Bus, BusAssignment, Journey
from issues.models import Issue
from schedules.models import Route
from .models import TripLog, UserFeedback
from .constants import ON_TIME_TOLERANCE_MINUTES, DURATION_BUFFER_MINUTES


def parse_date_boundaries(start_date_str=None, end_date_str=None, default_days=30):
    """
    Parse start and end dates and construct timezone-aware datetime boundaries
    using an inclusive start and exclusive next-day end boundary:
    [start_datetime, next_day_datetime)
    Ensures safe, consistent time filtering across database backends without UTC-shift bugs
    or fractional-second truncation near midnight.
    """
    tz = timezone.get_current_timezone()
    today = timezone.now().date()

    if end_date_str:
        try:
            end_date = datetime.datetime.strptime(end_date_str, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            end_date = today
    else:
        end_date = today

    if start_date_str:
        try:
            start_date = datetime.datetime.strptime(start_date_str, '%Y-%m-%d').date()
        except (ValueError, TypeError):
            start_date = end_date - datetime.timedelta(days=default_days)
    else:
        start_date = end_date - datetime.timedelta(days=default_days)

    if start_date > end_date:
        start_date, end_date = end_date, start_date

    start_dt = timezone.make_aware(datetime.datetime.combine(start_date, datetime.time.min), tz)
    next_day_dt = timezone.make_aware(datetime.datetime.combine(end_date + datetime.timedelta(days=1), datetime.time.min), tz)

    return start_date, end_date, start_dt, next_day_dt


def get_reports_overview_data(days=30):
    """
    Overview statistics and route on-time performance for the last N days.
    Guarantees reliable metrics derived from actual Journey operations.
    """
    start_date, end_date, start_dt, next_day_dt = parse_date_boundaries(default_days=days)

    completed_journeys = Journey.objects.filter(
        status='completed',
        start_time__gte=start_dt,
        start_time__lt=next_day_dt
    ).select_related('route', 'trip_log')

    total_trips_30d = completed_journeys.count()

    stats = {
        'total_routes': Route.objects.filter(is_active=True).count(),
        'total_buses': Bus.objects.filter(is_active=True).count(),
        'total_drivers': User.objects.filter(role='driver', is_active=True).count(),
        'active_issues': Issue.objects.filter(status='pending').count(),
        'total_trips_30d': total_trips_30d,
        'active_journeys': Journey.objects.filter(status='active').count(),
        'aborted_trips_30d': Journey.objects.filter(
            status='aborted',
            start_time__gte=start_dt,
            start_time__lt=next_day_dt
        ).count(),
    }

    # Calculate route performance from operational journeys
    route_stats = {}
    for j in completed_journeys:
        r_name = j.route.name if j.route else 'Unassigned Route'
        if r_name not in route_stats:
            route_stats[r_name] = {'total_trips': 0, 'on_time_trips': 0}
        route_stats[r_name]['total_trips'] += 1

        is_on_time = True
        if hasattr(j, 'trip_log') and j.trip_log:
            is_on_time = j.trip_log.is_on_time
        elif j.duration_minutes is not None and j.route and j.route.estimated_duration_mins:
            is_on_time = (j.duration_minutes <= j.route.estimated_duration_mins + DURATION_BUFFER_MINUTES)

        if is_on_time:
            route_stats[r_name]['on_time_trips'] += 1

    route_performance = []
    for r_name, data in route_stats.items():
        total = data['total_trips']
        on_time = data['on_time_trips']
        pct = round((on_time * 100.0 / total), 1) if total > 0 else 0.0
        route_performance.append({
            'route_name': r_name,
            'total_trips': total,
            'on_time_trips': on_time,
            'on_time_pct': pct,
        })

    route_performance.sort(key=lambda x: x['total_trips'], reverse=True)

    return {
        'stats': stats,
        'route_performance': route_performance[:10],
    }


def get_route_analytics_data(start_date, end_date, start_dt, next_day_dt):
    """
    Route analytics broken down by route: total trips, punctuality, passengers, delays.
    Uses exclusive next_day_dt boundary for exact date containment.
    """
    completed_journeys = Journey.objects.filter(
        status='completed',
        start_time__gte=start_dt,
        start_time__lt=next_day_dt
    ).select_related('route', 'trip_log')

    routes_dict = {}
    for j in completed_journeys:
        route_id = j.route_id or 0
        route_name = j.route.name if j.route else 'Unassigned Route'

        if route_id not in routes_dict:
            routes_dict[route_id] = {
                'route__id': route_id,
                'route__name': route_name,
                'total_trips': 0,
                'on_time_trips': 0,
                'delayed_trips': 0,
                'total_passengers': 0,
                'total_delay_mins': 0,
                'delay_count': 0,
                'durations': [],
            }

        routes_dict[route_id]['total_trips'] += 1

        delay_mins = 0
        is_on_time = True
        if hasattr(j, 'trip_log') and j.trip_log:
            delay_mins = j.trip_log.departure_delay_mins
            is_on_time = j.trip_log.is_on_time
            routes_dict[route_id]['total_passengers'] += j.trip_log.passenger_count
        elif j.duration_minutes is not None and j.route and j.route.estimated_duration_mins:
            is_on_time = (j.duration_minutes <= j.route.estimated_duration_mins + DURATION_BUFFER_MINUTES)
            if not is_on_time:
                delay_mins = max(0, j.duration_minutes - j.route.estimated_duration_mins)

        if is_on_time:
            routes_dict[route_id]['on_time_trips'] += 1
        else:
            routes_dict[route_id]['delayed_trips'] += 1

        if delay_mins > 0:
            routes_dict[route_id]['total_delay_mins'] += delay_mins
            routes_dict[route_id]['delay_count'] += 1

        # Only append valid non-negative durations (corrupted negative durations return None)
        if j.duration_minutes is not None and j.duration_minutes >= 0:
            routes_dict[route_id]['durations'].append(j.duration_minutes)

    routes_list = []
    for r in routes_dict.values():
        total = r['total_trips']
        avg_delay = (
            round(r['total_delay_mins'] / total, 1)
            if total > 0
            else 0.0
        )
        avg_duration = (
            round(sum(r['durations']) / len(r['durations']), 1)
            if r['durations']
            else None
        )
        routes_list.append({
            'route__id': r['route__id'],
            'route__name': r['route__name'],
            'total_trips': total,
            'on_time_trips': r['on_time_trips'],
            'delayed_trips': r['delayed_trips'],
            'total_passengers': r['total_passengers'],
            'avg_delay': avg_delay,
            'avg_duration_minutes': avg_duration,
        })

    routes_list.sort(key=lambda x: x['total_trips'], reverse=True)

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'routes': routes_list,
    }


def get_performance_summary_data(start_date, end_date, start_dt, next_day_dt):
    """
    On-time vs delayed performance summary overall, by route, and daily.
    """
    completed_journeys = Journey.objects.filter(
        status='completed',
        start_time__gte=start_dt,
        start_time__lt=next_day_dt
    ).select_related('route', 'trip_log').order_by('start_time')

    total_completed = 0
    total_on_time = 0
    total_delayed = 0
    valid_durations = []
    by_route_dict = {}
    daily_dict = {}

    for j in completed_journeys:
        total_completed += 1
        r_name = j.route.name if j.route else 'Unassigned'
        day_str = j.start_time.date().isoformat()

        is_on_time = True
        delay_mins = 0
        passengers = 0
        if hasattr(j, 'trip_log') and j.trip_log:
            is_on_time = j.trip_log.is_on_time
            delay_mins = j.trip_log.departure_delay_mins
            passengers = j.trip_log.passenger_count
        elif j.duration_minutes is not None and j.route and j.route.estimated_duration_mins:
            is_on_time = (j.duration_minutes <= j.route.estimated_duration_mins + DURATION_BUFFER_MINUTES)
            if not is_on_time:
                delay_mins = max(0, j.duration_minutes - j.route.estimated_duration_mins)

        if is_on_time:
            total_on_time += 1
        else:
            total_delayed += 1

        if j.duration_minutes is not None and j.duration_minutes >= 0:
            valid_durations.append(j.duration_minutes)

        # Route breakdown
        if r_name not in by_route_dict:
            by_route_dict[r_name] = {
                'route__name': r_name,
                'total': 0,
                'on_time': 0,
                'delayed': 0,
                'total_delay': 0,
            }
        by_route_dict[r_name]['total'] += 1
        if is_on_time:
            by_route_dict[r_name]['on_time'] += 1
        else:
            by_route_dict[r_name]['delayed'] += 1
        by_route_dict[r_name]['total_delay'] += delay_mins

        # Daily breakdown
        if day_str not in daily_dict:
            daily_dict[day_str] = {
                'date': day_str,
                'total': 0,
                'on_time': 0,
                'passengers': 0,
            }
        daily_dict[day_str]['total'] += 1
        if is_on_time:
            daily_dict[day_str]['on_time'] += 1
        daily_dict[day_str]['passengers'] += passengers

    by_route = []
    for r in sorted(by_route_dict.values(), key=lambda x: x['route__name']):
        tot = r['total']
        avg_d = round(r['total_delay'] / tot, 1) if tot > 0 else 0.0
        by_route.append({
            'route__name': r['route__name'],
            'total': tot,
            'on_time': r['on_time'],
            'delayed': r['delayed'],
            'avg_delay': avg_d,
        })

    daily = sorted(daily_dict.values(), key=lambda x: x['date'])

    avg_duration = (
        round(sum(valid_durations) / len(valid_durations), 1)
        if valid_durations
        else None
    )

    overall = {
        'total': total_completed,
        'on_time': total_on_time,
        'delayed': total_delayed,
        'avg_duration_minutes': avg_duration,
        'aborted': Journey.objects.filter(
            status='aborted',
            start_time__gte=start_dt,
            start_time__lt=next_day_dt
        ).count(),
    }

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'overall': overall,
        'by_route': by_route,
        'daily': daily,
    }


def get_driver_logs_data(start_date, end_date, start_dt, next_day_dt):
    """
    Driver performance statistics including assignments, completed journeys, and operational duration.
    """
    drivers = User.objects.filter(role='driver').order_by('first_name', 'username')

    driver_results = []
    for d in drivers:
        assignments_count = BusAssignment.objects.filter(
            driver=d,
            date__gte=start_date,
            date__lte=end_date
        ).count()

        issues_count = Issue.objects.filter(
            reported_by=d,
            created_at__gte=start_dt,
            created_at__lt=next_day_dt
        ).count()

        completed_journeys = Journey.objects.filter(
            driver=d,
            status='completed',
            start_time__gte=start_dt,
            start_time__lt=next_day_dt
        )
        completed_count = completed_journeys.count()

        total_duration = 0
        for j in completed_journeys:
            if j.duration_minutes is not None and j.duration_minutes >= 0:
                total_duration += j.duration_minutes

        driver_results.append({
            'id': d.id,
            'username': d.username,
            'full_name': d.get_full_name() or d.username,
            'phone': d.phone or '',
            'total_assignments': assignments_count,
            'total_issues': issues_count,
            'total_completed_trips': completed_count,
            'total_duration_minutes': total_duration,
        })

    driver_results.sort(key=lambda x: (x['total_assignments'], x['total_completed_trips']), reverse=True)

    recent_assignments = BusAssignment.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    ).select_related('driver', 'bus', 'route').order_by('-date', '-created_at')[:50]

    return {
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'drivers': driver_results,
        'recent_assignments': [
            {
                'id': a.id,
                'date': a.date.isoformat() if a.date else None,
                'driver_name': a.driver.get_full_name() or a.driver.username,
                'bus_number': a.bus.bus_number,
                'route_name': a.route.name,
                'is_active': a.is_active,
            }
            for a in recent_assignments
        ],
    }
