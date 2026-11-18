from django.db import models
from django.utils import timezone

class Route(models.Model):
    ROUTE_TYPE_CHOICES = [
        ('shuttle', 'Shuttle Bus'),
        ('metro', 'Metro Bus'),
        ('long', 'Long Road Bus'),
    ]
    
    SERVICE_DAYS_CHOICES = [
        ('sat-thu', 'Saturday - Thursday'),
        ('sun-thu', 'Sunday - Thursday'),
        ('mon-fri', 'Monday - Friday'),
        ('all', 'All Days'),
        ('custom', 'Custom'),
    ]
    
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    route_type = models.CharField(max_length=20, choices=ROUTE_TYPE_CHOICES, default='shuttle')
    color = models.CharField(max_length=7, default='#ffc107')  # Yellow
    is_active = models.BooleanField(default=True)
    is_published = models.BooleanField(default=False, help_text='Published routes are visible to users')
    total_distance_km = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    estimated_duration_mins = models.PositiveIntegerField(null=True, blank=True)
    # Shuttle/Metro specific fields
    service_days = models.CharField(max_length=20, choices=SERVICE_DAYS_CHOICES, default='sat-thu', blank=True)
    custom_days = models.CharField(max_length=50, blank=True, help_text='Comma-separated days: sat,sun,mon,tue,wed,thu,fri')
    origin_name = models.CharField(max_length=100, blank=True, help_text='Starting point (e.g., Campus)')
    destination_name = models.CharField(max_length=100, blank=True, help_text='End point (e.g., Azampur)')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'routes'
        ordering = ['name']

    def __str__(self):
        return self.name
    
    @property
    def is_shuttle_or_metro(self):
        return self.route_type in ['shuttle', 'metro']


class Stop(models.Model):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='stops')
    name = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    order = models.PositiveIntegerField(default=0)
    scheduled_time = models.TimeField(null=True, blank=True)
    average_wait_time = models.PositiveIntegerField(default=2)
    is_major_stop = models.BooleanField(default=False)

    class Meta:
        db_table = 'stops'
        ordering = ['route', 'order']
        unique_together = ['route', 'order']

    def __str__(self):
        return f"{self.name} ({self.route.name})"


class Schedule(models.Model):
    DAYS_CHOICES = [
        ('mon', 'Monday'),
        ('tue', 'Tuesday'),
        ('wed', 'Wednesday'),
        ('thu', 'Thursday'),
        ('fri', 'Friday'),
        ('sat', 'Saturday'),
        ('sun', 'Sunday'),
    ]

    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='schedules')
    bus = models.ForeignKey('buses.Bus', on_delete=models.SET_NULL, null=True, blank=True, related_name='schedules')
    driver = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='driver_schedules')
    day_of_week = models.CharField(max_length=3, choices=DAYS_CHOICES)
    departure_time = models.TimeField()
    arrival_time = models.TimeField()
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'schedules'
        ordering = ['route', 'day_of_week', 'departure_time']

    def __str__(self):
        return f"{self.route.name} - {self.get_day_of_week_display()} {self.departure_time}"


class StopSchedule(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='stop_schedules')
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE, related_name='schedules')
    scheduled_arrival = models.TimeField()
    scheduled_departure = models.TimeField()

    class Meta:
        db_table = 'stop_schedules'
        ordering = ['scheduled_arrival']

    def __str__(self):
        return f"{self.stop.name} @ {self.scheduled_arrival}"


class ScheduleException(models.Model):
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='exceptions')
    date = models.DateField()
    is_cancelled = models.BooleanField(default=True)
    modified_departure = models.TimeField(null=True, blank=True)
    modified_arrival = models.TimeField(null=True, blank=True)
    reason = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'schedule_exceptions'
        ordering = ['-date']

    def __str__(self):
        return f"{self.schedule} - {self.date} ({'Cancelled' if self.is_cancelled else 'Modified'})"


class Trip(models.Model):
    """Represents a specific trip on a route (e.g., Trip 01, Trip 02)"""
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='trips')
    name = models.CharField(max_length=100)
    trip_number = models.PositiveIntegerField(default=1, help_text='Trip sequence number')
    departure_time = models.TimeField(help_text='Campus/Origin departure time')
    arrival_time = models.TimeField(null=True, blank=True, help_text='Destination arrival time (optional for last trip)')
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trips'
        ordering = ['route', 'order', 'departure_time']

    def __str__(self):
        return f"{self.route.name} - Trip {self.trip_number:02d} ({self.departure_time})"
    
    @property
    def formatted_trip_number(self):
        return f"{self.trip_number:02d}"


class TripStopTime(models.Model):
    """Specific stop times for each trip"""
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='stop_times')
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE, related_name='trip_times')
    arrival_time = models.TimeField()
    departure_time = models.TimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'trip_stop_times'
        ordering = ['trip', 'order']
        unique_together = ['trip', 'stop']

    def __str__(self):
        return f"{self.trip.name} - {self.stop.name} @ {self.arrival_time}"


class LiveETA(models.Model):
    """Real-time ETA tracking for buses at stops"""
    from buses.models import Bus
    
    bus = models.ForeignKey('buses.Bus', on_delete=models.CASCADE, related_name='live_etas')
    stop = models.ForeignKey(Stop, on_delete=models.CASCADE, related_name='live_etas')
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='live_etas', null=True, blank=True)
    scheduled_time = models.TimeField()
    estimated_time = models.TimeField()
    delay_minutes = models.IntegerField(default=0)
    distance_km = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'live_etas'
        ordering = ['-updated_at']

    @property
    def is_delayed(self):
        return self.delay_minutes > 3

    @property
    def is_on_time(self):
        return self.delay_minutes <= 0

    def __str__(self):
        return f"ETA: {self.bus} → {self.stop.name}"
