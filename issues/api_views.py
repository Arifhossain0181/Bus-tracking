from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from buses.models import BusAssignment
from .models import Issue
from .serializers import IssueSerializer, IssueCreateSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def issue_list_api(request):
    if request.user.role == 'driver':
        issues = Issue.objects.filter(reported_by=request.user)
    elif request.user.role in ['admin', 'authority']:
        issues = Issue.objects.all()
    else:
        issues = Issue.objects.none()
    
    status_filter = request.GET.get('status')
    if status_filter:
        issues = issues.filter(status=status_filter)
    
    serializer = IssueSerializer(issues.order_by('-created_at')[:50], many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def issue_create_api(request):
    if request.user.role != 'driver':
        return Response({'error': 'Only drivers can report issues'}, status=status.HTTP_403_FORBIDDEN)
    
    serializer = IssueCreateSerializer(data=request.data)
    if serializer.is_valid():
        issue = serializer.save(reported_by=request.user)
        
        try:
            assignment = BusAssignment.objects.get(driver=request.user, is_active=True)
            issue.bus = assignment.bus
            issue.route = assignment.route
            issue.save()
        except BusAssignment.DoesNotExist:
            pass
        
        return Response(IssueSerializer(issue).data, status=status.HTTP_201_CREATED)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def issue_detail_api(request, pk):
    try:
        issue = Issue.objects.get(pk=pk)
    except Issue.DoesNotExist:
        return Response({'error': 'Issue not found'}, status=status.HTTP_404_NOT_FOUND)
    
    if request.user.role == 'driver' and issue.reported_by != request.user:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
    serializer = IssueSerializer(issue)
    return Response(serializer.data)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def issue_update_api(request, pk):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    
    try:
        issue = Issue.objects.get(pk=pk)
    except Issue.DoesNotExist:
        return Response({'error': 'Issue not found'}, status=status.HTTP_404_NOT_FOUND)
    
    allowed_fields = ['status', 'priority', 'resolution_notes']
    for field in allowed_fields:
        if field in request.data:
            setattr(issue, field, request.data[field])
    
    issue.save()
    return Response(IssueSerializer(issue).data)
