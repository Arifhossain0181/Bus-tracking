from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from accounts.decorators import driver_required
from buses.models import Journey

@login_required
@driver_required
def share_location(request):
    """Driver location sharing page."""
    return render(request, 'locations/share_location.html')


@login_required
def live_map(request):
    """Universal live map showing all active buses."""
    # Get user's role for permission-based features
    user = request.user
    context = {
        'user_role': user.role,
        'can_see_all_buses': user.role in ['admin', 'authority'],
        'can_track_driver': user.role in ['admin', 'authority'],
    }
    return render(request, 'live_map.html', context)


@login_required
def journey_history(request):
    """View journey history - for admin and authority users."""
    if request.user.role not in ['admin', 'authority']:
        from django.contrib import messages
        messages.error(request, 'You do not have permission to view this page.')
        from django.shortcuts import redirect
        return redirect('accounts:dashboard')
    
    journeys = Journey.objects.select_related('driver', 'bus', 'route').order_by('-start_time')[:100]
    context = {
        'journeys': journeys,
    }
    return render(request, 'locations/journey_history.html', context)
