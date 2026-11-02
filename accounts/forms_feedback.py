from django import forms
from .models_feedback import Feedback

class FeedbackForm(forms.ModelForm):
    class Meta:
        model = Feedback
        fields = ['message']
        widgets = {
            'message': forms.Textarea(attrs={'class': 'form-control', 'placeholder': 'Enter your feedback here...', 'rows': 4}),
        }
