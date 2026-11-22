from django.contrib import admin
from .models import DriverLocation, LocationHistory, ArchivedLocationHistory

@admin.register(DriverLocation)
class DriverLocationAdmin(admin.ModelAdmin):
    list_display = ('driver', 'is_sharing', 'latitude', 'longitude', 'last_updated', 'is_active')
    list_filter = ('is_sharing',)
    search_fields = ('driver__username', 'driver__first_name', 'driver__last_name')
    readonly_fields = ('last_updated',)

    def is_active(self, obj):
        return obj.is_active
    is_active.boolean = True


@admin.register(LocationHistory)
class LocationHistoryAdmin(admin.ModelAdmin):
    list_display = ('driver', 'latitude', 'longitude', 'timestamp')
    list_filter = ('driver', 'timestamp')
    date_hierarchy = 'timestamp'


@admin.register(ArchivedLocationHistory)
class ArchivedLocationHistoryAdmin(admin.ModelAdmin):
    list_display = ('original_id', 'driver_username', 'latitude', 'longitude', 'timestamp', 'archived_at', 'archive_batch_id')
    list_filter = ('archive_batch_id', 'archived_at')
    search_fields = ('driver_username', 'archive_batch_id', 'original_id')
    date_hierarchy = 'timestamp'
    readonly_fields = ('original_id', 'driver', 'driver_username', 'latitude', 'longitude', 'timestamp', 'archived_at', 'archive_batch_id')

