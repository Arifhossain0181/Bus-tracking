from rest_framework import serializers
from .models import Bus, BusLocation, BusAssignment, ETACalculation

class BusLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusLocation
        fields = ['id', 'bus', 'latitude', 'longitude', 'speed', 'heading', 'timestamp']
        read_only_fields = ['id', 'timestamp']


class BusSerializer(serializers.ModelSerializer):
    latest_location = BusLocationSerializer(read_only=True)
    route_name = serializers.CharField(source='current_route.name', read_only=True)

    class Meta:
        model = Bus
        fields = ['id', 'bus_number', 'license_plate', 'capacity', 'model', 'year', 
                  'is_active', 'current_route', 'route_name', 'latest_location']


class BusLocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    speed = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)
    heading = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)


class BusAssignmentSerializer(serializers.ModelSerializer):
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    driver_name = serializers.CharField(source='driver.get_full_name', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)

    class Meta:
        model = BusAssignment
        fields = ['id', 'bus', 'bus_number', 'driver', 'driver_name', 'route', 
                  'route_name', 'date', 'shift_start', 'shift_end', 'is_active']


class ETASerializer(serializers.ModelSerializer):
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    stop_name = serializers.CharField(source='stop.name', read_only=True)

    class Meta:
        model = ETACalculation
        fields = ['id', 'bus', 'bus_number', 'stop', 'stop_name', 'calculated_eta',
                  'scheduled_time', 'distance_km', 'is_delayed', 'delay_minutes']


class BusMapDataSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    bus_number = serializers.CharField()
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    route_name = serializers.CharField()
    eta = serializers.CharField()
    speed = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
