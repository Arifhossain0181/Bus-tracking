from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from schedules.models import Route, Stop, Schedule
from .models import Bus, BusLocation, BusAssignment, ETACalculation
from .serializers import (
    BusSerializer,
    BusLocationSerializer,
    BusAssignmentSerializer,
    BusMapDataSerializer,
)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def bus_list_create_api(request):
    if request.method == 'GET':
        buses = Bus.objects.select_related('current_route').prefetch_related('assignments__driver', 'assignments__route').all()
        status_filter = request.GET.get('status')
        if status_filter == 'active':
            buses = buses.filter(is_active=True)
        elif status_filter == 'inactive':
            buses = buses.filter(is_active=False)
        serializer = BusSerializer(buses, many=True)
        return Response(serializer.data)

    # POST: Admin only
    if not request.user.is_admin_user:
        return Response({'error': 'Only admins can create buses.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = BusSerializer(data=request.data)
    if serializer.is_valid():
        bus = serializer.save()
        return Response(BusSerializer(bus).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def bus_detail_api(request, pk):
    bus = get_object_or_404(Bus.objects.select_related('current_route'), pk=pk)

    if request.method == 'GET':
        data = BusSerializer(bus).data
        recent_locations = bus.locations.order_by('-timestamp')[:10]
        recent_assignments = bus.assignments.select_related('driver', 'route').order_by('-created_at')[:5]
        data['recent_locations'] = BusLocationSerializer(recent_locations, many=True).data
        data['recent_assignments'] = BusAssignmentSerializer(recent_assignments, many=True).data
        if bus.current_route:
            data['current_route_trips'] = [
                {
                    'id': t.id,
                    'name': t.name,
                    'trip_number': t.trip_number,
                    'formatted_trip_number': t.formatted_trip_number,
                    'departure_time': t.departure_time.strftime('%H:%M') if t.departure_time else None,
                    'arrival_time': t.arrival_time.strftime('%H:%M') if t.arrival_time else None,
                    'is_active': t.is_active,
                }
                for t in bus.current_route.trips.all()
            ]
        else:
            data['current_route_trips'] = []
        return Response(data)

    if not request.user.is_admin_user:
        return Response({'error': 'Only admins can modify or delete buses.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'DELETE':
        bus.delete()
        return Response({'status': 'Bus deleted successfully.'})

    serializer = BusSerializer(bus, data=request.data, partial=(request.method == 'PATCH'))
    if serializer.is_valid():
        bus = serializer.save()
        return Response(BusSerializer(bus).data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bus_locations(request):
    buses = Bus.objects.filter(is_active=True).select_related('current_route')
    data = []

    for bus in buses:
        location = bus.latest_location
        if location:
            latest_eta = bus.etas.select_related('stop').order_by('-calculated_at').first()
            data.append({
                'id': bus.id,
                'bus_number': bus.bus_number,
                'bus_type': bus.bus_type,
                'latitude': location.latitude,
                'longitude': location.longitude,
                'route_name': bus.current_route.name if bus.current_route else 'No Route',
                'next_stop': latest_eta.stop.name if latest_eta else None,
                'eta': latest_eta.calculated_eta.strftime('%H:%M') if latest_eta else 'Calculating...',
                'speed': location.speed
            })

    serializer = BusMapDataSerializer(data, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bus_etas_api(request):
    """Return latest ETA calculations per stop for live schedule indicators."""
    etas = ETACalculation.objects.select_related('bus', 'stop').order_by('-calculated_at')[:100]
    seen_stops = set()
    result = []
    for eta in etas:
        if eta.stop_id in seen_stops:
            continue
        seen_stops.add(eta.stop_id)
        result.append({
            'stop_id': eta.stop_id,
            'stop_name': eta.stop.name,
            'bus_id': eta.bus_id,
            'bus_number': eta.bus.bus_number,
            'eta_time': eta.calculated_eta.strftime('%H:%M'),
            'delay_minutes': eta.delay_minutes,
            'is_delayed': eta.is_delayed,
            'distance_km': float(eta.distance_km),
        })
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_location(request):
    if request.user.role != 'driver':
        return Response({'error': 'Only drivers can update location'}, status=status.HTTP_403_FORBIDDEN)

    try:
        assignment = BusAssignment.objects.get(driver=request.user, is_active=True)
    except BusAssignment.DoesNotExist:
        return Response({'error': 'No active assignment'}, status=status.HTTP_404_NOT_FOUND)

    lat = request.data.get('latitude')
    lng = request.data.get('longitude')
    spd = request.data.get('speed')
    heading = request.data.get('heading')

    if lat is None or lng is None:
        return Response({'error': 'Latitude and longitude required'}, status=status.HTTP_400_BAD_REQUEST)

    location = BusLocation.objects.create(
        bus=assignment.bus,
        latitude=lat,
        longitude=lng,
        speed=spd,
        heading=heading
    )

    update_etas_for_bus(assignment.bus, assignment.route)

    return Response({'status': 'Location updated', 'timestamp': location.timestamp})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def stop_tracking(request):
    if request.user.role != 'driver':
        return Response({'error': 'Only drivers can stop tracking'}, status=status.HTTP_403_FORBIDDEN)

    try:
        assignment = BusAssignment.objects.get(driver=request.user, is_active=True)
        assignment.ended_at = timezone.now()
        assignment.is_active = False
        assignment.save()
        return Response({'status': 'Tracking stopped'})
    except BusAssignment.DoesNotExist:
        return Response({'error': 'No active assignment'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bus_eta(request, bus_id, stop_id):
    try:
        bus = Bus.objects.get(pk=bus_id)
        stop = Stop.objects.get(pk=stop_id)
    except (Bus.DoesNotExist, Stop.DoesNotExist):
        return Response({'error': 'Bus or stop not found'}, status=status.HTTP_404_NOT_FOUND)

    result = ETACalculation.calculate_eta(bus, stop)
    if result:
        eta, distance, minutes = result
        return Response({
            'bus_number': bus.bus_number,
            'stop_name': stop.name,
            'eta': eta.isoformat(),
            'eta_minutes': minutes,
            'distance_km': round(distance, 2)
        })

    return Response({'error': 'Cannot calculate ETA'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def assignment_options_api(request):
    """Return available buses, unassigned drivers, and unassigned routes for assignment form."""
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    active_assignments = BusAssignment.objects.filter(is_active=True)
    assigned_driver_ids = list(active_assignments.values_list('driver_id', flat=True))
    assigned_route_ids = list(active_assignments.values_list('route_id', flat=True))
    assigned_bus_ids = list(active_assignments.values_list('bus_id', flat=True))

    buses = Bus.objects.filter(is_active=True).exclude(id__in=assigned_bus_ids)
    drivers = User.objects.filter(role='driver', is_active=True).exclude(id__in=assigned_driver_ids)
    routes = Route.objects.filter(is_active=True).exclude(id__in=assigned_route_ids)

    return Response({
        'buses': [{'id': b.id, 'bus_number': b.bus_number, 'license_plate': b.license_plate} for b in buses],
        'drivers': [{'id': d.id, 'username': d.username, 'full_name': d.get_full_name() or d.username} for d in drivers],
        'routes': [{'id': r.id, 'name': r.name, 'route_type': r.route_type} for r in routes],
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def assignment_list_create_api(request):
    if not (request.user.is_admin_user or (request.method == 'GET' and request.user.is_authority)):
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        assignments = BusAssignment.objects.select_related('bus', 'driver', 'route').order_by('-created_at')
        return Response(BusAssignmentSerializer(assignments, many=True).data)

    bus_id = request.data.get('bus')
    driver_id = request.data.get('driver')
    route_id = request.data.get('route')

    if not bus_id or not driver_id or not route_id:
        return Response({'error': 'Bus, driver, and route are required.'}, status=status.HTTP_400_BAD_REQUEST)

    bus_obj = get_object_or_404(Bus, pk=bus_id)
    driver_obj = get_object_or_404(User, pk=driver_id, role='driver')
    route_obj = get_object_or_404(Route, pk=route_id)

    assignment = BusAssignment(
        bus=bus_obj,
        driver=driver_obj,
        route=route_obj,
        date=request.data.get('date') or timezone.now().date(),
        shift_start=request.data.get('shift_start') or None,
        shift_end=request.data.get('shift_end') or None,
        is_active=True,
    )

    try:
        assignment.save()
    except DjangoValidationError as exc:
        msg = exc.messages[0] if hasattr(exc, 'messages') and exc.messages else str(exc)
        return Response({'error': msg}, status=status.HTTP_400_BAD_REQUEST)

    bus_obj.current_route = route_obj
    bus_obj.save()

    BusAssignment.objects.filter(bus=bus_obj, is_active=True).exclude(pk=assignment.pk).update(is_active=False)

    # Auto-create schedules based on route's service days and trips/stops
    day_mapping = {
        'sat-thu': ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'],
        'sun-thu': ['sun', 'mon', 'tue', 'wed', 'thu'],
        'mon-fri': ['mon', 'tue', 'wed', 'thu', 'fri'],
        'all': ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'],
    }
    if route_obj.service_days == 'custom' and route_obj.custom_days:
        days = [d.strip() for d in route_obj.custom_days.split(',') if d.strip()]
    else:
        days = day_mapping.get(route_obj.service_days, ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'])

    Schedule.objects.filter(route=route_obj, bus=bus_obj).delete()

    if route_obj.trips.exists():
        for trip in route_obj.trips.all():
            for day in days:
                Schedule.objects.create(
                    route=route_obj,
                    bus=bus_obj,
                    driver=driver_obj,
                    day_of_week=day,
                    departure_time=trip.departure_time,
                    arrival_time=trip.arrival_time or trip.departure_time,
                    is_active=True,
                )
    elif route_obj.stops.exists():
        first_stop = route_obj.stops.order_by('order').first()
        last_stop = route_obj.stops.order_by('order').last()
        if first_stop and first_stop.scheduled_time:
            for day in days:
                Schedule.objects.create(
                    route=route_obj,
                    bus=bus_obj,
                    driver=driver_obj,
                    day_of_week=day,
                    departure_time=first_stop.scheduled_time,
                    arrival_time=last_stop.scheduled_time if last_stop and last_stop.scheduled_time else first_stop.scheduled_time,
                    is_active=True,
                )

    return Response(BusAssignmentSerializer(assignment).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assignment_clear_api(request, bus_id):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    bus = get_object_or_404(Bus, pk=bus_id)
    assignment = BusAssignment.objects.filter(bus=bus, is_active=True).first()
    if not assignment:
        return Response({'error': f'Bus {bus.bus_number} has no active assignment.'}, status=status.HTTP_400_BAD_REQUEST)

    assignment.is_active = False
    assignment.ended_at = timezone.now()
    assignment.save()

    bus.current_route = None
    bus.save()

    Schedule.objects.filter(bus=bus, driver=assignment.driver, is_active=True).update(is_active=False)

    return Response({'status': 'cleared', 'message': f'Assignment cleared for Bus {bus.bus_number}.'})


def update_etas_for_bus(bus, route):
    if not route:
        return

    stops = route.stops.all()
    for stop in stops:
        result = ETACalculation.calculate_eta(bus, stop)
        if result:
            eta, distance, minutes = result
            scheduled = timezone.now().replace(
                hour=stop.scheduled_time.hour if stop.scheduled_time else 0,
                minute=stop.scheduled_time.minute if stop.scheduled_time else 0
            )

            is_delayed = eta > scheduled if stop.scheduled_time else False
            delay_mins = int((eta - scheduled).total_seconds() / 60) if is_delayed else 0

            ETACalculation.objects.update_or_create(
                bus=bus,
                stop=stop,
                defaults={
                    'calculated_eta': eta,
                    'scheduled_time': scheduled,
                    'distance_km': distance,
                    'is_delayed': is_delayed,
                    'delay_minutes': max(0, delay_mins)
                }
            )
