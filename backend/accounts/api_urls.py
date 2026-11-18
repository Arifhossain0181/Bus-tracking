from django.urls import path
from . import api_views

urlpatterns = [
    path('login/', api_views.login_api, name='api_login'),
    path('register/', api_views.register_api, name='api_register'),
    path('logout/', api_views.logout_api, name='api_logout'),
    path('me/', api_views.me_api, name='api_me'),
    path('profile/', api_views.profile_api, name='api_profile'),
    path('dashboard/', api_views.dashboard_api, name='api_dashboard'),
    path('users/', api_views.user_list_create_api, name='api_user_list_create'),
    path('users/<int:pk>/', api_views.user_detail_api, name='api_user_detail'),
    path('pending/', api_views.pending_registrations_api, name='api_pending_registrations'),
    path('pending/<int:pk>/approve/', api_views.approve_user_api, name='api_approve_user'),
    path('pending/<int:pk>/reject/', api_views.reject_user_api, name='api_reject_user'),
    path('drivers/', api_views.driver_list_create_api, name='api_driver_list_create'),
    path('drivers/<int:pk>/', api_views.driver_detail_api, name='api_driver_detail'),
    path('authority-feedback/', api_views.authority_feedback_api, name='api_authority_feedback'),
]
