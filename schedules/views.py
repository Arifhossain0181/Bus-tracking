from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.core.paginator import Paginator
from django.db.models import Q
from accounts.decorators import admin_required
from .models import Route, Stop, Schedule, Trip, TripStopTime
from .forms import RouteForm, StopForm, ScheduleForm, TripForm, TripStopTimeForm

@login_required
def route_list(request):
    routes = Route.objects.prefetch_related('stops').all()
    
    search = request.GET.get('search')
    if search:
        routes = routes.filter(Q(name__icontains=search) | Q(description__icontains=search))
    
    status = request.GET.get('status')
    if status == 'active':
        routes = routes.filter(is_active=True)
    elif status == 'inactive':
        routes = routes.filter(is_active=False)
    
    paginator = Paginator(routes, 12)
    page = request.GET.get('page')
    routes = paginator.get_page(page)
    
    return render(request, 'schedules/route_list.html', {'routes': routes})


@login_required
def route_detail(request, pk):
    route = get_object_or_404(Route.objects.prefetch_related('stops', 'schedules'), pk=pk)
    stops = route.stops.order_by('order')
    schedules = route.schedules.filter(is_active=True).order_by('day_of_week', 'departure_time')
    
    from buses.models import Bus
    active_buses = Bus.objects.filter(current_route=route, is_active=True)
    
    return render(request, 'schedules/route_detail.html', {
        'route': route,
        'stops': stops,
        'schedules': schedules,
        'active_buses': active_buses
    })


@login_required
@admin_required
def route_create(request):
    if request.method == 'POST':
        route_type = request.POST.get('route_type', 'shuttle')
        
        # Handle Long Road route separately
        if route_type == 'long':
            service_days = request.POST.get('long_service_days', 'sat-thu')
            custom_days = ''
            if service_days == 'custom':
                custom_days = request.POST.get('long_custom_days', '')
            
            route = Route.objects.create(
                name=request.POST.get('long_route_name', ''),
                description=request.POST.get('long_description', ''),
                route_type='long',
                service_days=service_days,
                custom_days=custom_days,
                destination_name=request.POST.get('final_destination', ''),
                is_active=True,
                is_published=True
            )
            
            # Create pickup points as stops
            pickup_names = request.POST.getlist('pickup_name[]')
            pickup_times = request.POST.getlist('pickup_time[]')
            pickup_orders = request.POST.getlist('pickup_order[]')
            
            for i, name in enumerate(pickup_names):
                if name:
                    Stop.objects.create(
                        route=route,
                        name=name,
                        latitude=0,
                        longitude=0,
                        order=int(pickup_orders[i]) if i < len(pickup_orders) else i + 1,
                        scheduled_time=pickup_times[i] if i < len(pickup_times) and pickup_times[i] else None,
                        is_major_stop=True
                    )
            
            messages.success(request, 'Long Road route created successfully.')
            return redirect('schedules:route_detail', pk=route.pk)
        
        # Shuttle/Metro route
        form = RouteForm(request.POST)
        if form.is_valid():
            route = form.save(commit=False)
            route.is_active = True
            route.is_published = True
            if route.service_days == 'custom':
                route.custom_days = request.POST.get('custom_days', '')
            route.save()
            
            # Handle Shuttle/Metro trips
            if route.is_shuttle_or_metro:
                trip_ids = request.POST.getlist('trip_id[]')
                trip_numbers = request.POST.getlist('trip_number[]')
                departure_times = request.POST.getlist('departure_time[]')
                arrival_times = request.POST.getlist('arrival_time[]')
                
                for i, trip_num in enumerate(trip_numbers):
                    if departure_times[i]:
                        Trip.objects.create(
                            route=route,
                            name=f"Trip {int(trip_num):02d}",
                            trip_number=int(trip_num),
                            departure_time=departure_times[i],
                            arrival_time=arrival_times[i] if arrival_times[i] else None,
                            order=i
                        )
            
            messages.success(request, 'Route created successfully.')
            return redirect('schedules:route_detail', pk=route.pk)
        else:
            # Form has errors - show them to the user
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f"{field}: {error}")
    else:
        form = RouteForm()
    
    return render(request, 'schedules/route_builder.html', {'form': form, 'title': 'Create Route'})


