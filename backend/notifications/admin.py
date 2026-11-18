from django.contrib import admin
from .models import Notification, UserNotification

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('title', 'priority', 'target', 'is_active', 'created_by', 'created_at')
    list_filter = ('priority', 'target', 'is_active')
    search_fields = ('title', 'message')

@admin.register(UserNotification)
class UserNotificationAdmin(admin.ModelAdmin):
    list_display = ('notification', 'user', 'is_read', 'read_at')
    list_filter = ('is_read',)
