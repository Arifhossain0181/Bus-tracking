from django.urls import path
from . import api_views

urlpatterns = [
    path('overview/', api_views.reports_overview_api, name='api_reports_overview'),
    path('analytics/', api_views.route_analytics_api, name='api_route_analytics'),
    path('performance/', api_views.performance_summary_api, name='api_performance'),
    path('driver-incidents/', api_views.driver_incidents_api, name='api_driver_incidents'),
    path('driver-logs/', api_views.driver_logs_api, name='api_driver_logs'),
    path('feedback-summary/', api_views.feedback_summary_api, name='api_feedback_summary'),
    path('feedback/submit/', api_views.submit_feedback_api, name='api_submit_feedback'),
    path('export/', api_views.export_data_api, name='api_export_data'),
]
