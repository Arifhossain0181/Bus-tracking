from django.db import models
from django.utils import timezone
from datetime import timedelta
from accounts.models import User

class DriverLocation(models.Model):
    """Real-time driver location tracking."""
    driver = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name='live_location',
        limit_choices_to={'role': 'driver'}
    )
    journey = models.ForeignKey(
        'buses.Journey',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='location_updates'
    )
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    accuracy = models.FloatField(null=True, blank=True, help_text="GPS accuracy in meters")
    heading = models.FloatField(null=True, blank=True, help_text="Direction in degrees")
    speed = models.FloatField(null=True, blank=True, help_text="Speed in m/s")
    is_sharing = models.BooleanField(default=False)
    last_updated = models.DateTimeField(auto_now=True)
    session_started = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'driver_locations'
        verbose_name = 'Driver Location'
        verbose_name_plural = 'Driver Locations'

    def __str__(self):
        return f"{self.driver.get_full_name()} - {'Active' if self.is_sharing else 'Inactive'}"

    @property
    def is_active(self):
        """Check if location is recent (within last 60 seconds)."""
        if not self.is_sharing:
            return False
        threshold = timezone.now() - timedelta(seconds=60)
        return self.last_updated >= threshold

    @property
    def is_stale(self):
        """Check if location is stale (older than 30 seconds)."""
        threshold = timezone.now() - timedelta(seconds=30)
        return self.last_updated < threshold
    
    @property
    def bus_info(self):
        """Get the bus info from active journey."""
        if self.journey and self.journey.status == 'active':
            return {
                'bus_number': self.journey.bus.bus_number,
                'route_name': self.journey.route.name,
                'driver_name': self.driver.get_full_name() or self.driver.username
            }
        return None

    @classmethod
    def get_active_drivers(cls):
        """Get all drivers currently sharing location (allows up to 5 minutes tolerance)."""
        threshold = timezone.now() - timedelta(minutes=5)
        return cls.objects.filter(
            is_sharing=True,
            last_updated__gte=threshold,
        ).exclude(latitude=0, longitude=0).select_related('driver', 'journey__bus', 'journey__route')

    @classmethod
    def expire_inactive(cls):
        """Mark stale locations as not sharing only after prolonged inactivity (15 mins)."""
        threshold = timezone.now() - timedelta(minutes=15)
        cls.objects.filter(
            is_sharing=True,
            last_updated__lt=threshold
        ).update(is_sharing=False)


class LocationHistory(models.Model):
    """Optional: Store location history for analytics."""
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='location_history')
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'driver_location_history'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['driver', '-timestamp']),
        ]

    def __str__(self):
        return f"{self.driver.username} - {self.timestamp}"


class ArchivedLocationHistory(models.Model):
    """
    Cold/archival storage for historical driver GPS coordinates.
    Stores records copied from LocationHistory older than the retention cutoff (e.g. 14 days).
    Preserves original identifiers, exact coordinate precision, and audit traceability.
    """
    original_id = models.BigIntegerField(
        unique=True,
        db_index=True,
        help_text="Primary key ID of the original LocationHistory record"
    )
    driver = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='archived_location_history'
    )
    driver_username = models.CharField(
        max_length=150,
        blank=True,
        help_text="Snapshot of driver username for audit traceability"
    )
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    timestamp = models.DateTimeField(
        db_index=True,
        help_text="Original GPS coordinate timestamp"
    )
    archived_at = models.DateTimeField(
        default=timezone.now,
        db_index=True,
        help_text="Timestamp when this record was copied to archive"
    )
    archive_batch_id = models.CharField(
        max_length=64,
        blank=True,
        db_index=True,
        help_text="Batch identifier for this archival run"
    )

    class Meta:
        db_table = 'driver_location_history_archive'
        ordering = ['-timestamp']
        verbose_name = 'Archived Location History'
        verbose_name_plural = 'Archived Location Histories'
        indexes = [
            models.Index(fields=['driver', '-timestamp']),
            models.Index(fields=['timestamp']),
            models.Index(fields=['archive_batch_id']),
        ]

    def __str__(self):
        return f"[Archive #{self.original_id}] {self.driver_username or self.driver_id} @ {self.timestamp}"

