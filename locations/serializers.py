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
