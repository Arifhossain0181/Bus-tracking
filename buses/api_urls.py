from django.urls import path
from . import api_views

urlpatterns = [
    path('locations/', api_views.bus_locations, name='api_bus_locations'),
    path('update-location/', api_views.update_location, name='api_update_location'),
    path('stop-tracking/', api_views.stop_tracking, name='api_stop_tracking'),
    path('<int:pk>/', api_views.bus_detail_api, name='api_bus_detail'),
    path('<int:bus_id>/eta/<int:stop_id>/', api_views.bus_eta, name='api_bus_eta'),
]
