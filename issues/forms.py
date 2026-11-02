from django import forms
from .models import Issue, IssueComment

class IssueForm(forms.ModelForm):
    class Meta:
        model = Issue
        fields = ['issue_type', 'description', 'priority']
        widgets = {
            'issue_type': forms.Select(attrs={'class': 'form-select'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
            'priority': forms.Select(attrs={'class': 'form-select'}),
        }


class IssueUpdateForm(forms.ModelForm):
    class Meta:
        model = Issue
        fields = ['status', 'priority', 'assigned_to', 'resolution_notes']
        widgets = {
            'status': forms.Select(attrs={'class': 'form-select'}),
            'priority': forms.Select(attrs={'class': 'form-select'}),
            'assigned_to': forms.Select(attrs={'class': 'form-select'}),
            'resolution_notes': forms.Textarea(attrs={'class': 'form-control', 'rows': 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import User
        self.fields['assigned_to'].queryset = User.objects.filter(role__in=['admin', 'authority'])


class IssueCommentForm(forms.ModelForm):
    class Meta:
        model = IssueComment
        fields = ['comment']
        widgets = {
            'comment': forms.Textarea(attrs={'class': 'form-control', 'rows': 2, 'placeholder': 'Add a comment...'}),
        }
