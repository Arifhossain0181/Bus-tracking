from rest_framework import serializers
from .models import Notification, UserNotification

class NotificationSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    route_name = serializers.CharField(source='target_route.name', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'title', 'message', 'priority', 'target', 'target_route',
                  'route_name', 'created_by', 'created_by_name', 'is_active',
                  'expires_at', 'created_at']


class UserNotificationSerializer(serializers.ModelSerializer):
    notification = NotificationSerializer(read_only=True)

    class Meta:
        model = UserNotification
        fields = ['id', 'notification', 'is_read', 'read_at']
