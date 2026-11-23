import datetime
from decimal import Decimal
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from core.throttling import TelemetryRateThrottle
from .models import DriverLocation, LocationHistory
from .serializers import DriverLocationSerializer, LocationUpdateSerializer
from .services import record_driver_gps, _to_decimal
from buses.models import Journey, BusAssignment, BusLocation
from notifications.models import Notification
from reports.services import sync_journey_to_trip_log

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_journey(request):
    """Start a new journey - creates journey record and begins location sharing."""
    if request.user.role != 'driver':
        return Response(
            {'error': 'Only drivers can start journeys'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    with transaction.atomic():
        # Check for existing active journey for this driver (locked)
        active_journey = Journey.objects.select_for_update().filter(driver=request.user, status='active').first()
        if active_journey:
            return Response({
                'error': 'You already have an active journey',
                'journey_id': active_journey.id
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get active assignment
        try:
            assignment = BusAssignment.objects.select_related('bus', 'route').get(driver=request.user, is_active=True)
        except BusAssignment.DoesNotExist:
            return Response({
                'error': 'No active bus assignment found'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if the bus already has an active journey (e.g. from another session)
        bus_active = Journey.objects.select_for_update().filter(bus=assignment.bus, status='active').first()
        if bus_active:
            return Response({
                'error': f'Bus {assignment.bus.bus_number} already has an active journey (ID #{bus_active.id})',
                'journey_id': bus_active.id
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate coordinates if provided
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        accuracy = request.data.get('accuracy')
        speed = request.data.get('speed')
        heading = request.data.get('heading')
        notes = request.data.get('notes', '')

        dec_lat = None
        dec_lon = None
        has_coords = (latitude is not None or longitude is not None)

        if has_coords:
            if latitude is None or longitude is None:
                return Response(
                    {'error': 'Both latitude and longitude must be provided.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            dec_lat = _to_decimal(latitude, max_digits=10, decimal_places=7)
            dec_lon = _to_decimal(longitude, max_digits=10, decimal_places=7)
            if dec_lat is None or dec_lon is None:
                return Response(
                    {'error': 'Valid numeric latitude and longitude are required.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if dec_lat < Decimal('-90.0') or dec_lat > Decimal('90.0'):
                return Response(
                    {'error': 'Latitude must be between -90 and 90 degrees.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if dec_lon < Decimal('-180.0') or dec_lon > Decimal('180.0'):
                return Response(
                    {'error': 'Longitude must be between -180 and 180 degrees.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if dec_lat == Decimal('0') and dec_lon == Decimal('0'):
                return Response(
                    {'error': 'Invalid coordinates: Null Island (0, 0) is rejected.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Validate optional metrics
        acc_val = None
        if accuracy is not None:
            try:
                acc_val = float(accuracy)
                if acc_val < 0 or acc_val > 5000:
                    return Response(
                        {'error': 'Accuracy must be between 0 and 5000 meters.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid accuracy value.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        spd_val = None
        dec_speed = None
        if speed is not None:
            try:
                spd_val = float(speed)
                if spd_val < 0 or spd_val > 150:
                    return Response(
                        {'error': 'Speed must be between 0 and 150 m/s.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                dec_speed = _to_decimal(speed, max_digits=5, decimal_places=2)
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid speed value.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        hdg_val = None
        dec_heading = None
        if heading is not None:
            try:
                hdg_val = float(heading)
                if hdg_val < 0 or hdg_val > 360:
                    return Response(
                        {'error': 'Heading must be between 0 and 360 degrees.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                dec_heading = _to_decimal(heading, max_digits=5, decimal_places=2)
            except (ValueError, TypeError):
                return Response(
                    {'error': 'Invalid heading value.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Create journey
        active_rev = None
        if assignment.route and hasattr(assignment.route, 'active_revision') and assignment.route.active_revision:
            if assignment.route.active_revision.status == 'published':
                active_rev = assignment.route.active_revision
        journey = Journey.objects.create(
            driver=request.user,
            bus=assignment.bus,
            route=assignment.route,
            route_revision=active_rev,
            assignment=assignment,
            status='active',
            start_time=timezone.now(),
            start_latitude=dec_lat,
            start_longitude=dec_lon,
            notes=notes
        )
        
        # Create/update driver location with journey reference
        if dec_lat is not None and dec_lon is not None:
            defaults = {
                'is_sharing': True,
                'session_started': timezone.now(),
                'journey': journey,
                'latitude': dec_lat,
                'longitude': dec_lon,
                'accuracy': acc_val,
                'speed': spd_val,
                'heading': hdg_val,
            }
            location, created = DriverLocation.objects.update_or_create(
                driver=request.user,
                defaults=defaults
            )
            # If valid coordinates provided, record to history and sync initial BusLocation
            LocationHistory.objects.create(
                driver=request.user,
                latitude=dec_lat,
                longitude=dec_lon,
            )
            is_accurate = True if acc_val is None else (acc_val <= 50.0)
            BusLocation.objects.create(
                bus=assignment.bus,
                latitude=dec_lat,
                longitude=dec_lon,
                speed=dec_speed,
                heading=dec_heading,
                is_accurate=is_accurate,
                timestamp=timezone.now(),
            )
            if assignment.route and assignment.bus.current_route_id != assignment.route_id:
                assignment.bus.current_route = assignment.route
                assignment.bus.save(update_fields=['current_route'])
        else:
            # Safe design: Journey starts, but location-sharing remains inactive
            # until the first verified GPS fix is received via record_driver_gps.
            existing_loc = DriverLocation.objects.filter(driver=request.user).first()
            if existing_loc:
                existing_loc.journey = journey
                existing_loc.is_sharing = False
                existing_loc.session_started = timezone.now()
                existing_loc.save(update_fields=['journey', 'is_sharing', 'session_started'])
            # Never create or publish fake (0, 0) coordinates or use campus fallback.
        
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
    """End the current journey - stops location sharing and creates immutable trip history."""
    journey_id = request.data.get('journey_id')

    with transaction.atomic():
        if request.user.role in ['admin', 'authority'] and journey_id:
            journey = Journey.objects.select_for_update().filter(id=journey_id).first()
        else:
            if request.user.role != 'driver':
                return Response(
                    {'error': 'Only drivers or administrators can end journeys'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            journey = Journey.objects.select_for_update().filter(driver=request.user, status='active').first()
        
        if not journey:
            return Response({
                'error': 'No active journey found to end'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if journey.status != 'active':
            return Response({
                'error': f'Cannot end journey in "{journey.status}" status. Only active journeys can be ended.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get final location from request
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        notes = request.data.get('notes')
        
        end_time = timezone.now()
        if journey.start_time and end_time < journey.start_time:
            return Response({
                'error': f'Invalid timestamps: end time ({end_time.isoformat()}) cannot be earlier than start time ({journey.start_time.isoformat()}).'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update journey
        journey.status = 'completed'
        journey.end_time = end_time
        if latitude is not None:
            journey.end_latitude = latitude
        if longitude is not None:
            journey.end_longitude = longitude
        if notes:
            journey.notes = f"{journey.notes}\n{notes}".strip() if journey.notes else notes
        journey.save()
        
        # Stop location sharing
        DriverLocation.objects.filter(driver=journey.driver).update(
            is_sharing=False,
            journey=None
        )
        
        # Synchronize to TripLog
        sync_journey_to_trip_log(journey)
        
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
def abort_journey(request):
    """Abort an active journey due to breakdown, cancellation, or emergency."""
    journey_id = request.data.get('journey_id')
    reason = request.data.get('reason') or request.data.get('notes') or 'Aborted by operator'

    with transaction.atomic():
        if request.user.role in ['admin', 'authority'] and journey_id:
            journey = Journey.objects.select_for_update().filter(id=journey_id).first()
        else:
            if request.user.role != 'driver':
                return Response(
                    {'error': 'Only drivers or administrators can abort journeys'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            journey = Journey.objects.select_for_update().filter(driver=request.user, status='active').first()
        
        if not journey:
            return Response({
                'error': 'No active journey found to abort'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if journey.status != 'active':
            return Response({
                'error': f'Cannot abort journey in "{journey.status}" status. Only active journeys can be aborted.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        end_time = timezone.now()
        if journey.start_time and end_time < journey.start_time:
            return Response({
                'error': f'Invalid timestamps: end time ({end_time.isoformat()}) cannot be earlier than start time ({journey.start_time.isoformat()}).'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        journey.status = 'aborted'
        journey.end_time = end_time
        abort_note = f"[Aborted by {request.user.role}:{request.user.username}] Reason: {reason}"
        journey.notes = f"{journey.notes}\n{abort_note}".strip() if journey.notes else abort_note
        journey.save()
        
        # Stop location sharing
        DriverLocation.objects.filter(driver=journey.driver).update(
            is_sharing=False,
            journey=None
        )
        
        # Synchronize to TripLog (is_completed=False)
        sync_journey_to_trip_log(journey)
        
        # Create notification for journey abort
        Notification.create_journey_notification(journey, 'journey_end', request.user, reason=reason)
        
        duration = journey.duration_minutes
        
        return Response({
            'status': 'aborted',
            'message': f'Journey #{journey.id} aborted: {reason}',
            'journey_id': journey.id,
            'duration_minutes': duration
        })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([TelemetryRateThrottle])
def update_location(request):
    """Update driver's live location during active journey and sync to bus."""
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
    
    try:
        result = record_driver_gps(
            driver=request.user,
            latitude=data['latitude'],
            longitude=data['longitude'],
            accuracy=data.get('accuracy'),
            heading=data.get('heading'),
            speed=data.get('speed'),
            timestamp=data.get('timestamp'),
        )
        return Response(result)
    except ValueError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


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
        if loc.latitude == Decimal('0') and loc.longitude == Decimal('0'):
            continue
        data = {
            'driver_id': loc.driver.id,
            'driver_name': loc.driver.get_full_name() or loc.driver.username,
            'latitude': float(loc.latitude),
            'longitude': float(loc.longitude),
            'heading': loc.heading,
            'speed': loc.speed,
            'accuracy': loc.accuracy,
            'last_updated': loc.last_updated.isoformat(),
            'is_active': loc.is_active,
        }
        
        if loc.journey:
            if loc.journey.bus:
                data['bus_id'] = loc.journey.bus.id
                data['bus_number'] = loc.journey.bus.bus_number
            if loc.journey.route:
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
    
    # Get location history across active and archived tiers for this journey's time range
    from .archival_service import get_combined_location_history
    path = get_combined_location_history(
        driver=journey.driver,
        start_time=journey.start_time,
        end_time=journey.end_time
    )
    
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_journey_history(request):
    """List journey history with optional status and date range filters (admin/authority)."""
    if request.user.role not in ['admin', 'authority']:
        return Response(
            {'error': 'Only admin and authority can view journey history'},
            status=status.HTTP_403_FORBIDDEN
        )

    journeys = Journey.objects.select_related('driver', 'bus', 'route').order_by('-start_time')

    status_filter = request.GET.get('status')
    if status_filter in ['active', 'completed', 'aborted']:
        journeys = journeys.filter(status=status_filter)

    date_from = request.GET.get('date_from')
    if date_from:
        try:
            d_from = datetime.datetime.strptime(date_from, '%Y-%m-%d').date()
            dt_from = timezone.make_aware(datetime.datetime.combine(d_from, datetime.time.min))
            journeys = journeys.filter(start_time__gte=dt_from)
        except (ValueError, TypeError):
            pass

    date_to = request.GET.get('date_to')
    if date_to:
        try:
            d_to = datetime.datetime.strptime(date_to, '%Y-%m-%d').date()
            dt_next = timezone.make_aware(datetime.datetime.combine(d_to + datetime.timedelta(days=1), datetime.time.min))
            journeys = journeys.filter(start_time__lt=dt_next)
        except (ValueError, TypeError):
            pass

    result = [
        {
            'id': j.id,
            'driver_id': j.driver_id,
            'driver_name': j.driver.get_full_name() or j.driver.username,
            'bus_id': j.bus_id,
            'bus_number': j.bus.bus_number,
            'route_id': j.route_id,
            'route_name': j.route.name,
            'status': j.status,
            'start_time': j.start_time.isoformat(),
            'end_time': j.end_time.isoformat() if j.end_time else None,
            'duration_minutes': j.duration_minutes,
        }
        for j in journeys[:150]
    ]
    return Response(result)
