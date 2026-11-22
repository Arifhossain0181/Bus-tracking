from django.contrib import admin
from .models import Route, RouteRevision, Stop, Schedule, StopSchedule, ScheduleException

class StopInline(admin.TabularInline):
    model = Stop
    extra = 1

@admin.register(Route)
class RouteAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'total_distance_km', 'estimated_duration_mins')
    list_filter = ('is_active',)
    search_fields = ('name',)
    inlines = [StopInline]

@admin.register(RouteRevision)
class RouteRevisionAdmin(admin.ModelAdmin):
    list_display = ('route', 'revision_number', 'status', 'distance_km', 'duration_mins', 'created_at', 'published_at')
    list_filter = ('status', 'route')
    search_fields = ('route__name', 'change_summary')
    readonly_fields = ('revision_number', 'created_at', 'published_at')

    def get_readonly_fields(self, request, obj=None):
        if obj and obj.status in (RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED):
            return [f.name for f in self.model._meta.fields]
        return self.readonly_fields

    def has_delete_permission(self, request, obj=None):
        if obj and obj.status in (RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED):
            return False
        if request is None:
            return True
        return super().has_delete_permission(request, obj)

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
