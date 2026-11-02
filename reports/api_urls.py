from django.urls import path
from . import api_views

urlpatterns = [
    path('analytics/', api_views.route_analytics_api, name='api_route_analytics'),
    path('performance/', api_views.performance_summary_api, name='api_performance'),
    path('feedback-summary/', api_views.feedback_summary_api, name='api_feedback_summary'),
    path('feedback/submit/', api_views.submit_feedback_api, name='api_submit_feedback'),
    path('export/', api_views.export_data_api, name='api_export_data'),
]
