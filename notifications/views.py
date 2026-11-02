from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.paginator import Paginator
from django.utils import timezone
from accounts.decorators import admin_required
from accounts.models import User
from .models import Notification, UserNotification
from .forms import NotificationForm

@login_required
def notification_list(request):
    if request.user.is_admin_user or request.user.is_authority:
        notifications = Notification.objects.all()
    else:
        notifications = Notification.objects.filter(is_active=True)
        if request.user.is_driver:
            notifications = notifications.filter(target__in=['all', 'drivers'])
        else:
            notifications = notifications.filter(target__in=['all', 'users'])
    
    notifications = notifications.select_related('created_by', 'target_route').order_by('-created_at')
    
    paginator = Paginator(notifications, 15)
    page = request.GET.get('page')
    notifications = paginator.get_page(page)
    
    return render(request, 'notifications/notification_list.html', {'notifications': notifications})


@login_required
def notification_detail(request, pk):
    notification = get_object_or_404(Notification.objects.select_related('created_by', 'target_route'), pk=pk)
    
    UserNotification.objects.update_or_create(
        notification=notification,
        user=request.user,
        defaults={'is_read': True, 'read_at': timezone.now()}
    )
    
    return render(request, 'notifications/notification_detail.html', {'notification': notification})


@login_required
@admin_required
def notification_create(request):
    if request.method == 'POST':
        form = NotificationForm(request.POST)
        if form.is_valid():
            notification = form.save(commit=False)
            notification.created_by = request.user
            notification.save()
            
            send_notification_to_users(notification)
            
            messages.success(request, 'Notification sent successfully.')
            return redirect('notifications:list')
    else:
        form = NotificationForm()
    
    return render(request, 'notifications/notification_form.html', {'form': form})


@login_required
@admin_required
def notification_edit(request, pk):
    notification = get_object_or_404(Notification, pk=pk)
    
    if request.method == 'POST':
        form = NotificationForm(request.POST, instance=notification)
        if form.is_valid():
            form.save()
            messages.success(request, 'Notification updated.')
            return redirect('notifications:list')
    else:
        form = NotificationForm(instance=notification)
    
    return render(request, 'notifications/notification_form.html', {'form': form, 'notification': notification})


@login_required
@admin_required
def notification_delete(request, pk):
    notification = get_object_or_404(Notification, pk=pk)
    
    if request.method == 'POST':
        notification.delete()
        messages.success(request, 'Notification deleted.')
        return redirect('notifications:list')
    
    return render(request, 'notifications/notification_confirm_delete.html', {'notification': notification})


def send_notification_to_users(notification):
    if notification.target == 'all':
        users = User.objects.filter(is_active=True)
    elif notification.target == 'users':
        users = User.objects.filter(role__in=['student', 'faculty', 'staff'], is_active=True)
    elif notification.target == 'drivers':
        users = User.objects.filter(role='driver', is_active=True)
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
