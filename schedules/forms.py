from django import forms
from .models import Route, Stop, Schedule, Trip, TripStopTime

class RouteForm(forms.ModelForm):
    class Meta:
        model = Route
        fields = ['name', 'description', 'route_type', 'service_days', 'origin_name', 'destination_name', 
                  'is_active', 'is_published', 'total_distance_km', 'estimated_duration_mins']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g., Campus - Azampur - Campus'}),
            'description': forms.Textarea(attrs={'class': 'form-control', 'rows': 2}),
            'route_type': forms.RadioSelect(attrs={'class': 'form-check-input'}),
            'service_days': forms.Select(attrs={'class': 'form-select'}),
            'origin_name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g., Campus'}),
            'destination_name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g., Azampur'}),
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'is_published': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'total_distance_km': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.01'}),
            'estimated_duration_mins': forms.NumberInput(attrs={'class': 'form-control'}),
        }


class ShuttleTripForm(forms.ModelForm):
    """Simplified form for Shuttle/Metro trips"""
    class Meta:
        model = Trip
        fields = ['trip_number', 'departure_time', 'arrival_time']
        widgets = {
            'trip_number': forms.NumberInput(attrs={'class': 'form-control', 'readonly': True}),
            'departure_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'arrival_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
        }


class StopForm(forms.ModelForm):
    class Meta:
        model = Stop
        fields = ['name', 'latitude', 'longitude', 'order', 'scheduled_time', 'average_wait_time', 'is_major_stop']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control'}),
            'latitude': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.0000001'}),
            'longitude': forms.NumberInput(attrs={'class': 'form-control', 'step': '0.0000001'}),
            'order': forms.NumberInput(attrs={'class': 'form-control'}),
            'scheduled_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'average_wait_time': forms.NumberInput(attrs={'class': 'form-control'}),
            'is_major_stop': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
        }


class ScheduleForm(forms.ModelForm):
    class Meta:
        model = Schedule
        fields = ['route', 'day_of_week', 'departure_time', 'arrival_time', 'is_active', 'notes']
        widgets = {
            'route': forms.Select(attrs={'class': 'form-select'}),
            'day_of_week': forms.Select(attrs={'class': 'form-select'}),
            'departure_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'arrival_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'notes': forms.Textarea(attrs={'class': 'form-control', 'rows': 2}),
        }


class TripForm(forms.ModelForm):
    class Meta:
        model = Trip
        fields = ['name', 'departure_time', 'arrival_time', 'is_active', 'order']
        widgets = {
            'name': forms.TextInput(attrs={'class': 'form-control', 'placeholder': 'e.g., Morning Trip 1'}),
            'departure_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'arrival_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
            'order': forms.NumberInput(attrs={'class': 'form-control'}),
        }


class TripStopTimeForm(forms.ModelForm):
    class Meta:
        model = TripStopTime
        fields = ['stop', 'arrival_time', 'departure_time', 'order']
        widgets = {
            'stop': forms.Select(attrs={'class': 'form-select'}),
            'arrival_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'departure_time': forms.TimeInput(attrs={'class': 'form-control', 'type': 'time'}),
            'order': forms.NumberInput(attrs={'class': 'form-control'}),
        }
