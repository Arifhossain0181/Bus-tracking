from datetime import datetime, timedelta
from django.db.models import Count, Avg, Sum, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from accounts.models_feedback import Feedback as AuthorityFeedback
from buses.models import Bus, BusAssignment
from issues.models import Issue
from issues.serializers import IssueSerializer
from schedules.models import Route
from .models import TripLog, UserFeedback, RouteAnalytics
from .serializers import TripLogSerializer, UserFeedbackSerializer, RouteAnalyticsSerializer


def _parse_date_range(request, default_days=30):
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=default_days)
    if request.GET.get('start_date'):
        try:
            start_date = datetime.strptime(request.GET['start_date'], '%Y-%m-%d').date()
        except ValueError:
            pass
    if request.GET.get('end_date'):
        try:
            end_date = datetime.strptime(request.GET['end_date'], '%Y-%m-%d').date()
        except ValueError:
            pass
    return start_date, end_date


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports_overview_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    today = timezone.now().date()
    last_30_days = today - timedelta(days=30)

    stats = {
        'total_routes': Route.objects.filter(is_active=True).count(),
        'total_buses': Bus.objects.filter(is_active=True).count(),
        'total_drivers': User.objects.filter(role='driver').count(),
        'active_issues': Issue.objects.filter(status='pending').count(),
        'total_trips_30d': RouteAnalytics.objects.filter(date__gte=last_30_days).aggregate(total=Sum('total_trips'))['total'] or 0,
    }

    recent_issues = Issue.objects.select_related('reported_by', 'bus', 'route').order_by('-created_at')[:10]
    route_perf_qs = RouteAnalytics.objects.filter(
        date__gte=last_30_days
    ).values('route__name').annotate(
        total_trips=Sum('total_trips'),
        on_time_trips=Sum('on_time_trips')
    ).order_by('-total_trips')[:10]

    route_performance = []
    for rp in route_perf_qs:
        total = rp.get('total_trips') or 0
        on_time = rp.get('on_time_trips') or 0
        route_performance.append({
            'route_name': rp['route__name'],
            'total_trips': total,
            'on_time_trips': on_time,
            'on_time_pct': round((on_time * 100 / total), 1) if total else 0,
        })

    return Response({
        'stats': stats,
        'recent_issues': IssueSerializer(recent_issues, many=True).data,
        'route_performance': route_performance,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_analytics_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    start_date, end_date = _parse_date_range(request, int(request.GET.get('days', 30)))

    analytics = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).values('route__id', 'route__name').annotate(
        total_trips=Sum('total_trips'),
        on_time_trips=Sum('on_time_trips'),
        delayed_trips=Sum('delayed_trips'),
        total_passengers=Sum('total_passengers'),
        avg_delay=Avg('average_delay_mins')
    ).order_by('-total_passengers')

    return Response({
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'routes': list(analytics),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def performance_summary_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    start_date, end_date = _parse_date_range(request, int(request.GET.get('days', 30)))

    by_route = RouteAnalytics.objects.filter(
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

    daily_data = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).values('date').annotate(
        total=Sum('total_trips'),
        on_time=Sum('on_time_trips'),
        passengers=Sum('total_passengers')
    ).order_by('date')

    return Response({
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'overall': overall,
        'by_route': list(by_route),
        'daily': list(daily_data),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def driver_incidents_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    start_date, end_date = _parse_date_range(request, 30)

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

    return Response({
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'incidents': IssueSerializer(incidents, many=True).data,
        'incident_summary': list(incident_summary),
        'driver_summary': list(driver_summary),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def driver_logs_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    start_date, end_date = _parse_date_range(request, 30)

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

    recent_assignments = BusAssignment.objects.filter(
        date__gte=start_date,
        date__lte=end_date
    ).select_related('driver', 'bus', 'route').order_by('-date', '-shift_start')[:50]

    return Response({
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'drivers': [
            {
                'id': d.id,
                'username': d.username,
                'full_name': d.get_full_name() or d.username,
                'phone': d.phone,
                'total_assignments': d.total_assignments,
                'total_issues': d.total_issues,
            }
            for d in drivers
        ],
        'recent_assignments': [
            {
                'id': a.id,
                'date': a.date.isoformat() if a.date else None,
                'driver_name': a.driver.get_full_name() or a.driver.username,
                'bus_number': a.bus.bus_number,
                'route_name': a.route.name,
                'is_active': a.is_active,
            }
            for a in recent_assignments
        ],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def feedback_summary_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    feedbacks = UserFeedback.objects.select_related('user', 'route', 'bus').order_by('-created_at')[:50]
    authority_feedbacks = AuthorityFeedback.objects.select_related('user').order_by('-created_at')[:30]

    summary = UserFeedback.objects.values('category').annotate(
        count=Count('id'),
        avg_rating=Avg('rating')
    ).order_by('-count')

    overall = UserFeedback.objects.aggregate(
        total=Count('id'),
        avg=Avg('rating')
    )

    return Response({
        'by_category': list(summary),
        'overall': overall,
        'feedbacks': UserFeedbackSerializer(feedbacks, many=True).data,
        'authority_feedbacks': [
            {
                'id': f.id,
                'user_name': f.user.get_full_name() or f.user.username,
                'feedback_type': f.feedback_type,
                'message': f.message,
                'created_at': f.created_at.isoformat(),
            }
            for f in authority_feedbacks
        ],
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_feedback_api(request):
    serializer = UserFeedbackSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(user=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_data_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    report_type = request.GET.get('type', 'performance')
    days = int(request.GET.get('days', 30))
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)

    if report_type == 'performance':
        data = RouteAnalytics.objects.filter(
            date__gte=start_date, date__lte=end_date
        ).select_related('route')
        serializer = RouteAnalyticsSerializer(data, many=True)
    elif report_type == 'trips':
        data = TripLog.objects.filter(
            date__gte=start_date, date__lte=end_date
        ).select_related('bus', 'route', 'driver')
        serializer = TripLogSerializer(data, many=True)
    elif report_type == 'feedback':
        data = UserFeedback.objects.filter(
            created_at__date__gte=start_date,
            created_at__date__lte=end_date
        ).select_related('user', 'route', 'bus')
        serializer = UserFeedbackSerializer(data, many=True)
    else:
        return Response({'error': 'Invalid report type'}, status=status.HTTP_400_BAD_REQUEST)

    return Response(serializer.data)
