from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.views import LoginView, LogoutView
from django.views.generic import CreateView
from django.urls import reverse_lazy
from django.contrib import messages
from django.core.mail import send_mail
from django.conf import settings
from .forms import LoginForm, UserRegistrationForm, UserProfileForm
from .models import User
from .models_feedback import Feedback
from buses.models import Bus, BusAssignment
from schedules.models import Route, Schedule
from issues.models import Issue
from notifications.models import Notification

# Feedback view for authority to send feedback to admin
@login_required
def submit_feedback(request):
    if not request.user.is_authority:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')

    if request.method == 'POST':
        feedback = request.POST.get('feedback', '').strip()
        if not feedback:
            messages.error(request, 'Feedback cannot be empty.')
            return redirect('accounts:dashboard')

        # Store feedback in database
        Feedback.objects.create(
            user=request.user,
            feedback_type='authority',
            message=feedback
        )
        messages.success(request, 'Feedback submitted successfully!')
        # Optionally, send email to admin (can be enabled if SMTP is configured)
        # admin_email = getattr(settings, 'ADMIN_EMAIL', None)
        # if admin_email:
        #     subject = f"Feedback from Authority: {request.user.get_full_name() or request.user.username}"
        #     message = feedback
        #     from_email = request.user.email or None
        #     try:
        #         send_mail(subject, message, from_email, [admin_email], fail_silently=True)
        #     except Exception:
        #         pass
        return redirect('accounts:dashboard')
    else:
        return redirect('accounts:dashboard')

class CustomLoginView(LoginView):
    template_name = 'accounts/login.html'
    authentication_form = LoginForm
    redirect_authenticated_user = True

    def get_success_url(self):
        user = self.request.user
        if user.is_admin_user:
            return reverse_lazy('accounts:dashboard')  # Admin dashboard
        elif user.is_driver:
            return reverse_lazy('accounts:dashboard')  # Driver dashboard
        elif user.is_authority:
            return reverse_lazy('accounts:dashboard')  # Authority dashboard
        elif user.is_regular_user:
            # Redirect regular users to schedules page as their home
            return reverse_lazy('schedules:schedule_list')
        else:
            return reverse_lazy('accounts:dashboard')


class CustomLogoutView(LogoutView):
    next_page = 'accounts:login'


class RegisterView(CreateView):
    model = User
    form_class = UserRegistrationForm
    template_name = 'accounts/register.html'
    success_url = reverse_lazy('accounts:login')

    def form_valid(self, form):
        # The form's save() method handles setting approval_status, is_active, and password
        form.save()
        messages.success(self.request, 'Registration submitted! Please wait for admin approval. You can login using your username and University ID.')
        return redirect(self.success_url)


@login_required
def dashboard(request):
    user = request.user
    context = {'user': user}

    if user.is_admin_user:
        context['total_buses'] = Bus.objects.count()
        context['active_buses'] = Bus.objects.filter(is_active=True).count()
        context['total_routes'] = Route.objects.count()
        context['total_drivers'] = User.objects.filter(role='driver').count()
        context['pending_issues'] = Issue.objects.filter(status='pending').count()
        context['pending_registrations'] = User.objects.filter(approval_status='pending').count()
        context['total_users'] = User.objects.exclude(role__in=['admin', 'driver']).count()
        return render(request, 'accounts/dashboard_admin.html', context)
    elif user.is_driver:
        try:
            assignment = BusAssignment.objects.select_related('bus', 'route').get(
                driver=user, is_active=True
            )
            context['assignment'] = assignment
            context['bus'] = assignment.bus
            context['route'] = assignment.route
        except BusAssignment.DoesNotExist:
            context['assignment'] = None
        context['recent_issues'] = Issue.objects.filter(
            reported_by=user
        ).order_by('-created_at')[:5]
        return render(request, 'accounts/dashboard_driver.html', context)
    elif user.is_authority:
        context['total_buses'] = Bus.objects.count()
        context['active_buses'] = Bus.objects.filter(is_active=True).count()
        context['total_routes'] = Route.objects.count()
        context['total_users'] = User.objects.filter(role__in=['student', 'faculty', 'staff']).count()
        context['total_drivers'] = User.objects.filter(role='driver').count()
        return render(request, 'accounts/dashboard_authority.html', context)
    elif user.is_regular_user:
        # Regular users go directly to schedules page as their home
        return redirect('schedules:schedule_list')
    return render(request, 'accounts/dashboard_user.html', context)


@login_required
def profile(request):
    if request.method == 'POST':
        form = UserProfileForm(request.POST, request.FILES, instance=request.user)
        if form.is_valid():
            form.save()
            messages.success(request, 'Profile updated successfully.')
            return redirect('accounts:profile')
    else:
        form = UserProfileForm(instance=request.user)
    
    return render(request, 'accounts/profile.html', {'form': form})


