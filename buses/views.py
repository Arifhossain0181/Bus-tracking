from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.paginator import Paginator
from accounts.decorators import admin_required
from .models import Bus, BusAssignment
from .forms import BusForm, BusAssignmentForm

@login_required
def bus_list(request):
    buses = Bus.objects.select_related('current_route').all()
    
    status = request.GET.get('status')
    if status == 'active':
        buses = buses.filter(is_active=True)
    elif status == 'inactive':
        buses = buses.filter(is_active=False)
    
    paginator = Paginator(buses, 12)
    page = request.GET.get('page')
    buses = paginator.get_page(page)
    
    # Get active assignments for all buses
    active_assignments = BusAssignment.objects.filter(
        is_active=True
    ).select_related('driver', 'route')
    
    # Create a mapping of bus_id to assignment
    assignment_map = {a.bus_id: a for a in active_assignments}
    
    return render(request, 'buses/bus_list.html', {
        'buses': buses,
        'assignment_map': assignment_map
    })


@login_required
def bus_detail(request, pk):
    bus = get_object_or_404(Bus.objects.select_related('current_route'), pk=pk)
    locations = bus.locations.order_by('-timestamp')[:10]
    assignments = bus.assignments.select_related('driver', 'route').order_by('-date')[:5]
    
    return render(request, 'buses/bus_detail.html', {
        'bus': bus,
        'locations': locations,
        'assignments': assignments
    })


@login_required
@admin_required
def bus_create(request):
    if request.method == 'POST':
        form = BusForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'Bus created successfully.')
            return redirect('buses:bus_list')
    else:
        form = BusForm()
    
    return render(request, 'buses/bus_form.html', {'form': form, 'title': 'Add New Bus'})


@login_required
@admin_required
def bus_edit(request, pk):
    bus = get_object_or_404(Bus, pk=pk)
    
    if request.method == 'POST':
        form = BusForm(request.POST, instance=bus)
        if form.is_valid():
            form.save()
            messages.success(request, 'Bus updated successfully.')
            return redirect('buses:bus_detail', pk=pk)
    else:
        form = BusForm(instance=bus)
    
    return render(request, 'buses/bus_form.html', {'form': form, 'title': 'Edit Bus', 'bus': bus})


@login_required
@admin_required
def bus_delete(request, pk):
    bus = get_object_or_404(Bus, pk=pk)
    
    if request.method == 'POST':
        bus.delete()
        messages.success(request, 'Bus deleted successfully.')
        return redirect('buses:bus_list')
    
    return render(request, 'buses/bus_confirm_delete.html', {'bus': bus})


@login_required
def live_map(request):
    return render(request, 'buses/live_map.html')


@login_required
def follow_bus(request, pk):
    bus = get_object_or_404(Bus, pk=pk)
    return render(request, 'buses/follow_bus.html', {'bus': bus})


@login_required
@admin_required
def assignment_list(request):
    assignments = BusAssignment.objects.select_related('bus', 'driver', 'route').order_by('-date')
    paginator = Paginator(assignments, 20)
    page = request.GET.get('page')
    assignments = paginator.get_page(page)
    
    return render(request, 'buses/assignment_list.html', {'assignments': assignments})


@login_required
@admin_required
def assignment_create(request):
    bus_id = request.GET.get('bus')
    bus = None
    if bus_id:
        bus = get_object_or_404(Bus, pk=bus_id)
    
    if request.method == 'POST':
        form = BusAssignmentForm(request.POST)
        if form.is_valid():
            assignment = form.save()
            # Update the bus's current route and deactivate previous assignments
            bus_obj = assignment.bus
            bus_obj.current_route = assignment.route
            bus_obj.save()
            # Deactivate other assignments for this bus
            BusAssignment.objects.filter(bus=bus_obj, is_active=True).exclude(pk=assignment.pk).update(is_active=False)
            
            # Auto-create schedules based on route's service days and trips
            route = assignment.route
            from schedules.models import Schedule
            
            # Determine which days to create schedules for
            day_mapping = {
                'sat-thu': ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'],
                'sun-thu': ['sun', 'mon', 'tue', 'wed', 'thu'],
                'mon-fri': ['mon', 'tue', 'wed', 'thu', 'fri'],
                'all': ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'],
            }
            
            if route.service_days == 'custom' and route.custom_days:
                days = route.custom_days.split(',')
            else:
                days = day_mapping.get(route.service_days, ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'])
            
            # Delete old schedules for this route/bus combination
            Schedule.objects.filter(route=route, bus=bus_obj).delete()
            
            # Create schedules from route trips or pickup points
            if route.trips.exists():
                for trip in route.trips.all():
                    for day in days:
                        Schedule.objects.create(
                            route=route,
                            bus=bus_obj,
                            driver=assignment.driver,
                            day_of_week=day,
                            departure_time=trip.departure_time,
                            arrival_time=trip.arrival_time or trip.departure_time,
                            is_active=True
                        )
            elif route.stops.exists():
                # For Long Road routes, use first and last pickup times
                first_stop = route.stops.order_by('order').first()
                last_stop = route.stops.order_by('order').last()
                if first_stop and first_stop.scheduled_time:
                    for day in days:
                        Schedule.objects.create(
                            route=route,
                            bus=bus_obj,
                            driver=assignment.driver,
                            day_of_week=day,
                            departure_time=first_stop.scheduled_time,
                            arrival_time=last_stop.scheduled_time if last_stop and last_stop.scheduled_time else first_stop.scheduled_time,
                            is_active=True
                        )
            
            messages.success(request, f'Bus {bus_obj.bus_number} assigned to route "{assignment.route.name}" with driver {assignment.driver.get_full_name() or assignment.driver.username}. Schedules updated.')
            if bus:
                return redirect('buses:bus_list')
            return redirect('buses:assignment_list')
    else:
        initial = {}
        if bus:
            initial['bus'] = bus
        form = BusAssignmentForm(initial=initial)
    
    return render(request, 'buses/assignment_form.html', {
        'form': form, 
        'title': 'Create Assignment',
        'selected_bus': bus
    })


@login_required
@admin_required
def assignment_clear(request, bus_id):
    """Clear/deactivate the active assignment for a bus."""
    bus = get_object_or_404(Bus, pk=bus_id)
    
    # Get active assignment for this bus
    assignment = BusAssignment.objects.filter(bus=bus, is_active=True).first()
    
    if not assignment:
        messages.warning(request, f'Bus {bus.bus_number} has no active assignment to clear.')
        return redirect('buses:bus_list')
    
    if request.method == 'POST':
        # Deactivate the assignment
        driver_name = assignment.driver.get_full_name() or assignment.driver.username
        route_name = assignment.route.name
        
        assignment.is_active = False
        assignment.save()
        
        # Clear bus current route
        bus.current_route = None
        bus.save()
        
        # Deactivate related schedules
        from schedules.models import Schedule
        Schedule.objects.filter(bus=bus, driver=assignment.driver, is_active=True).update(is_active=False)
        
        messages.success(request, f'Assignment cleared: Bus {bus.bus_number} was unassigned from route "{route_name}" and driver {driver_name}.')
        return redirect('buses:bus_list')
    
    return render(request, 'buses/assignment_clear_confirm.html', {
        'bus': bus,
        'assignment': assignment
    })