@login_required
@admin_required
def route_edit(request, pk):
    route = get_object_or_404(Route, pk=pk)
    trips = route.trips.order_by('trip_number') if route.is_shuttle_or_metro else None
    pickup_points = route.stops.order_by('order') if route.route_type == 'long' else None
    
    if request.method == 'POST':
        route_type = request.POST.get('route_type', route.route_type)
        
        # Handle Long Road route
        if route_type == 'long':
            route.name = request.POST.get('long_route_name', route.name)
            route.description = request.POST.get('long_description', '')
            route.route_type = 'long'
            route.service_days = request.POST.get('long_service_days', 'sat-thu')
            route.destination_name = request.POST.get('final_destination', '')
            # Handle custom days for Long Road
            if route.service_days == 'custom':
                route.custom_days = request.POST.get('long_custom_days', '')
            else:
                route.custom_days = ''
            route.is_active = True
            route.is_published = True
            route.save()
            
            # Handle pickup points (stops)
            pickup_ids = request.POST.getlist('pickup_id[]')
            pickup_names = request.POST.getlist('pickup_name[]')
            pickup_times = request.POST.getlist('pickup_time[]')
            pickup_orders = request.POST.getlist('pickup_order[]')
            
            existing_ids = set(route.stops.values_list('id', flat=True))
            submitted_ids = set()
            
            for i, name in enumerate(pickup_names):
                if name:
                    pickup_id = pickup_ids[i] if i < len(pickup_ids) and pickup_ids[i] else None
                    order = int(pickup_orders[i]) if i < len(pickup_orders) else i + 1
                    time = pickup_times[i] if i < len(pickup_times) and pickup_times[i] else None
                    
                    if pickup_id:
                        try:
                            stop = Stop.objects.get(id=int(pickup_id), route=route)
                            stop.name = name
                            stop.order = order
                            stop.scheduled_time = time
                            stop.save()
                            submitted_ids.add(int(pickup_id))
                        except Stop.DoesNotExist:
                            pass
                    else:
                        Stop.objects.create(
                            route=route,
                            name=name,
                            latitude=0,
                            longitude=0,
                            order=order,
                            scheduled_time=time,
                            is_major_stop=True
                        )
            
            # Delete removed stops
            stops_to_delete = existing_ids - submitted_ids
            if stops_to_delete:
                Stop.objects.filter(id__in=stops_to_delete, route=route).delete()
            
            messages.success(request, 'Long Road route updated successfully.')
            return redirect('schedules:route_detail', pk=pk)
        
        # Shuttle/Metro route
        form = RouteForm(request.POST, instance=route)
        if form.is_valid():
            route = form.save(commit=False)
            route.is_active = True
            route.is_published = True
            if route.service_days == 'custom':
                route.custom_days = request.POST.get('custom_days', '')
            else:
                route.custom_days = ''
            route.save()
            
            # Handle Shuttle/Metro trips
            if route.is_shuttle_or_metro:
                trip_ids = request.POST.getlist('trip_id[]')
                trip_numbers = request.POST.getlist('trip_number[]')
                departure_times = request.POST.getlist('departure_time[]')
                arrival_times = request.POST.getlist('arrival_time[]')
                
                existing_ids = set(route.trips.values_list('id', flat=True))
                submitted_ids = set()
                
                for i, trip_num in enumerate(trip_numbers):
                    if departure_times[i]:
                        trip_id = trip_ids[i] if i < len(trip_ids) and trip_ids[i] else None
                        
                        if trip_id:
                            try:
                                trip = Trip.objects.get(id=int(trip_id), route=route)
                                trip.trip_number = int(trip_num)
                                trip.name = f"Trip {int(trip_num):02d}"
                                trip.departure_time = departure_times[i]
                                trip.arrival_time = arrival_times[i] if arrival_times[i] else None
                                trip.order = i
                                trip.save()
                                submitted_ids.add(int(trip_id))
                            except Trip.DoesNotExist:
                                pass
                        else:
                            Trip.objects.create(
                                route=route,
                                name=f"Trip {int(trip_num):02d}",
                                trip_number=int(trip_num),
                                departure_time=departure_times[i],
                                arrival_time=arrival_times[i] if arrival_times[i] else None,
                                order=i
                            )
                
                trips_to_delete = existing_ids - submitted_ids
                if trips_to_delete:
                    Trip.objects.filter(id__in=trips_to_delete, route=route).delete()
            
            messages.success(request, 'Route updated successfully.')
            return redirect('schedules:route_detail', pk=pk)
        else:
            # Form has errors - show them to the user
            for field, errors in form.errors.items():
                for error in errors:
                    messages.error(request, f"{field}: {error}")
    else:
        form = RouteForm(instance=route)
    
    return render(request, 'schedules/route_builder.html', {
        'form': form, 
        'title': 'Edit Route', 
        'route': route,
        'trips': trips,
        'pickup_points': pickup_points
    })


