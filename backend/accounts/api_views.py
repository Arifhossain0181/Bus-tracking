from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, parser_classes, throttle_classes
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.throttling import AuthRateThrottle

from .models import User
from .models_feedback import Feedback
from .serializers import UserSerializer, RegisterSerializer, AuthorityFeedbackSerializer
from buses.models import Bus, BusAssignment
from schedules.models import Route
from issues.models import Issue
from notifications.models import Notification


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def login_api(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''

    if not username or not password:
        return Response(
            {'error': 'Username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Check pending/rejected status first for clear UX feedback
    existing_user = User.objects.filter(username=username).first()
    if existing_user and not existing_user.is_active:
        if existing_user.approval_status == 'pending':
            return Response(
                {'error': 'Your registration is pending admin approval.'},
                status=status.HTTP_403_FORBIDDEN
            )
        elif existing_user.approval_status == 'rejected':
            reason = f" Reason: {existing_user.rejection_reason}" if existing_user.rejection_reason else ""
            return Response(
                {'error': f'Your registration was rejected.{reason}'},
                status=status.HTTP_403_FORBIDDEN
            )

    user = authenticate(username=username, password=password)
    if not user:
        return Response(
            {'error': 'Invalid username or password.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    token, _ = Token.objects.get_or_create(user=user)
    return Response({
        'token': token.key,
        'user': UserSerializer(user, context={'request': request}).data
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([AuthRateThrottle])
def register_api(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response({
            'message': 'Registration submitted! Please wait for admin approval before logging in.',
            'user': UserSerializer(user, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_api(request):
    Token.objects.filter(user=request.user).delete()
    return Response({'status': 'Logged out successfully'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_api(request):
    data = UserSerializer(request.user, context={'request': request}).data
    if request.user.is_admin_user:
        data['pending_registrations_count'] = User.objects.filter(approval_status='pending').count()
    return Response(data)


@api_view(['GET', 'PATCH', 'PUT'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def profile_api(request):
    user = request.user
    if request.method == 'GET':
        return Response(UserSerializer(user, context={'request': request}).data)

    for field in ['first_name', 'last_name', 'email', 'phone']:
        if field in request.data:
            setattr(user, field, request.data.get(field, ''))

    if 'profile_picture' in request.FILES:
        user.profile_picture = request.FILES['profile_picture']

    new_password = request.data.get('new_password')
    if new_password:
        current_password = request.data.get('current_password')
        if not current_password or not user.check_password(current_password):
            return Response({'error': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as err:
            return Response({'error': err.messages[0]}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)

    user.save()
    return Response({
        'message': 'Profile updated successfully.',
        'user': UserSerializer(user, context={'request': request}).data
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_api(request):
    user = request.user
    payload = {
        'role': user.role,
        'user': UserSerializer(user, context={'request': request}).data,
    }

    if user.is_admin_user:
        payload['stats'] = {
            'total_buses': Bus.objects.count(),
            'active_buses': Bus.objects.filter(is_active=True).count(),
            'total_routes': Route.objects.count(),
            'total_drivers': User.objects.filter(role='driver').count(),
            'pending_issues': Issue.objects.filter(status='pending').count(),
            'pending_registrations': User.objects.filter(approval_status='pending').count(),
            'total_users': User.objects.exclude(role__in=['admin', 'driver']).count(),
        }
    elif user.is_driver:
        assignment = BusAssignment.objects.select_related('bus', 'route').filter(
            driver=user, is_active=True
        ).first()
        payload['assignment'] = {
            'id': assignment.id,
            'bus_id': assignment.bus.id,
            'bus_number': assignment.bus.bus_number,
            'license_plate': assignment.bus.license_plate,
            'route_id': assignment.route.id,
            'route_name': assignment.route.name,
            'route_type': assignment.route.route_type,
        } if assignment else None
        recent_issues = Issue.objects.filter(reported_by=user).order_by('-created_at')[:5]
        payload['recent_issues'] = [
            {
                'id': i.id,
                'issue_type': i.issue_type,
                'issue_type_display': i.get_issue_type_display(),
                'description': i.description,
                'status': i.status,
                'status_display': i.get_status_display(),
                'priority': i.priority,
                'created_at': i.created_at.isoformat(),
            }
            for i in recent_issues
        ]
    elif user.is_authority:
        payload['stats'] = {
            'total_buses': Bus.objects.count(),
            'active_buses': Bus.objects.filter(is_active=True).count(),
            'total_routes': Route.objects.count(),
            'total_users': User.objects.filter(role__in=['student', 'faculty', 'staff']).count(),
            'total_drivers': User.objects.filter(role='driver').count(),
        }
    else:
        routes = Route.objects.filter(is_active=True, is_published=True).prefetch_related('stops', 'trips')[:6]
        announcements = Notification.objects.filter(is_active=True).order_by('-created_at')[:5]
        payload['routes'] = [
            {
                'id': r.id,
                'name': r.name,
                'route_type': r.route_type,
                'origin_name': r.origin_name,
                'destination_name': r.destination_name,
                'stops_count': r.stops.count(),
                'trips_count': r.trips.count(),
            }
            for r in routes
        ]
        payload['announcements'] = [
            {
                'id': a.id,
                'title': a.title,
                'message': a.message,
                'priority': a.priority,
                'created_at': a.created_at.isoformat(),
            }
            for a in announcements
        ]

    return Response(payload)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def user_list_create_api(request):
    if request.method == 'GET':
        if not (request.user.is_admin_user or request.user.is_authority):
            return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

        users = User.objects.all().order_by('-created_at')
        role_filter = request.GET.get('role', '')
        if role_filter:
            users = users.filter(role=role_filter)

        status_filter = request.GET.get('status', '')
        if status_filter == 'active':
            users = users.filter(is_active=True)
        elif status_filter == 'inactive':
            users = users.filter(is_active=False)

        serializer = UserSerializer(users, many=True, context={'request': request})
        return Response(serializer.data)

    # POST: Admin only
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    full_name = (request.data.get('full_name') or '').strip()
    username = (request.data.get('username') or '').strip()
    email = (request.data.get('email') or '').strip()
    password = (request.data.get('password') or '').strip()
    phone = (request.data.get('phone') or '').strip()
    role = request.data.get('role', 'student')

    if not full_name or not username or not password:
        return Response(
            {'error': 'Full name, username, and password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'error': f'Username "{username}" is already taken.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        temp_user = User(username=username)
        validate_password(password, user=temp_user)
    except DjangoValidationError as err:
        return Response({'error': err.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

    parts = full_name.split(' ', 1)
    user = User.objects.create_user(
        username=username,
        password=password,
        email=email,
        first_name=parts[0],
        last_name=parts[1] if len(parts) > 1 else '',
        role=role,
        phone=phone,
        is_active=True,
        approval_status='approved'
    )
    return Response(UserSerializer(user, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def user_detail_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    user_obj = get_object_or_404(User, pk=pk)

    if request.method == 'GET':
        return Response(UserSerializer(user_obj, context={'request': request}).data)

    if user_obj.is_admin_user:
        return Response({'error': 'Cannot modify or delete admin users.'}, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'DELETE':
        if user_obj.pk == request.user.pk:
            return Response({'error': 'Cannot delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)
        user_obj.delete()
        return Response({'status': 'User deleted successfully.'})

    # PATCH / PUT
    if 'full_name' in request.data:
        parts = (request.data.get('full_name') or '').strip().split(' ', 1)
        user_obj.first_name = parts[0]
        user_obj.last_name = parts[1] if len(parts) > 1 else ''
    if 'email' in request.data:
        user_obj.email = (request.data.get('email') or '').strip()
    if 'phone' in request.data:
        user_obj.phone = (request.data.get('phone') or '').strip()
    if 'role' in request.data:
        user_obj.role = request.data.get('role')
    if 'is_active' in request.data:
        val = request.data.get('is_active')
        user_obj.is_active = val if isinstance(val, bool) else str(val).lower() in ('true', '1', 'on')
    new_password = (request.data.get('password') or '').strip()
    if new_password:
        user_obj.set_password(new_password)

    user_obj.save()
    return Response(UserSerializer(user_obj, context={'request': request}).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def pending_registrations_api(request):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    pending = User.objects.filter(approval_status='pending').order_by('-created_at')
    return Response(UserSerializer(pending, many=True, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_user_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    user = get_object_or_404(User, pk=pk, approval_status='pending')
    user.approval_status = 'approved'
    user.approved_by = request.user
    user.approved_at = timezone.now()
    user.is_active = True
    user.save()
    return Response({
        'status': 'approved',
        'message': f'User {user.username} has been approved.',
        'user': UserSerializer(user, context={'request': request}).data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reject_user_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    user = get_object_or_404(User, pk=pk, approval_status='pending')
    user.approval_status = 'rejected'
    user.rejection_reason = (request.data.get('reason') or '').strip()
    user.is_active = False
    user.save()
    return Response({
        'status': 'rejected',
        'message': f'User {user.username} has been rejected.'
    })


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def driver_list_create_api(request):
    if not (request.user.is_admin_user or (request.method == 'GET' and request.user.is_authority)):
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        drivers = User.objects.filter(role='driver').order_by('-created_at')
        return Response(UserSerializer(drivers, many=True, context={'request': request}).data)

    full_name = (request.data.get('full_name') or '').strip()
    username = (request.data.get('username') or '').strip()
    password = (request.data.get('password') or '').strip()
    phone = (request.data.get('phone') or '').strip()
    address = (request.data.get('address') or '').strip()
    nid_number = (request.data.get('nid_number') or '').strip()

    if not full_name or not username or not password:
        return Response(
            {'error': 'Full name, username, and password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if User.objects.filter(username=username).exists():
        return Response(
            {'error': f'Username "{username}" is already taken.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        temp_user = User(username=username)
        validate_password(password, user=temp_user)
    except DjangoValidationError as err:
        return Response({'error': err.messages[0]}, status=status.HTTP_400_BAD_REQUEST)

    parts = full_name.split(' ', 1)
    driver = User.objects.create_user(
        username=username,
        password=password,
        first_name=parts[0],
        last_name=parts[1] if len(parts) > 1 else '',
        role='driver',
        phone=phone,
        address=address,
        nid_number=nid_number,
        is_active=True,
        approval_status='approved',
        is_active_driver=True
    )

    photo = request.FILES.get('photo') or request.FILES.get('profile_picture')
    if photo:
        driver.profile_picture = photo
        driver.save()

    return Response(UserSerializer(driver, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def driver_detail_api(request, pk):
    if not request.user.is_admin_user:
        return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)

    driver = get_object_or_404(User, pk=pk, role='driver')

    if request.method == 'GET':
        return Response(UserSerializer(driver, context={'request': request}).data)

    if request.method == 'DELETE':
        driver.delete()
        return Response({'status': 'Driver deleted successfully.'})

    if 'full_name' in request.data:
        parts = (request.data.get('full_name') or '').strip().split(' ', 1)
        driver.first_name = parts[0]
        driver.last_name = parts[1] if len(parts) > 1 else ''
    for field in ['phone', 'address', 'nid_number']:
        if field in request.data:
            setattr(driver, field, (request.data.get(field) or '').strip())
    new_password = (request.data.get('password') or '').strip()
    if new_password:
        driver.set_password(new_password)

    photo = request.FILES.get('photo') or request.FILES.get('profile_picture')
    if photo:
        driver.profile_picture = photo

    driver.save()
    return Response(UserSerializer(driver, context={'request': request}).data)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def authority_feedback_api(request):
    if request.method == 'GET':
        if not (request.user.is_admin_user or request.user.is_authority):
            return Response({'error': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        feedbacks = Feedback.objects.select_related('user').order_by('-created_at')[:50]
        return Response(AuthorityFeedbackSerializer(feedbacks, many=True).data)

    if not request.user.is_authority:
        return Response({'error': 'Only authority users can submit authority feedback.'}, status=status.HTTP_403_FORBIDDEN)

    message = (request.data.get('message') or request.data.get('feedback') or '').strip()
    if not message:
        return Response({'error': 'Feedback cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

    fb = Feedback.objects.create(
        user=request.user,
        feedback_type='authority',
        message=message
    )
    return Response(AuthorityFeedbackSerializer(fb).data, status=status.HTTP_201_CREATED)
