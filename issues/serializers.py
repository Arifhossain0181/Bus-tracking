from rest_framework import serializers
from .models import Issue, IssueComment

class IssueCommentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)

    class Meta:
        model = IssueComment
        fields = ['id', 'user', 'user_name', 'comment', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class IssueSerializer(serializers.ModelSerializer):
    reported_by_name = serializers.CharField(source='reported_by.get_full_name', read_only=True)
    bus_number = serializers.CharField(source='bus.bus_number', read_only=True)
    route_name = serializers.CharField(source='route.name', read_only=True)
    issue_type_display = serializers.CharField(source='get_issue_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    comments = IssueCommentSerializer(many=True, read_only=True)

    class Meta:
        model = Issue
        fields = ['id', 'issue_type', 'issue_type_display', 'description', 'reported_by',
                  'reported_by_name', 'bus', 'bus_number', 'route', 'route_name',
                  'latitude', 'longitude', 'status', 'status_display', 'priority',
                  'assigned_to', 'resolution_notes', 'created_at', 'updated_at',
                  'resolved_at', 'comments']


class IssueCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Issue
        fields = ['issue_type', 'description', 'latitude', 'longitude']
