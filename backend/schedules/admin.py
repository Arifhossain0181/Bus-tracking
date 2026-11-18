from django.contrib import admin
from .models import Route, Stop, Schedule, StopSchedule, ScheduleException

class StopInline(admin.TabularInline):
    model = Stop
    extra = 1

@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'total_distance_km', 'estimated_duration_mins')
    list_filter = ('is_active',)
    search_fields = ('name',)
    inlines = [StopInline]

@admin.register(Stop)
class StopAdmin(admin.ModelAdmin):
    list_display = ('name', 'route', 'order', 'scheduled_time', 'is_major_stop')
    list_filter = ('route', 'is_major_stop')
    search_fields = ('name',)

@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ('route', 'day_of_week', 'departure_time', 'arrival_time', 'is_active')
    list_filter = ('route', 'day_of_week', 'is_active')

@admin.register(StopSchedule)
class StopScheduleAdmin(admin.ModelAdmin):
    list_display = ('schedule', 'stop', 'scheduled_arrival', 'scheduled_departure')
    list_filter = ('schedule__route',)

@admin.register(ScheduleException)
class ScheduleExceptionAdmin(admin.ModelAdmin):
    list_display = ('schedule', 'date', 'is_cancelled', 'reason')
    list_filter = ('is_cancelled', 'date')
