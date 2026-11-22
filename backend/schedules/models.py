from django.db import models
from django.utils import timezone


class RouteQuerySet(models.QuerySet):
    def update(self, **kwargs):
        if 'active_revision' in kwargs or 'active_revision_id' in kwargs:
            from django.core.exceptions import ValidationError
            rev = kwargs.get('active_revision')
            rev_id = kwargs.get('active_revision_id') or (rev.id if rev else None)
            if rev_id is not None:
                RouteRevision = self.model._meta.apps.get_model('schedules', 'RouteRevision')
                target_rev = RouteRevision.objects.filter(pk=rev_id).first()
                if not target_rev:
                    raise ValidationError({'active_revision': 'Specified active revision does not exist.'})
                if target_rev.status != RouteRevision.STATUS_PUBLISHED:
                    raise ValidationError({'active_revision': 'Only published revisions can be set as the active revision.'})
                if self.exclude(pk=target_rev.route_id).exists():
                    raise ValidationError({'active_revision': 'The active revision must belong to this route.'})
        return super().update(**kwargs)


class Route(models.Model):
    objects = RouteQuerySet.as_manager()

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
    active_revision = models.ForeignKey(
        'schedules.RouteRevision',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='active_for_routes',
        help_text='The currently published active revision for this route'
    )
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

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        if self.active_revision_id:
            if self.active_revision.route_id != self.id:
                raise ValidationError({'active_revision': 'The active revision must belong to this route.'})
            if self.active_revision.status != RouteRevision.STATUS_PUBLISHED:
                raise ValidationError({'active_revision': 'Only published revisions can be set as the active revision.'})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def publish_revision(self, revision, user=None):
        """Publish a specific revision, archiving previous published revisions."""
        from django.core.exceptions import ValidationError
        from django.db import transaction

        if revision.route_id != self.id:
            raise ValidationError("Revision does not belong to this route.")

        with transaction.atomic():
            locked_route = Route.objects.select_for_update().get(pk=self.id)
            locked_revision = RouteRevision.objects.select_for_update().get(pk=revision.pk)

            # Idempotent: already published and active
            if locked_revision.status == RouteRevision.STATUS_PUBLISHED and locked_route.active_revision_id == locked_revision.id:
                return locked_revision

            if locked_revision.status == RouteRevision.STATUS_ARCHIVED:
                raise ValidationError("Archived route revisions cannot be re-published. To restore an archived geometry, create a new draft revision.")

            if not locked_revision.geometry:
                raise ValidationError({'geometry': 'Cannot publish a route revision without valid geometry.'})

            # Clean and validate revision for publishing
            locked_revision.status = RouteRevision.STATUS_PUBLISHED
            locked_revision.published_at = timezone.now()

            # Snapshot stops into metadata if not already present
            if 'stops_snapshot' not in locked_revision.metadata:
                locked_revision.metadata['stops_snapshot'] = [
                    {
                        'id': s.id,
                        'name': s.name,
                        'latitude': float(s.latitude),
                        'longitude': float(s.longitude),
                        'order': s.order,
                        'average_wait_time': s.average_wait_time,
                        'is_major_stop': s.is_major_stop,
                        'scheduled_time': str(s.scheduled_time) if s.scheduled_time else None
                    }
                    for s in locked_route.stops.order_by('order', 'id')
                ]

            locked_revision._controlled_publishing = True
            locked_revision.full_clean()
            locked_revision.save()

            # Update route attributes and active pointer FIRST so previous revision is no longer active
            locked_route.active_revision = locked_revision
            locked_route.is_published = True
            locked_route.is_active = True
            if locked_revision.distance_km is not None:
                locked_route.total_distance_km = locked_revision.distance_km
            if locked_revision.duration_mins is not None:
                locked_route.estimated_duration_mins = locked_revision.duration_mins
            locked_route.save()

            # Archive any existing published revisions for this route (they are no longer active)
            for prev in locked_route.revisions.filter(status=RouteRevision.STATUS_PUBLISHED).exclude(pk=locked_revision.pk):
                prev.status = RouteRevision.STATUS_ARCHIVED
                prev.save(update_fields=['status'])

            self.active_revision = locked_revision
            self.is_published = True
            self.is_active = True
            self.total_distance_km = locked_route.total_distance_km
            self.estimated_duration_mins = locked_route.estimated_duration_mins

            # Sync in-memory instance passed as argument
            revision.status = locked_revision.status
            revision.published_at = locked_revision.published_at
            revision.metadata = locked_revision.metadata

        return locked_revision


class RouteRevisionQuerySet(models.QuerySet):
    def update(self, **kwargs):
        from django.core.exceptions import ValidationError
        if self.filter(status__in=[RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED]).exists():
            raise ValidationError("Published or archived route revisions are immutable and cannot be modified via bulk update.")
        if 'status' in kwargs:
            if kwargs['status'] == RouteRevision.STATUS_PUBLISHED:
                raise ValidationError("Route revisions cannot be published via bulk update. Use Route.publish_revision().")
            if kwargs['status'] == RouteRevision.STATUS_ARCHIVED:
                raise ValidationError("Route revisions cannot be archived via bulk update.")
            if kwargs['status'] not in (RouteRevision.STATUS_DRAFT, RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED):
                raise ValidationError(f"Invalid status: {kwargs['status']}")
        return super().update(**kwargs)

    def bulk_update(self, objs, fields, batch_size=None):
        from django.core.exceptions import ValidationError
        for obj in objs:
            orig = RouteRevision.objects.filter(pk=obj.pk).values('status').first()
            if orig and orig['status'] in [RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED]:
                raise ValidationError("Published or archived route revisions are immutable and cannot be updated via bulk_update.")
        if 'status' in fields:
            for obj in objs:
                if obj.status == RouteRevision.STATUS_PUBLISHED:
                    raise ValidationError("Route revisions cannot be published via bulk_update. Use Route.publish_revision().")
                if obj.status == RouteRevision.STATUS_ARCHIVED:
                    raise ValidationError("Route revisions cannot be archived via bulk_update.")
                if obj.status not in (RouteRevision.STATUS_DRAFT, RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED):
                    raise ValidationError(f"Invalid status: {obj.status}")
        return super().bulk_update(objs, fields, batch_size=batch_size)

    def delete(self):
        if self.filter(status__in=[RouteRevision.STATUS_PUBLISHED, RouteRevision.STATUS_ARCHIVED]).exists():
            from django.core.exceptions import ValidationError
            raise ValidationError("Published or archived route revisions cannot be deleted.")
        return super().delete()


