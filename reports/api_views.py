from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Avg, Sum
from django.utils import timezone
from datetime import timedelta
from .models import TripLog, UserFeedback, RouteAnalytics
from .serializers import TripLogSerializer, UserFeedbackSerializer, RouteAnalyticsSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def route_analytics_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
    days = int(request.GET.get('days', 30))
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    
    analytics = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).values('route__id', 'route__name').annotate(
        total_trips=Sum('total_trips'),
        on_time_trips=Sum('on_time_trips'),
        total_passengers=Sum('total_passengers'),
        avg_delay=Avg('average_delay_mins')
    ).order_by('-total_passengers')
    
    return Response(list(analytics))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def performance_summary_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
    days = int(request.GET.get('days', 7))
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    
    daily_data = RouteAnalytics.objects.filter(
        date__gte=start_date, date__lte=end_date
    ).values('date').annotate(
        total=Sum('total_trips'),
        on_time=Sum('on_time_trips'),
        passengers=Sum('total_passengers')
    ).order_by('date')
    
    return Response(list(daily_data))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def feedback_summary_api(request):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
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
        'overall': overall
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