@login_required
@admin_required
def route_delete(request, pk):
    route = get_object_or_404(Route, pk=pk)
    
    if request.method == 'POST':
        route.delete()
        messages.success(request, 'Route deleted successfully.')
        return redirect('schedules:route_list')
    
    return render(request, 'schedules/route_confirm_delete.html', {'route': route})


@login_required
@admin_required
def stop_create(request, route_pk):
    route = get_object_or_404(Route, pk=route_pk)
    
    if request.method == 'POST':
        form = StopForm(request.POST)
        if form.is_valid():
            stop = form.save(commit=False)
            stop.route = route
            stop.save()
            messages.success(request, 'Stop added successfully.')
            return redirect('schedules:route_detail', pk=route_pk)
    else:
        next_order = route.stops.count() + 1
        form = StopForm(initial={'order': next_order})
    
    return render(request, 'schedules/stop_form.html', {'form': form, 'route': route, 'title': 'Add Stop'})


@login_required
@admin_required
def stop_edit(request, pk):
    stop = get_object_or_404(Stop, pk=pk)
    
    if request.method == 'POST':
        form = StopForm(request.POST, instance=stop)
        if form.is_valid():
            form.save()
            messages.success(request, 'Stop updated successfully.')
            return redirect('schedules:route_detail', pk=stop.route.pk)
    else:
        form = StopForm(instance=stop)
    
    return render(request, 'schedules/stop_form.html', {'form': form, 'route': stop.route, 'title': 'Edit Stop', 'stop': stop})


@login_required
@admin_required
def stop_delete(request, pk):
    stop = get_object_or_404(Stop, pk=pk)
    route_pk = stop.route.pk
    
    if request.method == 'POST':
        stop.delete()
        messages.success(request, 'Stop deleted successfully.')
        return redirect('schedules:route_detail', pk=route_pk)
    
    return render(request, 'schedules/stop_confirm_delete.html', {'stop': stop})


