from django.db import models
from django.utils import timezone
from accounts.models import User
import math

class Bus(models.Model):
    BUS_TYPE_CHOICES = [
        ('long', 'Long Route Bus'),
        ('shuttle', 'Shuttle Bus'),
    ]
    
    bus_number = models.CharField(max_length=20, unique=True)
    license_plate = models.CharField(max_length=20)
    bus_type = models.CharField(max_length=20, choices=BUS_TYPE_CHOICES, default='long')
    capacity = models.PositiveIntegerField(default=50)
    model = models.CharField(max_length=100, blank=True)
    year = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    current_route = models.ForeignKey(
        'schedules.Route', on_delete=models.SET_NULL, null=True, blank=True, related_name='current_buses'
    )
    current_trip = models.ForeignKey(
        'schedules.Trip', on_delete=models.SET_NULL, null=True, blank=True, related_name='current_buses'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'buses'
        verbose_name_plural = 'Buses'
        ordering = ['bus_number']

    def __str__(self):
        return self.bus_number

    @property
    def latest_location(self):
        return self.locations.order_by('-timestamp').first()


class BusLocation(models.Model):
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='locations')
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    speed = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    heading = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)
    is_accurate = models.BooleanField(default=True)

    class Meta:
        db_table = 'bus_locations'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['bus', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.bus.bus_number} @ {self.timestamp}"


class BusAssignment(models.Model):
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='assignments')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bus_assignments')
    route = models.ForeignKey('schedules.Route', on_delete=models.CASCADE, related_name='assignments')
    date = models.DateField(null=True, blank=True)
    shift_start = models.TimeField(null=True, blank=True)
    shift_end = models.TimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bus_assignments'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.bus.bus_number} - {self.driver.username}"

    def clean(self):
        """Validate assignment rules."""
        from django.core.exceptions import ValidationError
        
        # Both driver and route are required for a valid assignment
        if self.is_active:
            if not self.driver:
                raise ValidationError("A driver must be assigned for an active assignment.")
            if not self.route:
                raise ValidationError("A route must be assigned for an active assignment.")
        
        if self.is_active and self.bus:
            # Check if bus already has an active assignment
            existing_bus = BusAssignment.objects.filter(
                bus=self.bus, 
                is_active=True
            ).exclude(pk=self.pk)
            
            if existing_bus.exists():
                existing_assignment = existing_bus.first()
                raise ValidationError(
                    f"Bus {self.bus.bus_number} already has an active assignment with driver "
                    f"{existing_assignment.driver.get_full_name() or existing_assignment.driver.username} "
                    f"on route {existing_assignment.route.name}. "
                    f"Please clear the existing assignment first."
                )
        
        if self.is_active and self.driver:
            # Check if driver already has an active assignment on a different bus
            existing = BusAssignment.objects.filter(
                driver=self.driver, 
                is_active=True
            ).exclude(pk=self.pk)
            
            if existing.exists():
                existing_assignment = existing.first()
                raise ValidationError(
                    f"Driver {self.driver.get_full_name() or self.driver.username} is already assigned to "
                    f"Bus {existing_assignment.bus.bus_number} on route {existing_assignment.route.name}. "
                    f"Please deactivate the existing assignment first."
                )
        
        if self.is_active and self.route:
            # Check if route already has an active assignment with a different driver
            existing_route = BusAssignment.objects.filter(
                route=self.route, 
                is_active=True
            ).exclude(pk=self.pk)
            
            if existing_route.exists():
                existing_assignment = existing_route.first()
                raise ValidationError(
                    f"Route '{self.route.name}' already has driver "
                    f"{existing_assignment.driver.get_full_name() or existing_assignment.driver.username} "
                    f"assigned on Bus {existing_assignment.bus.bus_number}. "
                    f"A route can only have one driver at a time."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

class ETACalculation(models.Model):
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='etas')
    stop = models.ForeignKey('schedules.Stop', on_delete=models.CASCADE, related_name='etas')
    calculated_eta = models.DateTimeField()
    scheduled_time = models.DateTimeField()
    distance_km = models.DecimalField(max_digits=10, decimal_places=2)
    is_delayed = models.BooleanField(default=False)
    delay_minutes = models.IntegerField(default=0)
    calculated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eta_calculations'
        ordering = ['-calculated_at']

    def __str__(self):
        return f"ETA: {self.bus.bus_number} to {self.stop.name}"

    @staticmethod
    def calculate_distance(lat1, lon1, lat2, lon2):
        R = 6371
        lat1_rad = math.radians(float(lat1))
        lat2_rad = math.radians(float(lat2))
        delta_lat = math.radians(float(lat2) - float(lat1))
        delta_lon = math.radians(float(lon2) - float(lon1))
        
        a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        return R * c

    @classmethod
    def calculate_eta(cls, bus, stop, avg_speed_kmh=30):
        location = bus.latest_location
        if not location:
            return None
        
        distance = cls.calculate_distance(
            location.latitude, location.longitude,
            stop.latitude, stop.longitude
        )
        
        buffer = 1.2
        hours = (distance / avg_speed_kmh) * buffer
        minutes = int(hours * 60)
        
        eta = timezone.now() + timezone.timedelta(minutes=minutes)
        return eta, distance, minutes


class Journey(models.Model):
    """Track driver journeys with start/end times and status."""
    JOURNEY_STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('aborted', 'Aborted'),
    ]
    
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='journeys')
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='journeys')
    route = models.ForeignKey('schedules.Route', on_delete=models.CASCADE, related_name='journeys')
    assignment = models.ForeignKey(BusAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='journeys')
    status = models.CharField(max_length=20, choices=JOURNEY_STATUS_CHOICES, default='active')
    start_time = models.DateTimeField(default=timezone.now)
    end_time = models.DateTimeField(null=True, blank=True)
    start_latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    start_longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    end_latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    end_longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'journeys'
        ordering = ['-start_time']

    def __str__(self):
        return f"{self.driver.get_full_name()} - {self.bus.bus_number} - {self.status}"

    @property
    def duration_minutes(self):
        if self.end_time:
            delta = self.end_time - self.start_time
            return int(delta.total_seconds() / 60)
        return None

    @classmethod
    def get_active_journey(cls, driver):
        """Get the active journey for a driver."""
        return cls.objects.filter(driver=driver, status='active').first()

    @classmethod
    def get_active_journeys(cls):
        """Get all active journeys."""
        return cls.objects.filter(status='active').select_related('driver', 'bus', 'route')