@login_required
def user_list(request):
    if not request.user.is_admin_user and not request.user.is_authority:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    users = User.objects.all().order_by('-created_at')
    
    # Filter by role
    role_filter = request.GET.get('role', '')
    if role_filter:
        users = users.filter(role=role_filter)
    
    # Filter by status
    status_filter = request.GET.get('status', '')
    if status_filter == 'active':
        users = users.filter(is_active=True)
    elif status_filter == 'inactive':
        users = users.filter(is_active=False)
    
    context = {
        'users': users,
        'current_role': role_filter,
        'current_status': status_filter,
    }
    return render(request, 'accounts/user_list.html', context)


@login_required
def user_create(request):
    """Create a new user - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    if request.method == 'POST':
        full_name = request.POST.get('full_name', '').strip()
        username = request.POST.get('username', '').strip()
        email = request.POST.get('email', '').strip()
        password = request.POST.get('password', '').strip()
        phone = request.POST.get('phone', '').strip()
        role = request.POST.get('role', 'student')
        
        # Validate required fields
        if not full_name or not username or not password:
            messages.error(request, 'Full name, username, and password are required.')
            return render(request, 'accounts/user_create_form.html', {'title': 'Add User'})
        
        # Check if username already exists
        if User.objects.filter(username=username).exists():
            messages.error(request, f'Username "{username}" is already taken.')
            return render(request, 'accounts/user_create_form.html', {'title': 'Add User'})
        
        # Split full name
        name_parts = full_name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Create user
        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            phone=phone,
            is_active=True,
            approval_status='approved'
        )
        
        messages.success(request, f'User "{full_name}" created successfully.')
        return redirect('accounts:user_list')
    
    return render(request, 'accounts/user_create_form.html', {'title': 'Add User'})


@login_required
def pending_registrations(request):
    """Admin view for pending user registrations"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    pending_users = User.objects.filter(approval_status='pending').order_by('-created_at')
    return render(request, 'accounts/pending_registrations.html', {'pending_users': pending_users})


@login_required
def approve_user(request, pk):
    """Approve a pending user registration"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    user = get_object_or_404(User, pk=pk, approval_status='pending')
    
    if request.method == 'POST':
        from django.utils import timezone
        user.approval_status = 'approved'
        user.approved_by = request.user
        user.approved_at = timezone.now()
        user.is_active = True
        user.save()
        messages.success(request, f'User {user.username} has been approved.')
        return redirect('accounts:pending_registrations')
    
    return render(request, 'accounts/approve_user.html', {'pending_user': user})


@login_required
def reject_user(request, pk):
    """Reject a pending user registration"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    user = get_object_or_404(User, pk=pk, approval_status='pending')
    
    if request.method == 'POST':
        user.approval_status = 'rejected'
        user.rejection_reason = request.POST.get('reason', '')
        user.is_active = False
        user.save()
        messages.success(request, f'User {user.username} has been rejected.')
        return redirect('accounts:pending_registrations')
    
    return render(request, 'accounts/reject_user.html', {'pending_user': user})


@login_required
def user_home(request):
    """Home page for regular users (students, faculty, staff)"""
    from notifications.models import Notification
    
    context = {
        'user': request.user,
        'routes': Route.objects.filter(is_active=True, is_published=True).prefetch_related('stops', 'trips')[:6],
        'announcements': Notification.objects.filter(
            notification_type='general',
            is_active=True
        ).order_by('-created_at')[:5],
    }
    return render(request, 'accounts/user_home.html', context)


@login_required
def user_live_map(request):
    """Live map page for regular users"""
    context = {
        'routes': Route.objects.filter(is_active=True, is_published=True),
        'buses': Bus.objects.filter(is_active=True).select_related('current_route'),
    }
    return render(request, 'accounts/user_live_map.html', context)