class RouteRevision(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'
    STATUS_ARCHIVED = 'archived'

    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_PUBLISHED, 'Published'),
        (STATUS_ARCHIVED, 'Archived'),
    ]

    objects = RouteRevisionQuerySet.as_manager()

    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='revisions')
    revision_number = models.PositiveIntegerField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    geometry = models.JSONField(null=True, blank=True, help_text="GeoJSON LineString geometry: {'type': 'LineString', 'coordinates': [[lng, lat], ...]}")
    distance_km = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    duration_mins = models.PositiveIntegerField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True, help_text="Additional revision metadata")
    change_summary = models.CharField(max_length=255, blank=True, default='')

    created_by = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='route_revisions_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'route_revisions'
        ordering = ['route', '-revision_number']
        unique_together = ['route', 'revision_number']
        indexes = [
            models.Index(fields=['route', 'status']),
            models.Index(fields=['status', '-published_at']),
        ]

    def __str__(self):
        return f"{self.route.name} (Rev #{self.revision_number} - {self.status})"

    def clean(self):
        super().clean()
        from django.core.exceptions import ValidationError
        from .geometry import validate_geojson_linestring

        if self.geometry is not None:
            is_valid, err = validate_geojson_linestring(self.geometry)
            if not is_valid:
                raise ValidationError({'geometry': err})

        if self.status == self.STATUS_PUBLISHED and not self.geometry:
            raise ValidationError({'geometry': 'Cannot publish a route revision without valid geometry.'})

    def delete(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        if self.status in (self.STATUS_PUBLISHED, self.STATUS_ARCHIVED):
            raise ValidationError(f"Cannot delete a {self.status} route revision. Only draft revisions can be deleted.")
        return super().delete(*args, **kwargs)

    def save(self, *args, **kwargs):
        from django.core.exceptions import ValidationError
        from django.db.models import Max

        # Check immutability and controlled status transitions
        if self.pk:
            orig = RouteRevision.objects.filter(pk=self.pk).values(
                'status', 'geometry', 'distance_km', 'duration_mins', 'metadata',
                'revision_number', 'route_id', 'change_summary', 'created_by_id'
            ).first()
            if orig:
                if orig['status'] == self.STATUS_ARCHIVED:
                    raise ValidationError(
                        "Archived route revisions are immutable. Create a new draft revision to make modifications."
                    )
                if orig['status'] == self.STATUS_PUBLISHED:
                    status_changed_to_archived = (self.status == self.STATUS_ARCHIVED)
                    fields_changed = (
                        orig['geometry'] != self.geometry or
                        orig['distance_km'] != self.distance_km or
                        orig['duration_mins'] != self.duration_mins or
                        orig['metadata'] != self.metadata or
                        orig['revision_number'] != self.revision_number or
                        orig['route_id'] != self.route_id or
                        orig['change_summary'] != self.change_summary or
                        orig['created_by_id'] != self.created_by_id
                    )
                    if not status_changed_to_archived or fields_changed:
                        raise ValidationError(
                            "Published or archived route revisions are immutable. Create a new draft revision to make modifications."
                        )
                    if status_changed_to_archived:
                        Route = self._meta.apps.get_model('schedules', 'Route')
                        if Route.objects.filter(active_revision_id=self.pk).exists():
                            raise ValidationError(
                                "An active route revision cannot be archived while it is set as the active revision of a route. Publish a new revision to supersede it."
                            )
                if orig['status'] == self.STATUS_DRAFT:
                    if self.status == self.STATUS_PUBLISHED and not getattr(self, '_controlled_publishing', False):
                        raise ValidationError(
                            "Route revisions cannot be directly published via save(). Use Route.publish_revision() to publish a revision."
                        )
                    if self.status == self.STATUS_ARCHIVED:
                        raise ValidationError(
                            "Draft route revisions cannot be archived. Only published revisions can be archived when superseded."
                        )
        else:
            if self.status == self.STATUS_PUBLISHED and not getattr(self, '_controlled_publishing', False):
                raise ValidationError(
                    "Route revisions must be created as drafts and published via Route.publish_revision()."
                )
            if self.status == self.STATUS_ARCHIVED:
                raise ValidationError(
                    "New route revisions cannot be created in archived status."
                )

        from decimal import Decimal
        if self.distance_km is not None and not isinstance(self.distance_km, Decimal):
            try:
                self.distance_km = Decimal(str(round(float(self.distance_km), 2)))
            except (ValueError, TypeError):
                pass

        if not self.pk:
            if not self.revision_number or RouteRevision.objects.filter(route_id=self.route_id, revision_number=self.revision_number).exists():
                max_rev = RouteRevision.objects.filter(route_id=self.route_id).aggregate(Max('revision_number'))['revision_number__max'] or 0
                self.revision_number = max_rev + 1

        self.full_clean()
        super().save(*args, **kwargs)



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
