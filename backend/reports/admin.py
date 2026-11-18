from django.contrib import admin
from .models import TripLog, UserFeedback, RouteAnalytics

@admin.register(TripLog)
class TripLogAdmin(admin.ModelAdmin):
    list_display = ('route', 'bus', 'driver', 'date', 'is_completed', 'is_on_time')
    list_filter = ('is_completed', 'date', 'route')
    search_fields = ('route__name', 'bus__bus_number')
    date_hierarchy = 'date'

@admin.register(UserFeedback)
class UserFeedbackAdmin(admin.ModelAdmin):
    list_display = ('user', 'category', 'rating', 'route', 'is_resolved', 'created_at')
    list_filter = ('category', 'rating', 'is_resolved')
    search_fields = ('user__username', 'comment')

@admin.register(RouteAnalytics)
class RouteAnalyticsAdmin(admin.ModelAdmin):
    list_display = ('route', 'date', 'total_trips', 'on_time_percentage', 'total_passengers')
    list_filter = ('route', 'date')
    date_hierarchy = 'date'
