from django import forms
from .models import Notification
from schedules.models import Route

class NotificationForm(forms.ModelForm):
    class Meta:
        model = Notification
        fields = ['title', 'message', 'priority', 'target', 'target_route', 'expires_at']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'form-control'}),
            'message': forms.Textarea(attrs={'class': 'form-control', 'rows': 4}),
            'priority': forms.Select(attrs={'class': 'form-select'}),
            'target': forms.Select(attrs={'class': 'form-select'}),
            'target_route': forms.Select(attrs={'class': 'form-select'}),
            'expires_at': forms.DateTimeInput(attrs={'class': 'form-control', 'type': 'datetime-local'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['target_route'].queryset = Route.objects.filter(is_active=True)
        self.fields['target_route'].required = False
        self.fields['expires_at'].required = False
