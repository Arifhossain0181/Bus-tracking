from django.contrib import admin
from .models import Bus, BusLocation, BusAssignment, ETACalculation, Journey

@admin.register(Bus)
class BusAdmin(admin.ModelAdmin):
    list_display = ('bus_number', 'license_plate', 'capacity', 'is_active', 'current_route')
    list_filter = ('is_active',)
    search_fields = ('bus_number', 'license_plate')

@admin.register(BusLocation)
class BusLocationAdmin(admin.ModelAdmin):
    list_display = ('bus', 'latitude', 'longitude', 'speed', 'timestamp')
    list_filter = ('bus', 'is_accurate')
    date_hierarchy = 'timestamp'

@admin.register(BusAssignment)
class BusAssignmentAdmin(admin.ModelAdmin):
    list_display = ('bus', 'driver', 'route', 'date', 'shift_start', 'shift_end', 'is_active')
    list_filter = ('is_active', 'date')
    search_fields = ('bus__bus_number', 'driver__username')

@admin.register(ETACalculation)
class ETACalculationAdmin(admin.ModelAdmin):
    list_display = ('bus', 'stop', 'calculated_eta', 'is_delayed', 'delay_minutes')
    list_filter = ('is_delayed',)

@admin.register(Journey)
class JourneyAdmin(admin.ModelAdmin):
    list_display = ('id', 'driver', 'bus', 'route', 'status', 'start_time', 'end_time', 'duration_minutes')
    list_filter = ('status', 'start_time', 'route', 'bus')
    search_fields = ('driver__username', 'bus__bus_number', 'route__name')
    date_hierarchy = 'start_time'
    readonly_fields = ('created_at',)
