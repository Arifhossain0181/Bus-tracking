from functools import wraps
from django.shortcuts import redirect
from django.contrib import messages

def role_required(*roles):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return redirect('accounts:login')
            if request.user.role not in roles:
                messages.error(request, 'You do not have permission to access this page.')
                return redirect('accounts:dashboard')
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator

def driver_required(view_func):
    return role_required('driver')(view_func)

def admin_required(view_func):
    return role_required('admin')(view_func)

def authority_required(view_func):
    return role_required('authority')(view_func)

def admin_or_authority_required(view_func):
    return role_required('admin', 'authority')(view_func)