@login_required
def schedule_list(request):
    """Display schedules organized by route type: Shuttle, Metro, Long Road
    Only shows routes that have active bus assignments."""
    from buses.models import BusAssignment
    from locations.models import DriverLocation

    # Get active bus assignments
    assignments = BusAssignment.objects.filter(is_active=True).select_related('bus', 'driver', 'route')

    # Build assignment map and get route IDs that have assignments
    assignment_map = {}
    assigned_route_ids = set()
    driver_ids = set()
    for assignment in assignments:
        assigned_route_ids.add(assignment.route_id)
        if assignment.route_id not in assignment_map:
            assignment_map[assignment.route_id] = []
        assignment_map[assignment.route_id].append(assignment)
        if assignment.driver:
            driver_ids.add(assignment.driver.id)

    # Get live status for all assigned drivers
    driver_live_status = {}
    if driver_ids:
        for loc in DriverLocation.objects.filter(driver_id__in=driver_ids):
            driver_live_status[loc.driver_id] = loc.is_active

    # Only get routes that have active bus assignments
    shuttle_routes = Route.objects.filter(
        route_type='shuttle', is_active=True, is_published=True,
        id__in=assigned_route_ids
    ).prefetch_related('trips', 'stops')

    metro_routes = Route.objects.filter(
        route_type='metro', is_active=True, is_published=True,
        id__in=assigned_route_ids
    ).prefetch_related('trips', 'stops')

    long_routes = Route.objects.filter(
        route_type='long', is_active=True, is_published=True,
        id__in=assigned_route_ids
    ).prefetch_related('stops')

    context = {
        'shuttle_routes': shuttle_routes,
        'metro_routes': metro_routes,
        'long_routes': long_routes,
        'assignment_map': assignment_map,
        'driver_live_status': driver_live_status,
    }

    return render(request, 'schedules/schedule_list.html', context)


@login_required
@admin_required
def schedule_create(request):
    if request.method == 'POST':
        form = ScheduleForm(request.POST)
        if form.is_valid():
            form.save()
            messages.success(request, 'Schedule created successfully.')
            return redirect('schedules:schedule_list')
    else:
        form = ScheduleForm()
    
    return render(request, 'schedules/schedule_form.html', {'form': form, 'title': 'Create Schedule'})


@login_required
@admin_required
def schedule_edit(request, pk):
    schedule = get_object_or_404(Schedule, pk=pk)
    
    if request.method == 'POST':
        form = ScheduleForm(request.POST, instance=schedule)
        if form.is_valid():
            form.save()
            messages.success(request, 'Schedule updated successfully.')
            return redirect('schedules:schedule_list')
    else:
        form = ScheduleForm(instance=schedule)
    
    return render(request, 'schedules/schedule_form.html', {'form': form, 'title': 'Edit Schedule', 'schedule': schedule})


@login_required
@admin_required
def schedule_delete(request, pk):
    schedule = get_object_or_404(Schedule, pk=pk)
    
    if request.method == 'POST':
        schedule.delete()
        messages.success(request, 'Schedule deleted successfully.')
        return redirect('schedules:schedule_list')
    
    return render(request, 'schedules/schedule_confirm_delete.html', {'schedule': schedule})


@login_required
def user_schedules(request):
    """User-facing schedules page with expandable routes and live ETAs"""
    routes = Route.objects.prefetch_related(
        'stops', 
        'trips', 
        'trips__stop_times', 
        'trips__stop_times__stop'
    ).filter(is_active=True, is_published=True).order_by('route_type', 'name')
    
    search = request.GET.get('search')
    if search:
        routes = routes.filter(Q(name__icontains=search) | Q(stops__name__icontains=search)).distinct()
    
    route_type = request.GET.get('type')
    if route_type in ['long', 'shuttle']:
        routes = routes.filter(route_type=route_type)
    
    return render(request, 'schedules/user_schedules.html', {'routes': routes})


# Trip Management Views
@login_required
@admin_required
def trip_create(request, route_pk):
    """Create a new trip for a route"""
    route = get_object_or_404(Route, pk=route_pk)
    
    if request.method == 'POST':
        form = TripForm(request.POST)
        if form.is_valid():
            trip = form.save(commit=False)
            trip.route = route
            trip.save()
            messages.success(request, f'Trip "{trip.name}" created successfully.')
            return redirect('schedules:trip_detail', pk=trip.pk)
    else:
        next_order = route.trips.count() + 1
        form = TripForm(initial={'order': next_order})
    
    return render(request, 'schedules/trip_form.html', {'form': form, 'route': route, 'title': 'Create Trip'})


