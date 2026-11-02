from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from django.db import models
from .models import Notification, UserNotification
from .serializers import NotificationSerializer, UserNotificationSerializer
from .api_dismiss import dismiss_notification_api

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notification_list_api(request):
    user = request.user
    
    notifications = Notification.objects.filter(is_active=True)
    
    if user.role == 'admin':
        notifications = notifications.filter(target__in=['all', 'admin', 'admin_authority'])
    elif user.role == 'authority':
        notifications = notifications.filter(target__in=['all', 'authority', 'admin_authority'])
    elif user.role == 'driver':
        notifications = notifications.filter(target__in=['all', 'drivers'])
    elif user.role in ['student', 'faculty', 'staff']:
        notifications = notifications.filter(target__in=['all', 'users'])
    
    now = timezone.now()
    notifications = notifications.filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    )
    
    serializer = NotificationSerializer(notifications.order_by('-created_at')[:20], many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_notifications_api(request):
    """Get unread notifications for the current user."""
    user = request.user
    
    # Get notifications targeted at this user
    notifications = Notification.objects.filter(is_active=True)
    
    if user.role == 'admin':
        notifications = notifications.filter(target__in=['all', 'admin', 'admin_authority'])
    elif user.role == 'authority':
        notifications = notifications.filter(target__in=['all', 'authority', 'admin_authority'])
    elif user.role == 'driver':
        notifications = notifications.filter(target__in=['all', 'drivers'])
    elif user.role in ['student', 'faculty', 'staff']:
        notifications = notifications.filter(target__in=['all', 'users'])
    
    now = timezone.now()
    notifications = notifications.filter(
        models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
    )
    
    # Exclude read notifications
    read_notification_ids = UserNotification.objects.filter(
        user=user, is_read=True
    ).values_list('notification_id', flat=True)
    
    notifications = notifications.exclude(id__in=read_notification_ids)
    
    result = []
    for n in notifications.order_by('-created_at')[:10]:
        result.append({
            'notification_id': n.id,
            'title': n.title,
            'message': n.message,
            'priority': n.priority,
            'created_at': n.created_at.isoformat()
        })
    
    return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_notifications_api(request):
    user_notifications = UserNotification.objects.filter(
        user=request.user
    ).select_related('notification').order_by('-notification__created_at')[:20]
    
    serializer = UserNotificationSerializer(user_notifications, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_read_api(request, pk):
    try:
        user_notification = UserNotification.objects.get(
            notification_id=pk, user=request.user
        )
        user_notification.is_read = True
        user_notification.read_at = timezone.now()
        user_notification.save()
        return Response({'status': 'marked as read'})
    except UserNotification.DoesNotExist:
        UserNotification.objects.create(
            notification_id=pk,
            user=request.user,
            is_read=True,
            read_at=timezone.now()
        )
        return Response({'status': 'marked as read'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_read_api(request):
    UserNotification.objects.filter(
        user=request.user, is_read=False
    ).update(is_read=True, read_at=timezone.now())
    return Response({'status': 'all marked as read'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_count_api(request):
    count = UserNotification.objects.filter(
        user=request.user, is_read=False
    ).count()
    return Response({'unread_count': count})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def dismiss_notification_api(request, pk):
    try:
        user_notification = UserNotification.objects.get(
            notification_id=pk, user=request.user
        )
        user_notification.is_read = True
        user_notification.read_at = timezone.now()
        user_notification.save()
        return Response({'status': 'dismissed'})
    except UserNotification.DoesNotExist:
        UserNotification.objects.create(
            notification_id=pk,
            user=request.user,
            is_read=True,
            read_at=timezone.now()
        )
        return Response({'status': 'dismissed'})
