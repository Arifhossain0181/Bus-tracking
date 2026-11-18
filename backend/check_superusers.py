from accounts.models import User

for username in ['admin', 'authority']:
    try:
        u = User.objects.get(username=username)
        print(f"{username}: is_active={u.is_active}, approval_status={u.approval_status}, role={u.role}, password_hash={u.password}")
    except Exception as e:
        print(f"{username} not found: {e}")
