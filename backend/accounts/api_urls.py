from django.urls import path, re_path
from . import api_views

urlpatterns = [
    re_path(r'^login/?$', api_views.login_api, name='api_login'),
    re_path(r'^register/?$', api_views.register_api, name='api_register'),
    re_path(r'^logout/?$', api_views.logout_api, name='api_logout'),
    re_path(r'^me/?$', api_views.me_api, name='api_me'),
    re_path(r'^profile/?$', api_views.profile_api, name='api_profile'),
    re_path(r'^dashboard/?$', api_views.dashboard_api, name='api_dashboard'),
    re_path(r'^users/?$', api_views.user_list_create_api, name='api_user_list_create'),
    re_path(r'^users/(?P<pk>\d+)/?$', api_views.user_detail_api, name='api_user_detail'),
    re_path(r'^pending/?$', api_views.pending_registrations_api, name='api_pending_registrations'),
    re_path(r'^pending/(?P<pk>\d+)/approve/?$', api_views.approve_user_api, name='api_approve_user'),
    re_path(r'^pending/(?P<pk>\d+)/reject/?$', api_views.reject_user_api, name='api_reject_user'),
    re_path(r'^drivers/?$', api_views.driver_list_create_api, name='api_driver_list_create'),
    re_path(r'^drivers/(?P<pk>\d+)/?$', api_views.driver_detail_api, name='api_driver_detail'),
    re_path(r'^authority-feedback/?$', api_views.authority_feedback_api, name='api_authority_feedback'),
]
