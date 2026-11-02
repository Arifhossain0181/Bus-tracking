from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.db.models import Count, Avg, Sum, Q
from django.utils import timezone
from datetime import timedelta
from accounts.decorators import admin_or_authority_required
from schedules.models import Route
from buses.models import Bus
from issues.models import Issue
from .models import TripLog, UserFeedback, RouteAnalytics
from .forms import FeedbackForm, DateRangeForm

@login_required
@admin_or_authority_required
def report_list(request):
    return render(request, 'reports/report_list.html')


@login_required
@admin_or_authority_required
def route_popularity(request):
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=30)
    
    if request.GET.get('start_date') and request.GET.get('end_date'):
        form = DateRangeForm(request.GET)
        if form.is_valid():
            start_date = form.cleaned_data['start_date']
            end_date = form.cleaned_data['end_date']
    else:
        form = DateRangeForm(initial={'start_date': start_date, 'end_date': end_date})
    
    route_stats = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).values('route__name').annotate(
        total_trips=Sum('total_trips'),
        total_passengers=Sum('total_passengers'),
        avg_on_time=Avg('on_time_trips')
    ).order_by('-total_passengers')
    
    return render(request, 'reports/route_popularity.html', {
        'form': form,
        'route_stats': route_stats,
        'start_date': start_date,
        'end_date': end_date
    })


@login_required
@admin_or_authority_required
def on_time_performance(request):
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=30)
    
    if request.GET.get('start_date') and request.GET.get('end_date'):
        form = DateRangeForm(request.GET)
        if form.is_valid():
            start_date = form.cleaned_data['start_date']
            end_date = form.cleaned_data['end_date']
    else:
        form = DateRangeForm(initial={'start_date': start_date, 'end_date': end_date})
    
    performance = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).values('route__name').annotate(
        total=Sum('total_trips'),
        on_time=Sum('on_time_trips'),
        delayed=Sum('delayed_trips'),
        avg_delay=Avg('average_delay_mins')
    ).order_by('route__name')
    
    overall = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).aggregate(
        total=Sum('total_trips'),
        on_time=Sum('on_time_trips'),
        delayed=Sum('delayed_trips')
    )
    
    return render(request, 'reports/on_time_performance.html', {
        'form': form,
        'performance': performance,
        'overall': overall,
        'start_date': start_date,
        'end_date': end_date
    })


@login_required
@admin_or_authority_required
def driver_incidents(request):
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=30)
    
    if request.GET.get('start_date') and request.GET.get('end_date'):
        form = DateRangeForm(request.GET)
        if form.is_valid():
            start_date = form.cleaned_data['start_date']
            end_date = form.cleaned_data['end_date']
    else:
        form = DateRangeForm(initial={'start_date': start_date, 'end_date': end_date})
    
    incidents = Issue.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    ).select_related('reported_by', 'bus', 'route').order_by('-created_at')
    
    incident_summary = Issue.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    ).values('issue_type').annotate(count=Count('id')).order_by('-count')
    
    driver_summary = Issue.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    ).values('reported_by__username').annotate(count=Count('id')).order_by('-count')[:10]
    
    return render(request, 'reports/driver_incidents.html', {
        'form': form,
        'incidents': incidents,
        'incident_summary': incident_summary,
        'driver_summary': driver_summary,
        'start_date': start_date,
        'end_date': end_date
    })


@login_required
@admin_or_authority_required
def user_feedback_report(request):
    feedbacks = UserFeedback.objects.select_related('user', 'route', 'bus').order_by('-created_at')[:50]
    
    category_summary = UserFeedback.objects.values('category').annotate(
        count=Count('id'),
        avg_rating=Avg('rating')
    ).order_by('-count')
    
    avg_rating = UserFeedback.objects.aggregate(avg=Avg('rating'))['avg'] or 0
    
    return render(request, 'reports/user_feedback.html', {
        'feedbacks': feedbacks,
        'category_summary': category_summary,
        'avg_rating': round(avg_rating, 1)
    })


@login_required
def submit_feedback(request):
    if request.method == 'POST':
        form = FeedbackForm(request.POST)
        if form.is_valid():
            feedback = form.save(commit=False)
            feedback.user = request.user
            feedback.save()
            messages.success(request, 'Thank you for your feedback!')
            return redirect('accounts:dashboard')
    else:
        form = FeedbackForm()
    
    return render(request, 'reports/submit_feedback.html', {'form': form})


@login_required
@admin_or_authority_required
def authority_reports(request):
    """Main reports dashboard for authority users"""
    from buses.models import BusAssignment
    from accounts.models import User
    
    today = timezone.now().date()
    last_30_days = today - timedelta(days=30)
    
    # Summary stats
    stats = {
        'total_routes': Route.objects.filter(is_active=True).count(),
        'total_buses': Bus.objects.filter(is_active=True).count(),
        'total_drivers': User.objects.filter(role='driver').count(),
        'active_issues': Issue.objects.filter(status='pending').count(),
        'total_trips_30d': RouteAnalytics.objects.filter(date__gte=last_30_days).aggregate(total=Sum('total_trips'))['total'] or 0,
    }
    
    # Recent issues
    recent_issues = Issue.objects.select_related('reported_by', 'bus', 'route').order_by('-created_at')[:10]
    
    # Route performance summary
    route_performance_qs = RouteAnalytics.objects.filter(
        date__gte=last_30_days
    ).values('route__name').annotate(
        total_trips=Sum('total_trips'),
        on_time_trips=Sum('on_time_trips')
    ).order_by('-total_trips')[:5]

    # Calculate on_time_pct in Python
    route_performance = []
    for rp in route_performance_qs:
        total = rp.get('total_trips') or 0
        on_time = rp.get('on_time_trips') or 0
        rp['on_time_pct'] = (on_time * 100 / total) if total else 0
        route_performance.append(rp)
    
    return render(request, 'reports/authority_reports.html', {
        'stats': stats,
        'recent_issues': recent_issues,
        'route_performance': route_performance
    })


@login_required
@admin_or_authority_required
def driver_logs(request):
    """Driver activity and incident logs"""
    from buses.models import BusAssignment
    from accounts.models import User
    
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=30)
    
    if request.GET.get('start_date') and request.GET.get('end_date'):
        form = DateRangeForm(request.GET)
        if form.is_valid():
            start_date = form.cleaned_data['start_date']
            end_date = form.cleaned_data['end_date']
    else:
        form = DateRangeForm(initial={'start_date': start_date, 'end_date': end_date})
    
    # Get all drivers with their activity
    drivers = User.objects.filter(role='driver').annotate(
        total_assignments=Count('bus_assignments', filter=Q(
            bus_assignments__date__gte=start_date,
            bus_assignments__date__lte=end_date
        )),
        total_issues=Count('reported_issues', filter=Q(
            reported_issues__created_at__date__gte=start_date,
            reported_issues__created_at__date__lte=end_date
        ))
    ).order_by('-total_assignments')
    
    # Recent assignments
    recent_assignments = BusAssignment.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    ).select_related('driver', 'bus', 'route').order_by('-date', '-shift_start')[:50]
    
    # Driver issues
    driver_issues = Issue.objects.filter(
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    ).values('reported_by__username', 'reported_by__first_name', 'reported_by__last_name').annotate(
        total_issues=Count('id')
    ).order_by('-total_issues')[:10]
    
    return render(request, 'reports/driver_logs.html', {
        'form': form,
        'drivers': drivers,
        'recent_assignments': recent_assignments,
        'driver_issues': driver_issues,
        'start_date': start_date,
        'end_date': end_date
    })
