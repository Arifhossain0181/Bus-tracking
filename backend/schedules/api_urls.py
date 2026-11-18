from django.urls import path
from . import api_views

urlpatterns = [
    path('routes/', api_views.route_list_api, name='api_route_list'),
    path('routes/<int:pk>/', api_views.route_detail_api, name='api_route_detail'),
    path('routes/<int:pk>/publish/', api_views.publish_route_api, name='api_route_publish'),
    path('routes/<int:pk>/unpublish/', api_views.unpublish_route_api, name='api_route_unpublish'),
    path('routes/<int:pk>/stops/', api_views.route_stops_api, name='api_route_stops'),
    path('routes/<int:pk>/eta/', api_views.route_with_eta_api, name='api_route_eta'),
    path('routes/<int:pk>/trips/', api_views.route_trips_api, name='api_route_trips'),
    path('stops/<int:pk>/', api_views.stop_detail_api, name='api_stop_detail'),
    path('trips/<int:pk>/', api_views.trip_detail_api, name='api_trip_detail'),
    path('trips/<int:pk>/stops/', api_views.trip_stop_add_api, name='api_trip_stop_add'),
    path('trip-stops/<int:pk>/', api_views.trip_stop_delete_api, name='api_trip_stop_delete'),
    path('grouped/', api_views.grouped_schedules_api, name='api_grouped_schedules'),
    path('today/', api_views.today_schedules_api, name='api_today_schedules'),
    path('<int:pk>/', api_views.schedule_detail_api, name='api_schedule_detail'),
    path('', api_views.schedule_list_api, name='api_schedule_list'),
]
