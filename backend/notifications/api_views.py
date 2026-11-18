from django.db import models
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from .models import Notification, UserNotification
from .serializers import NotificationSerializer, UserNotificationSerializer


def _send_notification_to_users(notification):
    if notification.target == 'all':
        users = User.objects.filter(is_active=True)
    elif notification.target == 'users':
        users = User.objects.filter(role__in=['student', 'faculty', 'staff'], is_active=True)
    elif notification.target == 'drivers':
        users = User.objects.filter(role='driver', is_active=True)
    elif notification.target == 'admin':
        users = User.objects.filter(role='admin', is_active=True)
    elif notification.target == 'authority':
        users = User.objects.filter(role='authority', is_active=True)
    elif notification.target == 'admin_authority':
        users = User.objects.filter(role__in=['admin', 'authority'], is_active=True)
    elif notification.target == 'route' and notification.target_route:
        from buses.models import BusAssignment
        driver_ids = BusAssignment.objects.filter(
            route=notification.target_route, is_active=True
        ).values_list('driver_id', flat=True)
        users = User.objects.filter(id__in=driver_ids)
    else:
        users = User.objects.none()

    user_notifications = [
        UserNotification(notification=notification, user=user)
        for user in users
    ]
    UserNotification.objects.bulk_create(user_notifications, ignore_conflicts=True)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def notification_list_api(request):
    user = request.user

    if request.method == 'POST':
        if not user.is_admin_user:
            return Response({'error': 'Only admins can send notifications.'}, status=status.HTTP_403_FORBIDDEN)

        title = (request.data.get('title') or '').strip()
        message = (request.data.get('message') or '').strip()
        if not title or not message:
            return Response({'error': 'Title and message are required.'}, status=status.HTTP_400_BAD_REQUEST)

        notification = Notification.objects.create(
            title=title,
            message=message,
            notification_type=request.data.get('notification_type', 'announcement'),
            priority=request.data.get('priority', 'info'),
            source='admin',
            target=request.data.get('target', 'all'),
            target_route_id=request.data.get('target_route') or None,
            created_by=user,
            is_active=True,
            expires_at=request.data.get('expires_at') or None,
        )
        _send_notification_to_users(notification)
        return Response(NotificationSerializer(notification).data, status=status.HTTP_201_CREATED)

    if user.role in ['admin', 'authority']:
        notifications = Notification.objects.select_related('created_by', 'target_route').all()
    else:
        notifications = Notification.objects.select_related('created_by', 'target_route').filter(is_active=True)
        if user.role == 'driver':
            notifications = notifications.filter(target__in=['all', 'drivers'])
        else:
            notifications = notifications.filter(target__in=['all', 'users'])

        now = timezone.now()
        notifications = notifications.filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=now)
        )

    serializer = NotificationSerializer(notifications.order_by('-created_at')[:50], many=True)
    return Response(serializer.data)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def notification_detail_api(request, pk):
    notification = get_object_or_404(Notification.objects.select_related('created_by', 'target_route'), pk=pk)

    if request.method == 'GET':
        UserNotification.objects.update_or_create(
            notification=notification,
            user=request.user,
            defaults={'is_read': True, 'read_at': timezone.now()}
        )
        return Response(NotificationSerializer(notification).data)

    if not request.user.is_admin_user:
        return Response({'error': 'Only admins can modify or delete notifications.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'DELETE':
        notification.delete()
        return Response({'status': 'Notification deleted.'})

    for field in ['title', 'message', 'priority', 'target', 'is_active', 'expires_at']:
        if field in request.data:
            setattr(notification, field, request.data.get(field))
    if 'target_route' in request.data:
        notification.target_route_id = request.data.get('target_route') or None
    notification.save()
    return Response(NotificationSerializer(notification).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread_notifications_api(request):
    """Get unread notifications for the current user."""
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
    UserNotification.objects.update_or_create(
        notification_id=pk,
        user=request.user,
        defaults={'is_read': True, 'read_at': timezone.now()}
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
    UserNotification.objects.update_or_create(
        notification_id=pk,
        user=request.user,
        defaults={'is_read': True, 'read_at': timezone.now()}
    )
    return Response({'status': 'dismissed'})