@login_required
def driver_list(request):
    """List all drivers - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    drivers = User.objects.filter(role='driver').order_by('-created_at')
    return render(request, 'accounts/driver_list.html', {'drivers': drivers})


@login_required
def driver_create(request):
    """Create a new driver - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    if request.method == 'POST':
        full_name = request.POST.get('full_name', '').strip()
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '').strip()
        phone = request.POST.get('phone', '').strip()
        address = request.POST.get('address', '').strip()
        nid_number = request.POST.get('nid_number', '').strip()
        
        # Validate required fields
        if not full_name or not username or not password:
            messages.error(request, 'Full name, username, and password are required.')
            return render(request, 'accounts/driver_form.html', {'title': 'Add Driver'})
        
        # Check if username already exists
        if User.objects.filter(username=username).exists():
            messages.error(request, f'Username "{username}" is already taken.')
            return render(request, 'accounts/driver_form.html', {'title': 'Add Driver'})
        
        # Split full name
        name_parts = full_name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ''
        
        # Handle photo upload
        photo = request.FILES.get('photo')
        
        # Create driver
        driver = User.objects.create_user(
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role='driver',
            phone=phone,
            address=address,
            nid_number=nid_number,
            is_active=True,
            approval_status='approved',
            is_active_driver=True
        )
        
        if photo:
            driver.profile_picture = photo
            driver.save()
        
        messages.success(request, f'Driver "{full_name}" created successfully. Username: {username}')
        return redirect('accounts:driver_list')
    
    return render(request, 'accounts/driver_form.html', {'title': 'Add Driver'})


@login_required
def driver_edit(request, pk):
    """Edit a driver - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    driver = get_object_or_404(User, pk=pk, role='driver')
    
    if request.method == 'POST':
        full_name = request.POST.get('full_name', '').strip()
        phone = request.POST.get('phone', '').strip()
        address = request.POST.get('address', '').strip()
        nid_number = request.POST.get('nid_number', '').strip()
        new_password = request.POST.get('password', '').strip()
        
        # Split full name
        name_parts = full_name.split(' ', 1)
        driver.first_name = name_parts[0]
        driver.last_name = name_parts[1] if len(name_parts) > 1 else ''
        driver.phone = phone
        driver.address = address
        driver.nid_number = nid_number
        
        # Update password if provided
        if new_password:
            driver.set_password(new_password)
        
        # Handle photo upload
        photo = request.FILES.get('photo')
        if photo:
            driver.profile_picture = photo
        
        driver.save()
        messages.success(request, f'Driver "{full_name}" updated successfully.')
        return redirect('accounts:driver_list')
    
    return render(request, 'accounts/driver_form.html', {
        'title': 'Edit Driver',
        'driver': driver
    })


@login_required
def driver_delete(request, pk):
    """Delete a driver - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    driver = get_object_or_404(User, pk=pk, role='driver')
    
    if request.method == 'POST':
        name = driver.get_full_name() or driver.username
        driver.delete()
        messages.success(request, f'Driver "{name}" deleted successfully.')
        return redirect('accounts:driver_list')
    
    return render(request, 'accounts/driver_confirm_delete.html', {'driver': driver})


@login_required
def user_edit(request, pk):
    """Edit a user - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    user_obj = get_object_or_404(User, pk=pk)
    
    # Prevent editing admin users
    if user_obj.is_admin_user:
        messages.error(request, 'Cannot edit admin users.')
        return redirect('accounts:user_list')
    
    if request.method == 'POST':
        full_name = request.POST.get('full_name', '').strip()
        email = request.POST.get('email', '').strip()
        phone = request.POST.get('phone', '').strip()
        role = request.POST.get('role', user_obj.role)
        is_active = request.POST.get('is_active') == 'on'
        new_password = request.POST.get('password', '').strip()
        
        # Split full name
        name_parts = full_name.split(' ', 1)
        user_obj.first_name = name_parts[0]
        user_obj.last_name = name_parts[1] if len(name_parts) > 1 else ''
        user_obj.email = email
        user_obj.phone = phone
        user_obj.role = role
        user_obj.is_active = is_active
        
        # Update password if provided
        if new_password:
            user_obj.set_password(new_password)
        
        user_obj.save()
        messages.success(request, f'User "{user_obj.username}" updated successfully.')
        return redirect('accounts:user_list')
    
    return render(request, 'accounts/user_form.html', {
        'title': 'Edit User',
        'user_obj': user_obj
    })


@login_required
def user_delete(request, pk):
    """Delete a user - Admin only"""
    if not request.user.is_admin_user:
        messages.error(request, 'Access denied.')
        return redirect('accounts:dashboard')
    
    user_obj = get_object_or_404(User, pk=pk)
    
    # Prevent deleting admin users
    if user_obj.is_admin_user:
        messages.error(request, 'Cannot delete admin users.')
        return redirect('accounts:user_list')
    
    # Prevent self-deletion
    if user_obj.pk == request.user.pk:
        messages.error(request, 'Cannot delete your own account.')
        return redirect('accounts:user_list')
    
    if request.method == 'POST':
        name = user_obj.get_full_name() or user_obj.username
        user_obj.delete()
        messages.success(request, f'User "{name}" deleted successfully.')
        return redirect('accounts:user_list')
    
    return render(request, 'accounts/user_confirm_delete.html', {'user_obj': user_obj})

