from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import UserNotification

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def dismiss_notification_api(request, pk):
    try:
        user_notification = UserNotification.objects.get(notification_id=pk, user=request.user)
        user_notification.is_read = True
        user_notification.save()
        return Response({'status': 'dismissed'})
    except UserNotification.DoesNotExist:
        UserNotification.objects.create(notification_id=pk, user=request.user, is_read=True)
        return Response({'status': 'dismissed'})
