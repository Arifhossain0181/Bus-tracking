from django.db import models
from accounts.models import User
from schedules.models import Route

class Notification(models.Model):
    PRIORITY_CHOICES = [
        ('info', 'Info'),
        ('warning', 'Warning'),
        ('danger', 'Urgent'),
        ('success', 'Success'),
    ]

    TARGET_CHOICES = [
        ('all', 'All Users'),
        ('users', 'Students/Faculty/Staff'),
        ('drivers', 'All Drivers'),
        ('route', 'Specific Route'),
        ('admin', 'Admin Only'),
        ('authority', 'Authority Only'),
        ('admin_authority', 'Admin & Authority'),
    ]
    
    SOURCE_CHOICES = [
        ('system', 'System'),
        ('admin', 'Admin'),
        ('driver', 'Driver'),
        ('user', 'User'),
        ('authority', 'Authority'),
    ]
    
    NOTIFICATION_TYPE_CHOICES = [
        ('announcement', 'Announcement'),
        ('delay', 'Delay Report'),
        ('journey_start', 'Journey Started'),
        ('journey_end', 'Journey Ended'),
        ('emergency', 'Emergency'),
        ('issue', 'Issue Report'),
        ('schedule_change', 'Schedule Change'),
        ('route_update', 'Route Update'),
        ('feedback', 'Feedback'),
        ('compliance', 'Compliance Notice'),
    ]

    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(max_length=30, choices=NOTIFICATION_TYPE_CHOICES, default='announcement')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='info')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='system')
    target = models.CharField(max_length=20, choices=TARGET_CHOICES, default='all')
    target_route = models.ForeignKey(Route, on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_notifications')
    related_bus = models.ForeignKey('buses.Bus', on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    related_journey = models.ForeignKey('buses.Journey', on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']

    def __str__(self):
        return self.title
    
    @classmethod
    def create_journey_notification(cls, journey, notification_type, created_by):
        """Create a notification for journey events."""
        if notification_type == 'journey_start':
            title = f"Journey Started: {journey.route.name}"
            message = f"Driver {journey.driver.get_full_name()} has started journey on {journey.route.name} with bus {journey.bus.bus_number}."
            priority = 'info'
        else:
            title = f"Journey Ended: {journey.route.name}"
            message = f"Driver {journey.driver.get_full_name()} has ended journey on {journey.route.name}."
            priority = 'info'
        
        return cls.objects.create(
            title=title,
            message=message,
            notification_type=notification_type,
            priority=priority,
            source='driver',
            target='admin_authority',
            target_route=journey.route,
            created_by=created_by,
            related_bus=journey.bus,
            related_journey=journey
        )
    
    @classmethod
    def create_delay_notification(cls, driver, bus, route, delay_minutes, reason=''):
        """Create a delay notification for admins and all users."""
        # Create notification for admin and authority
        cls.objects.create(
            title=f"Delay Alert: {route.name}",
            message=f"Bus {bus.bus_number} on route {route.name} is delayed by approximately {delay_minutes} minutes. {reason}",
            notification_type='delay',
            priority='warning',
            source='driver',
            target='admin_authority',
            target_route=route,
            created_by=driver,
            related_bus=bus
        )
        
        # Create notification for all users
        return cls.objects.create(
            title=f"Delay Alert: {route.name}",
            message=f"Bus {bus.bus_number} on route {route.name} is delayed by approximately {delay_minutes} minutes. {reason}",
            notification_type='delay',
            priority='warning',
            source='driver',
            target='all',
            target_route=route,
            created_by=driver,
            related_bus=bus
        )


class UserNotification(models.Model):
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name='user_notifications')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications_received')
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_notifications'
        unique_together = ['notification', 'user']

    def __str__(self):
        return f"{self.notification.title} - {self.user.username}"
