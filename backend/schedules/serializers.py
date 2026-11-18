from rest_framework import serializers
from .models import Route, Stop, Schedule, StopSchedule, Trip, TripStopTime


class StopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stop
        fields = [
            'id', 'route', 'name', 'latitude', 'longitude', 'order',
            'scheduled_time', 'average_wait_time', 'is_major_stop'
        ]
        read_only_fields = ['id', 'route']


class TripStopTimeSerializer(serializers.ModelSerializer):
    stop_name = serializers.CharField(source='stop.name', read_only=True)

    class Meta:
        model = TripStopTime
        fields = ['id', 'trip', 'stop', 'stop_name', 'arrival_time', 'departure_time', 'order']
        read_only_fields = ['id', 'trip']


class TripSerializer(serializers.ModelSerializer):
    formatted_trip_number = serializers.CharField(read_only=True)
    stop_times = TripStopTimeSerializer(many=True, read_only=True)

    class Meta:
        model = Trip
        fields = [
            'id', 'route', 'name', 'trip_number', 'formatted_trip_number',
            'departure_time', 'arrival_time', 'is_active', 'order', 'stop_times'
        ]
        read_only_fields = ['id', 'route']


class ScheduleSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True)
    day_display = serializers.CharField(source='get_day_of_week_display', read_only=True)
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    driver_name = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id', 'route', 'route_name', 'bus', 'bus_number', 'driver', 'driver_name',
            'day_of_week', 'day_display', 'departure_time', 'arrival_time',
            'is_active', 'notes'
        ]

    def get_driver_name(self, obj):
        if obj.driver:
            return obj.driver.get_full_name() or obj.driver.username
        return None


class RouteSerializer(serializers.ModelSerializer):
    stops = StopSerializer(many=True, read_only=True)
    trips = TripSerializer(many=True, read_only=True)
    stops_count = serializers.SerializerMethodField()
    trips_count = serializers.SerializerMethodField()
    route_type_display = serializers.CharField(source='get_route_type_display', read_only=True)
    service_days_display = serializers.CharField(source='get_service_days_display', read_only=True)
    active_assignments = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = [
            'id', 'name', 'description', 'route_type', 'route_type_display',
            'color', 'is_active', 'is_published', 'total_distance_km',
            'estimated_duration_mins', 'service_days', 'service_days_display',
            'custom_days', 'origin_name', 'destination_name',
            'stops', 'trips', 'stops_count', 'trips_count', 'active_assignments',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_stops_count(self, obj):
        return obj.stops.count()

    def get_trips_count(self, obj):
        return obj.trips.count()

    def get_active_assignments(self, obj):
        from locations.models import DriverLocation
        assignments = obj.assignments.filter(is_active=True).select_related('bus', 'driver')
        results = []
        for a in assignments:
            loc = DriverLocation.objects.filter(driver=a.driver).first()
            results.append({
                'id': a.id,
                'bus_id': a.bus_id,
                'bus_number': a.bus.bus_number,
                'driver_id': a.driver_id,
                'driver_name': a.driver.get_full_name() or a.driver.username,
                'driver_is_live': bool(loc and loc.is_active),
            })
        return results


class StopScheduleSerializer(serializers.ModelSerializer):
    stop_name = serializers.CharField(source='stop.name', read_only=True)

    class Meta:
        model = StopSchedule
        fields = ['id', 'stop', 'stop_name', 'scheduled_arrival', 'scheduled_departure']
