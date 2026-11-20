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
from .analytics_service import (
    parse_date_boundaries,
    get_reports_overview_data,
    get_route_analytics_data,
    get_performance_summary_data,
    get_driver_logs_data,
)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports_overview_api(request):
    """
    Overview operational statistics and route on-time performance summary (last 30 days).
    Derived from trustworthy, verified operational journey records.
    """
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    overview_data = get_reports_overview_data(days=30)

    recent_issues = Issue.objects.select_related('reported_by', 'bus', 'route').order_by('-created_at')[:10]

    return Response({
        'stats': overview_data['stats'],
        'recent_issues': IssueSerializer(recent_issues, many=True).data,
        'route_performance': overview_data['route_performance'],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_analytics_api(request):
    """
    Route analytics per route: trips, punctuality, passenger totals, and delays.
    """
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    days_param = request.GET.get('days')
    days = int(days_param) if days_param and days_param.isdigit() else 30
    start_date, end_date, start_dt, end_dt = parse_date_boundaries(
        request.GET.get('start_date'),
        request.GET.get('end_date'),
        default_days=days
    )

    data = get_route_analytics_data(start_date, end_date, start_dt, end_dt)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def performance_summary_api(request):
    """
    On-time vs delayed performance summary overall, by route, and daily.
    """
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    days_param = request.GET.get('days')
    days = int(days_param) if days_param and days_param.isdigit() else 30
    start_date, end_date, start_dt, end_dt = parse_date_boundaries(
        request.GET.get('start_date'),
        request.GET.get('end_date'),
        default_days=days
    )

    data = get_performance_summary_data(start_date, end_date, start_dt, end_dt)
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def driver_incidents_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    start_date, end_date, start_dt, end_dt = parse_date_boundaries(
        request.GET.get('start_date'),
        request.GET.get('end_date'),
        default_days=30
    )

    incidents = Issue.objects.filter(
        created_at__gte=start_dt,
        created_at__lt=end_dt
    ).select_related('reported_by', 'bus', 'route').order_by('-created_at')

    incident_summary = Issue.objects.filter(
        created_at__gte=start_dt,
        created_at__lt=end_dt
    ).values('issue_type').annotate(count=Count('id')).order_by('-count')

    driver_summary = Issue.objects.filter(
        created_at__gte=start_dt,
        created_at__lt=end_dt
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

    start_date, end_date, start_dt, end_dt = parse_date_boundaries(
        request.GET.get('start_date'),
        request.GET.get('end_date'),
        default_days=30
    )

    data = get_driver_logs_data(start_date, end_date, start_dt, end_dt)
    return Response(data)


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
    days_param = request.GET.get('days')
    days = int(days_param) if days_param and days_param.isdigit() else 30
    start_date, end_date, start_dt, end_dt = parse_date_boundaries(
        request.GET.get('start_date'),
        request.GET.get('end_date'),
        default_days=days
    )

    if report_type == 'performance':
        perf_data = get_performance_summary_data(start_date, end_date, start_dt, end_dt)
        return Response(perf_data['by_route'])
    elif report_type == 'trips':
        data = TripLog.objects.filter(
            date__gte=start_date, date__lte=end_date
        ).select_related('bus', 'route', 'driver').order_by('-date', '-actual_departure')[:1000]
        serializer = TripLogSerializer(data, many=True)
        return Response(serializer.data)
    elif report_type == 'feedback':
        data = UserFeedback.objects.filter(
            created_at__gte=start_dt,
            created_at__lt=end_dt
        ).select_related('user', 'route', 'bus')[:1000]
        serializer = UserFeedbackSerializer(data, many=True)
        return Response(serializer.data)
    else:
        return Response({'error': 'Invalid report type'}, status=status.HTTP_400_BAD_REQUEST)
