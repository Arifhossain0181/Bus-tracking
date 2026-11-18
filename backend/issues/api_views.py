from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from buses.models import BusAssignment
from .models import Issue, IssueComment
from .serializers import IssueSerializer, IssueCreateSerializer, IssueCommentSerializer


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

    issue_type = request.GET.get('type')
    if issue_type:
        issues = issues.filter(issue_type=issue_type)

    issues = issues.select_related('reported_by', 'bus', 'route', 'assigned_to').prefetch_related('comments__user')
    serializer = IssueSerializer(issues.order_by('-created_at')[:100], many=True)
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
    issue = get_object_or_404(
        Issue.objects.select_related('reported_by', 'bus', 'route', 'assigned_to').prefetch_related('comments__user'),
        pk=pk
    )

    if request.user.role == 'driver' and issue.reported_by != request.user:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    if request.user.role not in ['driver', 'admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    serializer = IssueSerializer(issue)
    return Response(serializer.data)


@api_view(['PATCH', 'PUT'])
@permission_classes([IsAuthenticated])
def issue_update_api(request, pk):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    issue = get_object_or_404(Issue, pk=pk)

    allowed_fields = ['status', 'priority', 'resolution_notes']
    for field in allowed_fields:
        if field in request.data:
            setattr(issue, field, request.data[field])

    if issue.status == 'resolved' and not issue.resolved_at:
        issue.resolved_at = timezone.now()

    issue.save()
    return Response(IssueSerializer(issue).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def issue_comment_api(request, pk):
    issue = get_object_or_404(Issue, pk=pk)
    if request.user.role == 'driver' and issue.reported_by != request.user:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)
    if request.user.role not in ['driver', 'admin', 'authority']:
        return Response({'error': 'Access denied'}, status=status.HTTP_403_FORBIDDEN)

    text = (request.data.get('comment') or '').strip()
    if not text:
        return Response({'error': 'Comment cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

    comment = IssueComment.objects.create(issue=issue, user=request.user, comment=text)
    return Response(IssueCommentSerializer(comment).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def issue_assign_api(request, pk):
    if request.user.role != 'admin':
        return Response({'error': 'Only admins can assign issues.'}, status=status.HTTP_403_FORBIDDEN)

    issue = get_object_or_404(Issue, pk=pk)
    issue.assigned_to = request.user
    issue.status = 'in_progress'
    issue.save()
    return Response(IssueSerializer(issue).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def issue_resolve_api(request, pk):
    if request.user.role not in ['admin', 'authority']:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    issue = get_object_or_404(Issue, pk=pk)
    issue.status = 'resolved'
    issue.resolved_at = timezone.now()
    if 'resolution_notes' in request.data:
        issue.resolution_notes = request.data.get('resolution_notes', '')
    issue.save()
    return Response(IssueSerializer(issue).data)
