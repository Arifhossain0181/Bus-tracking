from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from .models import User, DriverProfile

class LoginForm(AuthenticationForm):
    username = forms.CharField(widget=forms.TextInput(attrs={
        'class': 'form-control',
        'placeholder': 'Username'
    }))
    password = forms.CharField(widget=forms.PasswordInput(attrs={
        'class': 'form-control',
        'placeholder': 'Password'
    }))

class UserRegistrationForm(forms.ModelForm):
    """Simplified registration form - uses University ID as password"""
    full_name = forms.CharField(widget=forms.TextInput(attrs={
        'class': 'form-control',
        'placeholder': 'Enter your full name'
    }), help_text='Your full name as registered with the university')
    username = forms.CharField(widget=forms.TextInput(attrs={
        'class': 'form-control',
        'placeholder': 'Choose a username'
    }))
    university_id = forms.CharField(widget=forms.TextInput(attrs={
        'class': 'form-control',
        'placeholder': 'University ID (e.g., STU-2024-001)'
    }), help_text='Your University ID will be used as your password')
    role = forms.ChoiceField(choices=[
        ('student', 'Student'),
        ('faculty', 'Faculty'),
        ('staff', 'Staff'),
    ], widget=forms.Select(attrs={'class': 'form-select'}))

    class Meta:
        model = User
        fields = ['username', 'university_id', 'role']

    def clean_username(self):
        username = self.cleaned_data.get('username')
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError('This username is already taken.')
        return username

    def clean_university_id(self):
        university_id = self.cleaned_data.get('university_id')
        if User.objects.filter(university_id=university_id).exists():
            raise forms.ValidationError('This University ID is already registered.')
        if len(university_id) < 4:
            raise forms.ValidationError('University ID must be at least 4 characters.')
        return university_id

    def save(self, commit=True):
        user = super().save(commit=False)
        # Split full name into first and last name
        full_name = self.cleaned_data.get('full_name', '').strip()
        name_parts = full_name.split(' ', 1)
        user.first_name = name_parts[0]
        user.last_name = name_parts[1] if len(name_parts) > 1 else ''
        # Set password to university_id
        user.set_password(self.cleaned_data['university_id'])
        user.approval_status = 'pending'
        user.is_active = False
        if commit:
            user.save()
        return user


class UserProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'phone', 'profile_picture']
        widgets = {
            'first_name': forms.TextInput(attrs={'class': 'form-control'}),
            'last_name': forms.TextInput(attrs={'class': 'form-control'}),
            'email': forms.EmailInput(attrs={'class': 'form-control'}),
            'phone': forms.TextInput(attrs={'class': 'form-control'}),
            'profile_picture': forms.FileInput(attrs={'class': 'form-control'}),
        }


class DriverProfileForm(forms.ModelForm):
    class Meta:
        model = DriverProfile
        fields = ['license_number', 'license_expiry', 'emergency_contact', 'years_experience']
        widgets = {
            'license_number': forms.TextInput(attrs={'class': 'form-control'}),
            'license_expiry': forms.DateInput(attrs={'class': 'form-control', 'type': 'date'}),
            'emergency_contact': forms.TextInput(attrs={'class': 'form-control'}),
            'years_experience': forms.NumberInput(attrs={'class': 'form-control'}),
        }
