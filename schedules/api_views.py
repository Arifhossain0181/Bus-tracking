from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.utils import timezone
from .models import Route, Stop, Schedule
from .serializers import RouteSerializer, StopSerializer, ScheduleSerializer
from buses.models import ETACalculation

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_list_api(request):
    routes = Route.objects.filter(is_active=True).prefetch_related('stops')
    serializer = RouteSerializer(routes, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_detail_api(request, pk):
    try:
        route = Route.objects.prefetch_related('stops').get(pk=pk)
    except Route.DoesNotExist:
        return Response({'error': 'Route not found'}, status=status.HTTP_404_NOT_FOUND)
    
    serializer = RouteSerializer(route)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_stops_api(request, pk):
    try:
        route = Route.objects.get(pk=pk)
    except Route.DoesNotExist:
        return Response({'error': 'Route not found'}, status=status.HTTP_404_NOT_FOUND)
    
    stops = route.stops.order_by('order')
    serializer = StopSerializer(stops, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_with_eta_api(request, pk):
    try:
        route = Route.objects.prefetch_related('stops').get(pk=pk)
    except Route.DoesNotExist:
        return Response({'error': 'Route not found'}, status=status.HTTP_404_NOT_FOUND)
    
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
            stop_info['is_delayed'] = eta_record.is_delayed
            stop_info['delay_minutes'] = eta_record.delay_minutes
        
        stops_data.append(stop_info)
    
    return Response({
        'id': route.id,
        'name': route.name,
        'stops': stops_data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def schedule_list_api(request):
    """Get schedules - only for routes with active bus assignments."""
    from buses.models import BusAssignment
    
    day = request.GET.get('day')
    route_id = request.GET.get('route')
    
    # Get route IDs that have active bus assignments
    assigned_route_ids = BusAssignment.objects.filter(
        is_active=True
    ).values_list('route_id', flat=True)
    
    schedules = Schedule.objects.select_related('route').filter(
        is_active=True,
        route_id__in=assigned_route_ids
    )
    
    if day:
        schedules = schedules.filter(day_of_week=day)
    if route_id:
        schedules = schedules.filter(route_id=route_id)
    
    serializer = ScheduleSerializer(schedules, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def today_schedules_api(request):
    """Get today's schedules - only for routes with active bus assignments."""
    from buses.models import BusAssignment
    
    days_map = {0: 'mon', 1: 'tue', 2: 'wed', 3: 'thu', 4: 'fri', 5: 'sat', 6: 'sun'}
    today = days_map[timezone.now().weekday()]
    
    # Get route IDs that have active bus assignments
    assigned_route_ids = BusAssignment.objects.filter(
        is_active=True
    ).values_list('route_id', flat=True)
    
    schedules = Schedule.objects.select_related('route').filter(
        is_active=True,
        day_of_week=today,
        route_id__in=assigned_route_ids
    ).order_by('departure_time')
    
    serializer = ScheduleSerializer(schedules, many=True)
    return Response(serializer.data)
