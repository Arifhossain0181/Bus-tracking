from rest_framework import serializers
from .models import TripLog, UserFeedback, RouteAnalytics

class TripLogSerializer(serializers.ModelSerializer):
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)
    driver_name = serializers.CharField(source='driver.get_full_name', read_only=True)

    class Meta:
        model = TripLog
        fields = ['id', 'bus', 'bus_number', 'route', 'route_name', 'driver', 'driver_name',
                  'date', 'scheduled_departure', 'actual_departure', 'scheduled_arrival',
                  'actual_arrival', 'passenger_count', 'is_completed', 'is_on_time',
                  'departure_delay_mins']


class UserFeedbackSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = UserFeedback
        fields = ['id', 'user', 'user_name', 'route', 'bus', 'category', 'category_display',
                  'rating', 'comment', 'is_anonymous', 'is_resolved', 'admin_response', 'created_at']

    def get_user_name(self, obj):
        if obj.is_anonymous:
            return 'Anonymous'
        return obj.user.get_full_name() or obj.user.username


class RouteAnalyticsSerializer(serializers.ModelSerializer):
    route_name = serializers.CharField(source='route.name', read_only=True)

    class Meta:
        model = RouteAnalytics
        fields = ['id', 'route', 'route_name', 'date', 'total_trips', 'on_time_trips',
                  'delayed_trips', 'total_passengers', 'average_delay_mins', 'issues_count',
                  'on_time_percentage']
