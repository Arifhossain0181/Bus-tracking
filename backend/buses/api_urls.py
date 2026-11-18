from django.urls import path
from . import api_views

urlpatterns = [
    path('', api_views.bus_list_create_api, name='api_bus_list_create'),
    path('locations/', api_views.bus_locations, name='api_bus_locations'),
    path('etas/', api_views.bus_etas_api, name='api_bus_etas'),
    path('update-location/', api_views.update_location, name='api_update_location'),
    path('stop-tracking/', api_views.stop_tracking, name='api_stop_tracking'),
    path('assignments/', api_views.assignment_list_create_api, name='api_assignment_list_create'),
    path('assignments/options/', api_views.assignment_options_api, name='api_assignment_options'),
    path('<int:pk>/', api_views.bus_detail_api, name='api_bus_detail'),
    path('<int:bus_id>/clear-assignment/', api_views.assignment_clear_api, name='api_assignment_clear'),
    path('<int:bus_id>/eta/<int:stop_id>/', api_views.bus_eta, name='api_bus_eta'),
]
