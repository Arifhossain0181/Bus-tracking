from rest_framework import serializers
from .models import Route, Stop, Schedule, StopSchedule

class StopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stop
        fields = ['id', 'name', 'latitude', 'longitude', 'order', 'scheduled_time', 
                  'average_wait_time', 'is_major_stop']


class RouteSerializer(serializers.ModelSerializer):
    stops = StopSerializer(many=True, read_only=True)
    stops_count = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = ['id', 'name', 'description', 'color', 'is_active', 'total_distance_km',
                  'estimated_duration_mins', 'stops', 'stops_count']

    def get_stops_count(self, obj):
        return obj.stops.count()


class ScheduleSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True)
    day_display = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = Schedule
        fields = ['id', 'route', 'route_name', 'day_of_week', 'day_display',
                  'departure_time', 'arrival_time', 'is_active', 'notes']


class StopScheduleSerializer(serializers.ModelSerializer):
    stop_name = serializers.CharField(source='stop.name', read_only=True)

    class Meta:
        model = StopSchedule
        fields = ['id', 'stop', 'stop_name', 'scheduled_arrival', 'scheduled_departure']


class RouteWithETASerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    stops = serializers.ListField()
