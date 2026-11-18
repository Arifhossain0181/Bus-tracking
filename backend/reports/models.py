from django.db import models
from accounts.models import User
from schedules.models import Route
from buses.models import Bus

class TripLog(models.Model):
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='trip_logs')
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='trip_logs')
    driver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='trip_logs')
    date = models.DateField()
    scheduled_departure = models.TimeField()
    actual_departure = models.TimeField(null=True, blank=True)
    scheduled_arrival = models.TimeField()
    actual_arrival = models.TimeField(null=True, blank=True)
    passenger_count = models.PositiveIntegerField(default=0)
    is_completed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trip_logs'
        ordering = ['-date', '-scheduled_departure']

    def __str__(self):
        return f"{self.route.name} - {self.date}"

    @property
    def departure_delay_mins(self):
        if self.actual_departure and self.scheduled_departure:
            from datetime import datetime, timedelta
            scheduled = datetime.combine(self.date, self.scheduled_departure)
            actual = datetime.combine(self.date, self.actual_departure)
            diff = (actual - scheduled).total_seconds() / 60
            return max(0, int(diff))
        return 0

    @property
    def is_on_time(self):
        return self.departure_delay_mins <= 5


class UserFeedback(models.Model):
    RATING_CHOICES = [(i, str(i)) for i in range(1, 6)]
    
    CATEGORY_CHOICES = [
        ('service', 'Service Quality'),
        ('timing', 'Timing/Punctuality'),
        ('cleanliness', 'Cleanliness'),
        ('driver', 'Driver Behavior'),
        ('app', 'App/System'),
        ('other', 'Other'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='feedbacks')
    route = models.ForeignKey(Route, on_delete=models.SET_NULL, null=True, blank=True, related_name='feedbacks')
    bus = models.ForeignKey(Bus, on_delete=models.SET_NULL, null=True, blank=True, related_name='feedbacks')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES)
    rating = models.PositiveIntegerField(choices=RATING_CHOICES)
    comment = models.TextField(blank=True)
    is_anonymous = models.BooleanField(default=False)
    is_resolved = models.BooleanField(default=False)
    admin_response = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_feedbacks'
        ordering = ['-created_at']

    def __str__(self):
        return f"Feedback by {self.user.username} - {self.get_category_display()}"


class RouteAnalytics(models.Model):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='analytics')
    date = models.DateField()
    total_trips = models.PositiveIntegerField(default=0)
    on_time_trips = models.PositiveIntegerField(default=0)
    delayed_trips = models.PositiveIntegerField(default=0)
    total_passengers = models.PositiveIntegerField(default=0)
    average_delay_mins = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    issues_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'route_analytics'
        unique_together = ['route', 'date']
        ordering = ['-date']

    def __str__(self):
        return f"{self.route.name} - {self.date}"

    @property
    def on_time_percentage(self):
        if self.total_trips > 0:
            return round((self.on_time_trips / self.total_trips) * 100, 1)
        return 0
