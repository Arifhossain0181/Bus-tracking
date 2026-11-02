from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from .models import Bus, BusLocation, BusAssignment, ETACalculation
from .serializers import BusSerializer, BusLocationSerializer, BusMapDataSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bus_locations(request):
    buses = Bus.objects.filter(is_active=True).select_related('current_route')
    data = []
    
    for bus in buses:
        location = bus.latest_location
        if location:
            data.append({
                'id': bus.id,
                'bus_number': bus.bus_number,
                'latitude': location.latitude,
                'longitude': location.longitude,
                'route_name': bus.current_route.name if bus.current_route else 'No Route',
                'eta': 'Calculating...',
                'speed': location.speed
            })
    
    serializer = BusMapDataSerializer(data, many=True)
    return Response(serializer.data)


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
    
    if not lat or not lng:
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
        from schedules.models import Stop
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
def bus_detail_api(request, pk):
    try:
        bus = Bus.objects.select_related('current_route').get(pk=pk)
    except Bus.DoesNotExist:
        return Response({'error': 'Bus not found'}, status=status.HTTP_404_NOT_FOUND)
    
    serializer = BusSerializer(bus)
    return Response(serializer.data)


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
