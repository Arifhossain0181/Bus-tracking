from django.urls import path
from . import views

app_name = 'reports'

urlpatterns = [
    path('', views.report_list, name='report_list'),
    path('authority/', views.authority_reports, name='authority_reports'),
    path('route-popularity/', views.route_popularity, name='route_popularity'),
    path('on-time-performance/', views.on_time_performance, name='on_time_performance'),
    path('driver-incidents/', views.driver_incidents, name='driver_incidents'),
    path('driver-logs/', views.driver_logs, name='driver_logs'),
    path('user-feedback/', views.user_feedback_report, name='user_feedback'),
    path('feedback/submit/', views.submit_feedback, name='submit_feedback'),
]
