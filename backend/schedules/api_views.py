from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from buses.models import ETACalculation, BusAssignment
from .models import Route, Stop, Schedule, Trip, TripStopTime
from .serializers import (
    RouteSerializer,
    StopSerializer,
    ScheduleSerializer,
    TripSerializer,
    TripStopTimeSerializer,
)


def _save_route_builder(route, data):
    """Persist Shuttle/Metro trips or Long Road pickup stops for a Route."""
    route_type = data.get('route_type', route.route_type)
    route.name = (data.get('name') or route.name).strip()
    route.description = (data.get('description', route.description) or '').strip()
    route.route_type = route_type
    route.service_days = data.get('service_days', route.service_days or 'sat-thu')
    route.custom_days = (data.get('custom_days', route.custom_days) or '').strip()
    route.origin_name = (data.get('origin_name', route.origin_name) or '').strip()
    route.destination_name = (data.get('destination_name', route.destination_name) or '').strip()
    if 'color' in data and data.get('color'):
        route.color = data['color']
    if 'total_distance_km' in data:
        route.total_distance_km = data['total_distance_km'] or None
    if 'estimated_duration_mins' in data:
        route.estimated_duration_mins = data['estimated_duration_mins'] or None
    if 'is_active' in data:
        route.is_active = bool(data['is_active'])
    if 'is_published' in data:
        route.is_published = bool(data['is_published'])
    route.save()

    # Handle trips for shuttle/metro
    if 'trips' in data and isinstance(data['trips'], list):
        kept_ids = []
        for idx, t in enumerate(data['trips'], start=1):
            dep = t.get('departure_time')
            if not dep:
                continue
            arr = t.get('arrival_time') or None
            t_id = t.get('id')
            trip_num = int(t.get('trip_number') or idx)
            trip_name = (t.get('name') or f"Trip {trip_num:02d}").strip()
            if t_id:
                trip = Trip.objects.filter(pk=t_id, route=route).first()
                if trip:
                    trip.name = trip_name
                    trip.trip_number = trip_num
                    trip.departure_time = dep
                    trip.arrival_time = arr
                    trip.order = idx
                    trip.save()
                    kept_ids.append(trip.id)
                    continue
            trip = Trip.objects.create(
                route=route,
                name=trip_name,
                trip_number=trip_num,
                departure_time=dep,
                arrival_time=arr,
                order=idx,
                is_active=True,
            )
            kept_ids.append(trip.id)
        route.trips.exclude(id__in=kept_ids).delete()

    # Handle pickup stops for long road
    if 'stops' in data and isinstance(data['stops'], list):
        # First clear order collisions by removing unkept stops and temporarily shifting order
        kept_ids = [s['id'] for s in data['stops'] if s.get('id')]
        route.stops.exclude(id__in=kept_ids).delete()
        # Shift existing orders high to avoid unique_together(route, order) collisions during reorder
        for s_obj in route.stops.all():
            s_obj.order = s_obj.order + 10000
            s_obj.save(update_fields=['order'])

        final_ids = []
        for idx, s in enumerate(data['stops'], start=1):
            name = (s.get('name') or '').strip()
            if not name:
                continue
            s_id = s.get('id')
            lat = s.get('latitude') if s.get('latitude') not in (None, '') else 23.8103
            lng = s.get('longitude') if s.get('longitude') not in (None, '') else 90.4125
            sched_time = s.get('scheduled_time') or None
            wait = int(s.get('average_wait_time') or 2)
            is_major = bool(s.get('is_major_stop', False))

            if s_id:
                stop = Stop.objects.filter(pk=s_id, route=route).first()
                if stop:
                    stop.name = name
                    stop.latitude = lat
                    stop.longitude = lng
                    stop.order = idx
                    stop.scheduled_time = sched_time
                    stop.average_wait_time = wait
                    stop.is_major_stop = is_major
                    stop.save()
                    final_ids.append(stop.id)
                    continue

            stop = Stop.objects.create(
                route=route,
                name=name,
                latitude=lat,
                longitude=lng,
                order=idx,
                scheduled_time=sched_time,
                average_wait_time=wait,
                is_major_stop=is_major,
            )
            final_ids.append(stop.id)
        route.stops.exclude(id__in=final_ids).delete()

    return route


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def route_list_api(request):
    if request.method == 'GET':
        routes = Route.objects.prefetch_related('stops', 'trips__stop_times', 'assignments__bus', 'assignments__driver').all()

        status_filter = request.GET.get('status')
        if status_filter == 'active':
            routes = routes.filter(is_active=True)
        elif status_filter == 'inactive':
            routes = routes.filter(is_active=False)

        if request.GET.get('published') == 'true':
            routes = routes.filter(is_published=True, is_active=True)

        route_type = request.GET.get('type')
        if route_type in ('shuttle', 'metro', 'long'):
            routes = routes.filter(route_type=route_type)

        search = (request.GET.get('search') or '').strip()
        if search:
            routes = routes.filter(
                Q(name__icontains=search)
                | Q(origin_name__icontains=search)
                | Q(destination_name__icontains=search)
                | Q(stops__name__icontains=search)
            ).distinct()

        serializer = RouteSerializer(routes, many=True)
        return Response(serializer.data)

    # POST: Admin Route Builder create
    if not request.user.is_admin_user:
        return Response({'error': 'Only admins can create routes.'}, status=status.HTTP_403_FORBIDDEN)

    name = (request.data.get('name') or '').strip()
    if not name:
        return Response({'error': 'Route name is required.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        route = Route(
            name=name,
            route_type=request.data.get('route_type', 'shuttle'),
            color=request.data.get('color') or ('#0d6efd' if request.data.get('route_type') == 'long' else '#ffc107'),
            is_active=True,
            is_published=bool(request.data.get('is_published', True)),
        )
        _save_route_builder(route, request.data)

    return Response(RouteSerializer(route).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def route_detail_api(request, pk):
    route = get_object_or_404(
        Route.objects.prefetch_related('stops', 'trips__stop_times', 'schedules', 'assignments__bus', 'assignments__driver'),
        pk=pk
    )

    if request.method == 'GET':
        data = RouteSerializer(route).data
        data['schedules'] = ScheduleSerializer(route.schedules.all(), many=True).data
        return Response(data)

    if not request.user.is_admin_user:
        return Response({'error': 'Only admins can modify or delete routes.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'DELETE':
        route.delete()
        return Response({'status': 'Route deleted successfully.'})

    with transaction.atomic():
        _save_route_builder(route, request.data)

    route.refresh_from_db()
    return Response(RouteSerializer(route).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def publish_route_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
    route = get_object_or_404(Route, pk=pk)
    route.is_published = True
    route.is_active = True
    route.save()
    return Response(RouteSerializer(route).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def unpublish_route_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
    route = get_object_or_404(Route, pk=pk)
    route.is_published = False
    route.is_active = False
    route.save()
    return Response(RouteSerializer(route).data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def route_stops_api(request, pk):
    route = get_object_or_404(Route, pk=pk)

    if request.method == 'GET':
        stops = route.stops.order_by('order')
        return Response(StopSerializer(stops, many=True).data)

    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    data = request.data.copy()
    if 'order' not in data or not data.get('order'):
        data['order'] = route.stops.count() + 1
    serializer = StopSerializer(data=data)
    if serializer.is_valid():
        stop = serializer.save(route=route)
        return Response(StopSerializer(stop).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def stop_detail_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    stop = get_object_or_404(Stop, pk=pk)
    if request.method == 'DELETE':
        stop.delete()
        return Response({'status': 'Stop deleted.'})

    serializer = StopSerializer(stop, data=request.data, partial=(request.method == 'PATCH'))
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def route_trips_api(request, pk):
    route = get_object_or_404(Route, pk=pk)

    if request.method == 'GET':
        return Response(TripSerializer(route.trips.all(), many=True).data)

    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    serializer = TripSerializer(data=request.data)
    if serializer.is_valid():
        trip = serializer.save(route=route)
        return Response(TripSerializer(trip).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def trip_detail_api(request, pk):
    trip = get_object_or_404(Trip.objects.prefetch_related('stop_times__stop'), pk=pk)

    if request.method == 'GET':
        return Response(TripSerializer(trip).data)

    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'DELETE':
        trip.delete()
        return Response({'status': 'Trip deleted.'})

    serializer = TripSerializer(trip, data=request.data, partial=(request.method == 'PATCH'))
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trip_stop_add_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    trip = get_object_or_404(Trip, pk=pk)
    serializer = TripStopTimeSerializer(data=request.data)
    if serializer.is_valid():
        tst = serializer.save(trip=trip)
        return Response(TripStopTimeSerializer(tst).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def trip_stop_delete_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    tst = get_object_or_404(TripStopTime, pk=pk)
    tst.delete()
    return Response({'status': 'Trip stop time deleted.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_with_eta_api(request, pk):
    route = get_object_or_404(Route.objects.prefetch_related('stops'), pk=pk)

    stops_data = []
    for stop in route.stops.order_by('order'):
        eta_record = ETACalculation.objects.filter(stop=stop).order_by('-calculated_at').first()

        stop_info = {
            'id': stop.id,
            'name': stop.name,
            'order': stop.order,
            'scheduled_time': stop.scheduled_time.strftime('%H:%M') if stop.scheduled_time else None,
            'is_major_stop': stop.is_major_stop,
            'eta': None,
            'eta_minutes': None,
            'is_delayed': False,
            'delay_minutes': 0
        }

        if eta_record:
            stop_info['eta'] = eta_record.calculated_eta.strftime('%H:%M')
            diff = int((eta_record.calculated_eta - timezone.now()).total_seconds() / 60)
            stop_info['eta_minutes'] = max(0, diff)
            stop_info['is_delayed'] = eta_record.is_delayed
            stop_info['delay_minutes'] = eta_record.delay_minutes

        stops_data.append(stop_info)

    return Response({
        'id': route.id,
        'name': route.name,
        'stops': stops_data
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def schedule_list_api(request):
    if request.method == 'POST':
        if not request.user.is_admin_user:
            return Response({'error': 'Only admins can create schedules.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = ScheduleSerializer(data=request.data)
        if serializer.is_valid():
            schedule = serializer.save()
            return Response(ScheduleSerializer(schedule).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    day = request.GET.get('day')
    route_id = request.GET.get('route')

    assigned_route_ids = BusAssignment.objects.filter(is_active=True).values_list('route_id', flat=True)
    schedules = Schedule.objects.select_related('route', 'bus', 'driver').filter(
        is_active=True,
        route_id__in=assigned_route_ids
    )

    if day:
        schedules = schedules.filter(day_of_week=day)
    if route_id:
        schedules = schedules.filter(route_id=route_id)

    serializer = ScheduleSerializer(schedules, many=True)
    return Response(serializer.data)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def schedule_detail_api(request, pk):
    schedule = get_object_or_404(Schedule, pk=pk)

    if request.method == 'GET':
        return Response(ScheduleSerializer(schedule).data)

    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'DELETE':
        schedule.delete()
        return Response({'status': 'Schedule deleted.'})

    serializer = ScheduleSerializer(schedule, data=request.data, partial=(request.method == 'PATCH'))
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def today_schedules_api(request):
    days_map = {0: 'mon', 1: 'tue', 2: 'wed', 3: 'thu', 4: 'fri', 5: 'sat', 6: 'sun'}
    today = days_map[timezone.now().weekday()]

    assigned_route_ids = BusAssignment.objects.filter(is_active=True).values_list('route_id', flat=True)
    schedules = Schedule.objects.select_related('route', 'bus', 'driver').filter(
        is_active=True,
        day_of_week=today,
        route_id__in=assigned_route_ids
    ).order_by('departure_time')

    serializer = ScheduleSerializer(schedules, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def grouped_schedules_api(request):
    """Return active published routes grouped by shuttle, metro, and long road."""
    include_unassigned = request.GET.get('include_unassigned') == 'true'
    search = (request.GET.get('search') or '').strip()

    routes = Route.objects.filter(is_active=True, is_published=True).prefetch_related(
        'stops', 'trips__stop_times', 'assignments__bus', 'assignments__driver'
    )

    if not include_unassigned:
        assigned_route_ids = BusAssignment.objects.filter(is_active=True).values_list('route_id', flat=True)
        routes = routes.filter(id__in=assigned_route_ids)

    if search:
        routes = routes.filter(
            Q(name__icontains=search)
            | Q(origin_name__icontains=search)
            | Q(destination_name__icontains=search)
            | Q(stops__name__icontains=search)
        ).distinct()

    serialized = RouteSerializer(routes, many=True).data
    grouped = {
        'shuttle': [r for r in serialized if r['route_type'] == 'shuttle'],
        'metro': [r for r in serialized if r['route_type'] == 'metro'],
        'long': [r for r in serialized if r['route_type'] == 'long'],
        'all': serialized,
    }
    return Response(grouped)
