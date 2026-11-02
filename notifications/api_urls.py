from django.urls import path
from . import api_views

urlpatterns = [
    path('', api_views.notification_list_api, name='api_notification_list'),
    path('user/', api_views.user_notifications_api, name='api_user_notifications'),
    path('unread/', api_views.unread_notifications_api, name='api_unread_notifications'),
    path('<int:pk>/read/', api_views.mark_read_api, name='api_mark_read'),
    path('read-all/', api_views.mark_all_read_api, name='api_mark_all_read'),
    path('unread-count/', api_views.unread_count_api, name='api_unread_count'),
    path('<int:pk>/dismiss/', api_views.dismiss_notification_api, name='api_dismiss_notification'),
]
