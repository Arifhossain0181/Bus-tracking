from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from .models import DriverLocation, LocationHistory
from .serializers import DriverLocationSerializer, LocationUpdateSerializer
from buses.models import Journey, BusAssignment
from notifications.models import Notification

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_journey(request):
    """Start a new journey - creates journey record and begins location sharing."""
    if request.user.role != 'driver':
        return Response(
            {'error': 'Only drivers can start journeys'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Check for existing active journey
    active_journey = Journey.get_active_journey(request.user)
    if active_journey:
        return Response({
            'error': 'You already have an active journey',
            'journey_id': active_journey.id
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Get active assignment
    try:
        assignment = BusAssignment.objects.get(driver=request.user, is_active=True)
    except BusAssignment.DoesNotExist:
        return Response({
            'error': 'No active bus assignment found'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Get initial location from request
    latitude = request.data.get('latitude')
    longitude = request.data.get('longitude')
    
    # Create journey
    journey = Journey.objects.create(
        driver=request.user,
        bus=assignment.bus,
        route=assignment.route,
        assignment=assignment,
        status='active',
        start_latitude=latitude,
        start_longitude=longitude
    )
    
    # Create/update driver location with journey reference
    location, created = DriverLocation.objects.update_or_create(
        driver=request.user,
        defaults={
            'latitude': latitude or 0,
            'longitude': longitude or 0,
            'is_sharing': True,
            'session_started': timezone.now(),
            'journey': journey
        }
    )
    
    # Create notification for journey start
    Notification.create_journey_notification(journey, 'journey_start', request.user)
    
    return Response({
        'status': 'success',
        'message': 'Journey started',
        'journey_id': journey.id,
        'bus_number': assignment.bus.bus_number,
        'route_name': assignment.route.name
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def end_journey(request):
    """End the current journey - stops location sharing."""
    if request.user.role != 'driver':
        return Response(
            {'error': 'Only drivers can end journeys'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Get active journey
    journey = Journey.get_active_journey(request.user)
    if not journey:
        return Response({
            'error': 'No active journey found'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Get final location from request
    latitude = request.data.get('latitude')
    longitude = request.data.get('longitude')
    
    # Update journey
    journey.status = 'completed'
    journey.end_time = timezone.now()
    journey.end_latitude = latitude
    journey.end_longitude = longitude
    journey.save()
    
    # Stop location sharing
    try:
        location = DriverLocation.objects.get(driver=request.user)
        location.is_sharing = False
        location.journey = None
        location.save()
    except DriverLocation.DoesNotExist:
        pass
    
    # Create notification for journey end
    Notification.create_journey_notification(journey, 'journey_end', request.user)
    
    duration = journey.duration_minutes
    
    return Response({
        'status': 'success',
        'message': 'Journey ended',
        'journey_id': journey.id,
        'duration_minutes': duration
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_location(request):
    """Update driver's live location during active journey."""
    if request.user.role != 'driver':
        return Response(
            {'error': 'Only drivers can share location'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Check for active journey
    journey = Journey.get_active_journey(request.user)
    if not journey:
        return Response({
            'error': 'No active journey. Start a journey first.'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    serializer = LocationUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    data = serializer.validated_data
    
    # Update or create driver location
    location, created = DriverLocation.objects.update_or_create(
        driver=request.user,
        defaults={
            'latitude': data['latitude'],
            'longitude': data['longitude'],
            'accuracy': data.get('accuracy'),
            'heading': data.get('heading'),
            'speed': data.get('speed'),
            'is_sharing': True,
            'journey': journey
        }
    )
    
    # Store in history for analytics
    LocationHistory.objects.create(
        driver=request.user,
        latitude=data['latitude'],
        longitude=data['longitude']
    )
    
    return Response({
        'status': 'success',
        'message': 'Location updated',
        'timestamp': location.last_updated.isoformat()
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_sharing(request):
    """Legacy: Start location sharing session."""
    # Redirect to start_journey for proper journey tracking
    return start_journey(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def stop_sharing(request):
    """Legacy: Stop location sharing session."""
    # Redirect to end_journey for proper journey tracking
    return end_journey(request)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_active_locations(request):
    """Get all active driver locations with journey info."""
    # Expire stale locations first
    DriverLocation.expire_inactive()
    
    active_locations = DriverLocation.get_active_drivers()
    
    result = []
    for loc in active_locations:
        data = {
            'driver_id': loc.driver.id,
            'driver_name': loc.driver.get_full_name() or loc.driver.username,
            'latitude': float(loc.latitude),
            'longitude': float(loc.longitude),
            'heading': loc.heading,
            'speed': loc.speed,
            'last_updated': loc.last_updated.isoformat(),
            'is_active': loc.is_active,
        }
        
        if loc.journey:
            data['bus_number'] = loc.journey.bus.bus_number
            data['route_name'] = loc.journey.route.name
            data['route_id'] = loc.journey.route.id
            data['journey_id'] = loc.journey.id
            data['journey_start'] = loc.journey.start_time.isoformat()
        
        result.append(data)
    
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_my_location_status(request):
    """Get current user's location/journey status."""
    if request.user.role != 'driver':
        return Response(
            {'error': 'Only drivers have location status'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Check for active journey
    journey = Journey.get_active_journey(request.user)
    
    try:
        location = DriverLocation.objects.get(driver=request.user)
        return Response({
            'is_sharing': location.is_sharing,
            'is_active': location.is_active,
            'has_active_journey': journey is not None,
            'journey_id': journey.id if journey else None,
            'bus_number': journey.bus.bus_number if journey else None,
            'route_name': journey.route.name if journey else None,
            'journey_start': journey.start_time.isoformat() if journey else None,
            'last_updated': location.last_updated.isoformat() if location.last_updated else None,
            'session_started': location.session_started.isoformat() if location.session_started else None
        })
    except DriverLocation.DoesNotExist:
        return Response({
            'is_sharing': False,
            'is_active': False,
            'has_active_journey': journey is not None,
            'journey_id': journey.id if journey else None,
            'last_updated': None,
            'session_started': None
        })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_delay(request):
    """Report a delay on current journey."""
    if request.user.role != 'driver':
        return Response(
            {'error': 'Only drivers can report delays'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    journey = Journey.get_active_journey(request.user)
    if not journey:
        return Response({
            'error': 'No active journey'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    delay_minutes = request.data.get('delay_minutes', 10)
    reason = request.data.get('reason', '')
    
    # Create delay notification
    Notification.create_delay_notification(
        driver=request.user,
        bus=journey.bus,
        route=journey.route,
        delay_minutes=delay_minutes,
        reason=reason
    )
    
    return Response({
        'status': 'success',
        'message': 'Delay reported'
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_journey_path(request, journey_id):
    """Get the path (location history) for a specific journey."""
    if request.user.role not in ['admin', 'authority']:
        return Response(
            {'error': 'Only admin and authority can view journey paths'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    try:
        journey = Journey.objects.get(id=journey_id)
    except Journey.DoesNotExist:
        return Response({
            'error': 'Journey not found'
        }, status=status.HTTP_404_NOT_FOUND)
    
    # Get location history for this journey's time range
    locations = LocationHistory.objects.filter(
        driver=journey.driver,
        timestamp__gte=journey.start_time
    )
    
    if journey.end_time:
        locations = locations.filter(timestamp__lte=journey.end_time)
    
    locations = locations.order_by('timestamp')
    
    path = [{
        'lat': float(loc.latitude),
        'lng': float(loc.longitude),
        'timestamp': loc.timestamp.isoformat()
    } for loc in locations]
    
    return Response({
        'journey_id': journey.id,
        'driver': journey.driver.get_full_name() or journey.driver.username,
        'bus_number': journey.bus.bus_number,
        'route_name': journey.route.name,
        'start_time': journey.start_time.isoformat(),
        'end_time': journey.end_time.isoformat() if journey.end_time else None,
        'status': journey.status,
        'path': path
    })
