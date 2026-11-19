from decimal import Decimal
from rest_framework import serializers
from .models import DriverLocation

class DriverLocationSerializer(serializers.ModelSerializer):
    driver_id = serializers.IntegerField(source='driver.id', read_only=True)
    driver_name = serializers.CharField(source='driver.get_full_name', read_only=True)
    driver_username = serializers.CharField(source='driver.username', read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    route_name = serializers.SerializerMethodField()

    class Meta:
        model = DriverLocation
        fields = [
            'id', 'driver_id', 'driver_name', 'driver_username',
            'latitude', 'longitude', 'accuracy', 'heading', 'speed',
            'is_sharing', 'is_active', 'last_updated', 'route_name'
        ]

    def get_route_name(self, obj):
        # Get current route assignment if exists
        try:
            from buses.models import BusAssignment
            assignment = BusAssignment.objects.filter(
                driver=obj.driver, 
                is_active=True
            ).select_related('route').first()
            if assignment and assignment.route:
                return assignment.route.name
        except:
            pass
        return None


class LocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7)
    accuracy = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)
    speed = serializers.FloatField(required=False, allow_null=True)

    def validate_latitude(self, value):
        if value < Decimal('-90.0') or value > Decimal('90.0'):
            raise serializers.ValidationError('Latitude must be between -90 and 90 degrees.')
        return value

    def validate_longitude(self, value):
        if value < Decimal('-180.0') or value > Decimal('180.0'):
            raise serializers.ValidationError('Longitude must be between -180 and 180 degrees.')
        return value

    def validate_speed(self, value):
        if value is not None:
            if value < 0:
                raise serializers.ValidationError('Speed cannot be negative.')
            if value > 150:  # ~540 km/h realistic upper bound
                raise serializers.ValidationError('Speed exceeds realistic ground vehicle limits (max 150 m/s).')
        return value

    def validate_heading(self, value):
        if value is not None:
            if value < 0 or value > 360:
                raise serializers.ValidationError('Heading must be between 0 and 360 degrees.')
        return value

    def validate_accuracy(self, value):
        if value is not None:
            if value < 0:
                raise serializers.ValidationError('Accuracy cannot be negative.')
            if value > 5000:
                raise serializers.ValidationError('GPS accuracy error exceeds acceptable range (>5000m).')
        return value

    def validate(self, attrs):
        lat = attrs.get('latitude')
        lng = attrs.get('longitude')
        if lat == Decimal('0') and lng == Decimal('0'):
            raise serializers.ValidationError('Invalid coordinates: Null Island (0, 0) is rejected.')
        return attrs
