from django.urls import path
from . import api_views

urlpatterns = [
    # Journey control
    path('journey/start/', api_views.start_journey, name='api_start_journey'),
    path('journey/end/', api_views.end_journey, name='api_end_journey'),
    path('journey/delay/', api_views.report_delay, name='api_report_delay'),
    path('journey/<int:journey_id>/path/', api_views.get_journey_path, name='api_journey_path'),
    
    # Location tracking
    path('location/update/', api_views.update_location, name='api_update_location'),
    path('location/start/', api_views.start_sharing, name='api_start_sharing'),
    path('location/stop/', api_views.stop_sharing, name='api_stop_sharing'),
    path('location/active/', api_views.get_active_locations, name='api_active_locations'),
    path('location/status/', api_views.get_my_location_status, name='api_location_status'),
]
