from accounts.models import User

# Fix admin user
try:
    u = User.objects.get(username='admin')
    u.is_active = True
    u.approval_status = 'approved'
    u.role = 'admin'
    u.set_password('adminpass')
    u.save()
    print('Admin user fixed:', u.is_active, u.approval_status, u.role)
except Exception as e:
    print('Admin user error:', e)

# Fix authority user
try:
    u = User.objects.get(username='authority')
    u.is_active = True
    u.approval_status = 'approved'
    u.role = 'authority'
    u.set_password('authoritypass')
    u.save()
    print('Authority user fixed:', u.is_active, u.approval_status, u.role)
except Exception as e:
    print('Authority user error:', e)
