from django.db import models
from accounts.models import User

class Feedback(models.Model):
    FEEDBACK_TYPE_CHOICES = [
        ('general', 'General'),
        ('authority', 'Authority'),
        ('issue', 'Issue'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='authority_feedbacks')
    feedback_type = models.CharField(max_length=20, choices=FEEDBACK_TYPE_CHOICES, default='general')
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'feedbacks'
        ordering = ['-created_at']

    def __str__(self):
        return f"Feedback from {self.user.get_full_name() or self.user.username} ({self.feedback_type})"
