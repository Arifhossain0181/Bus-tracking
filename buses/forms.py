from django import forms
from .models import Bus, BusAssignment

class BusForm(forms.ModelForm):
    class Meta:
        model = Bus
        fields = ['bus_number', 'license_plate', 'bus_type', 'capacity', 'model', 'year', 'is_active']
        widgets = {
            'bus_number': forms.TextInput(attrs={'class': 'form-control'}),
            'license_plate': forms.TextInput(attrs={'class': 'form-control'}),
            'bus_type': forms.Select(attrs={'class': 'form-select'}),
            'capacity': forms.NumberInput(attrs={'class': 'form-control'}),
            'model': forms.TextInput(attrs={'class': 'form-control'}),
            'year': forms.NumberInput(attrs={'class': 'form-control'}),
            'is_active': forms.CheckboxInput(attrs={'class': 'form-check-input'}),
        }


class BusAssignmentForm(forms.ModelForm):
    class Meta:
        model = BusAssignment
        fields = ['bus', 'driver', 'route']
        widgets = {
            'bus': forms.Select(attrs={'class': 'form-select'}),
            'driver': forms.Select(attrs={'class': 'form-select'}),
            'route': forms.Select(attrs={'class': 'form-select'}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from accounts.models import User
        from schedules.models import Route
        
        # Make driver and route required
        self.fields['driver'].required = True
        self.fields['route'].required = True
        
        # Get drivers who are NOT already assigned to an active bus
        assigned_driver_ids = BusAssignment.objects.filter(
            is_active=True
        ).values_list('driver_id', flat=True)
        
        # Get routes that are NOT already assigned to an active driver
        assigned_route_ids = BusAssignment.objects.filter(
            is_active=True
        ).values_list('route_id', flat=True)
        
        # If editing an existing assignment, include the current driver and route
        if self.instance and self.instance.pk:
            self.fields['driver'].queryset = User.objects.filter(role='driver').exclude(
                id__in=assigned_driver_ids
            ) | User.objects.filter(id=self.instance.driver_id)
            
            self.fields['route'].queryset = Route.objects.filter(is_active=True).exclude(
                id__in=assigned_route_ids
            ) | Route.objects.filter(id=self.instance.route_id)
        else:
            self.fields['driver'].queryset = User.objects.filter(role='driver').exclude(
                id__in=assigned_driver_ids
            )
            
            self.fields['route'].queryset = Route.objects.filter(is_active=True).exclude(
                id__in=assigned_route_ids
            )
    
    def clean(self):
        cleaned_data = super().clean()
        driver = cleaned_data.get('driver')
        route = cleaned_data.get('route')
        
        # Validate both driver and route are provided
        if not driver:
            raise forms.ValidationError("A driver must be selected for the assignment.")
        if not route:
            raise forms.ValidationError("A route must be selected for the assignment.")
        
        if driver:
            # Double-check that driver is not already assigned
            existing = BusAssignment.objects.filter(
                driver=driver, 
                is_active=True
            )
            
            # If editing, exclude current instance
            if self.instance and self.instance.pk:
                existing = existing.exclude(pk=self.instance.pk)
            
            if existing.exists():
                existing_assignment = existing.first()
                raise forms.ValidationError(
                    f"Driver {driver.get_full_name() or driver.username} is already assigned to "
                    f"Bus {existing_assignment.bus.bus_number}. "
                    f"A driver can only be assigned to one bus at a time."
                )
        
        if route:
            # Double-check that route is not already assigned to another driver
            existing_route = BusAssignment.objects.filter(
                route=route, 
                is_active=True
            )
            
            # If editing, exclude current instance
            if self.instance and self.instance.pk:
                existing_route = existing_route.exclude(pk=self.instance.pk)
            
            if existing_route.exists():
                existing_assignment = existing_route.first()
                raise forms.ValidationError(
                    f"Route '{route.name}' already has driver "
                    f"{existing_assignment.driver.get_full_name() or existing_assignment.driver.username} assigned. "
                    f"A route can only have one driver at a time."
                )
        
        return cleaned_data
