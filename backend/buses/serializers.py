from rest_framework import serializers
from .models import Bus, BusLocation, BusAssignment, ETACalculation


class BusLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusLocation
        fields = ['id', 'bus', 'latitude', 'longitude', 'speed', 'heading', 'is_accurate', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class BusAssignmentSerializer(serializers.ModelSerializer):
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    driver_name = serializers.SerializerMethodField()
    driver_username = serializers.CharField(source='driver.username', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)

    class Meta:
        model = BusAssignment
        fields = [
            'id', 'bus', 'bus_number', 'driver', 'driver_name', 'driver_username',
            'route', 'route_name', 'date', 'shift_start', 'shift_end',
            'is_active', 'started_at', 'ended_at', 'created_at'
        ]

    def get_driver_name(self, obj):
        return obj.driver.get_full_name() or obj.driver.username


class BusSerializer(serializers.ModelSerializer):
    latest_location = BusLocationSerializer(read_only=True)
    route_name = serializers.CharField(source='current_route.name', read_only=True)
    bus_type_display = serializers.CharField(source='get_bus_type_display', read_only=True)
    active_assignment = serializers.SerializerMethodField()
    active_journey = serializers.SerializerMethodField()
    latest_journey = serializers.SerializerMethodField()

    class Meta:
        model = Bus
        fields = [
            'id', 'bus_number', 'license_plate', 'bus_type', 'bus_type_display',
            'capacity', 'model', 'year', 'is_active', 'current_route',
            'route_name', 'current_trip', 'latest_location', 'active_assignment',
            'active_journey', 'latest_journey',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_active_assignment(self, obj):
        assignment = obj.assignments.filter(is_active=True).select_related('driver', 'route').first()
        if not assignment:
            return None
        return BusAssignmentSerializer(assignment).data

    def get_active_journey(self, obj):
        journey = obj.journeys.filter(status='active').select_related('driver').first()
        if not journey:
            return None
        return {
            'id': journey.id,
            'driver_id': journey.driver_id,
            'driver_name': journey.driver.get_full_name() or journey.driver.username,
            'status': journey.status,
            'start_time': journey.start_time.isoformat() if journey.start_time else None,
        }

    def get_latest_journey(self, obj):
        journey = obj.journeys.order_by('-start_time').first()
        if not journey:
            return None
        return {
            'id': journey.id,
            'status': journey.status,
            'start_time': journey.start_time.isoformat() if journey.start_time else None,
            'end_time': journey.end_time.isoformat() if journey.end_time else None,
        }


class BusLocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    speed = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    heading = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)


class ETASerializer(serializers.ModelSerializer):
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    stop_name = serializers.CharField(source='stop.name', read_only=True)

    class Meta:
        model = ETACalculation
        fields = [
            'id', 'bus', 'bus_number', 'stop', 'stop_name', 'calculated_eta',
            'scheduled_time', 'distance_km', 'is_delayed', 'delay_minutes'
        ]


class BusMapDataSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    bus_number = serializers.CharField()
    bus_type = serializers.CharField()
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    route_name = serializers.CharField()
    next_stop = serializers.CharField(allow_null=True)
    eta = serializers.CharField()
    speed = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