@login_required
@admin_required
def trip_detail(request, pk):
    """View trip details with stop times"""
    trip = get_object_or_404(Trip.objects.prefetch_related('stop_times', 'stop_times__stop'), pk=pk)
    available_stops = trip.route.stops.exclude(id__in=trip.stop_times.values_list('stop_id', flat=True))
    
    return render(request, 'schedules/trip_detail.html', {
        'trip': trip,
        'available_stops': available_stops
    })


@login_required
@admin_required
def trip_edit(request, pk):
    """Edit a trip"""
    trip = get_object_or_404(Trip, pk=pk)
    
    if request.method == 'POST':
        form = TripForm(request.POST, instance=trip)
        if form.is_valid():
            form.save()
            messages.success(request, 'Trip updated successfully.')
            return redirect('schedules:trip_detail', pk=pk)
    else:
        form = TripForm(instance=trip)
    
    return render(request, 'schedules/trip_form.html', {'form': form, 'route': trip.route, 'trip': trip, 'title': 'Edit Trip'})


@login_required
@admin_required
def trip_delete(request, pk):
    """Delete a trip"""
    trip = get_object_or_404(Trip, pk=pk)
    route_pk = trip.route.pk
    
    if request.method == 'POST':
        trip.delete()
        messages.success(request, 'Trip deleted successfully.')
        return redirect('schedules:route_detail', pk=route_pk)
    
    return render(request, 'schedules/trip_confirm_delete.html', {'trip': trip})


@login_required
@admin_required
def trip_stop_add(request, trip_pk):
    """Add a stop time to a trip"""
    trip = get_object_or_404(Trip, pk=trip_pk)
    
    if request.method == 'POST':
        form = TripStopTimeForm(request.POST)
        form.fields['stop'].queryset = trip.route.stops.all()
        if form.is_valid():
            stop_time = form.save(commit=False)
            stop_time.trip = trip
            stop_time.save()
            messages.success(request, f'Stop time for "{stop_time.stop.name}" added.')
            return redirect('schedules:trip_detail', pk=trip_pk)
    else:
        next_order = trip.stop_times.count() + 1
        form = TripStopTimeForm(initial={'order': next_order})
        form.fields['stop'].queryset = trip.route.stops.exclude(
            id__in=trip.stop_times.values_list('stop_id', flat=True)
        )
    
    return render(request, 'schedules/trip_stop_form.html', {'form': form, 'trip': trip, 'title': 'Add Stop Time'})


@login_required
@admin_required
def trip_stop_delete(request, pk):
    """Delete a stop time from a trip"""
    stop_time = get_object_or_404(TripStopTime, pk=pk)
    trip_pk = stop_time.trip.pk
    
    if request.method == 'POST':
        stop_time.delete()
        messages.success(request, 'Stop time removed.')
        return redirect('schedules:trip_detail', pk=trip_pk)
    
    return render(request, 'schedules/trip_stop_confirm_delete.html', {'stop_time': stop_time})


@login_required
@admin_required
def publish_route(request, pk):
    """Publish a route to make it visible to users"""
    route = get_object_or_404(Route, pk=pk)
    
    if request.method == 'POST':
        route.is_published = True
        route.is_active = True
        route.save()
        messages.success(request, f'Route "{route.name}" has been published and marked as active.')
    
    return redirect('schedules:route_detail', pk=pk)


@login_required
@admin_required
def unpublish_route(request, pk):
    """Unpublish a route to hide it from users"""
    route = get_object_or_404(Route, pk=pk)
    
    if request.method == 'POST':
        route.is_published = False
        route.is_active = False
        route.save()
        messages.success(request, f'Route "{route.name}" has been unpublished and marked as inactive.')
    
    return redirect('schedules:route_detail', pk=pk)
