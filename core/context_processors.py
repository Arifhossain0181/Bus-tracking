"""
Custom context processors for the bus tracking system
"""

def pending_registrations(request):
    """Add pending registration count for admin users"""
    context = {'pending_count': 0}
    
    if request.user.is_authenticated and hasattr(request.user, 'is_admin_user') and request.user.is_admin_user:
        from accounts.models import User
        context['pending_count'] = User.objects.filter(approval_status='pending').count()
    
    return context
