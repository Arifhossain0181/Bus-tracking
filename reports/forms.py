from django import forms
from .models import UserFeedback

class FeedbackForm(forms.ModelForm):
    class Meta:
        model = UserFeedback
        fields = ['route', 'bus', 'category', 'rating', 'comment', 'is_anonymous']
        widgets = {
            'route': forms.Select(attrs={'class': 'form-select'}),
            'bus': forms.Select(attrs={'class': 'form-select'}),
            'category': forms.Select(attrs={'class': 'form-select'}),
            'rating': forms.Select(attrs={'class': 'form-select'}),
            'comment': forms.Textarea(attrs={'class': 'form-control', 'rows': 4}),
            'is_anonymous': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from schedules.models import Route
        from buses.models import Bus
        self.fields['route'].queryset = Route.objects.filter(is_active=True)
        self.fields['route'].required = False
        self.fields['bus'].queryset = Bus.objects.filter(is_active=True)
        self.fields['bus'].required = False


class DateRangeForm(forms.Form):
    start_date = forms.DateField(widget=forms.DateInput(attrs={
        'class': 'form-control', 'type': 'date'
    }))
    end_date = forms.DateField(widget=forms.DateInput(attrs={
        'class': 'form-control', 'type': 'date'
    }))
