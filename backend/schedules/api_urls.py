from django.urls import path
from . import api_views

urlpatterns = [
    path('routes/', api_views.route_list_api, name='api_route_list'),
    path('routes/<int:pk>/', api_views.route_detail_api, name='api_route_detail'),
    path('routes/<int:pk>/publish/', api_views.publish_route_api, name='api_route_publish'),
    path('routes/<int:pk>/unpublish/', api_views.unpublish_route_api, name='api_route_unpublish'),
    path('routes/<int:pk>/revisions/', api_views.route_revisions_api, name='api_route_revisions'),
    path('routes/generate-geometry/', api_views.route_generate_geometry_api, name='api_route_generate_geometry_preview'),
    path('routes/<int:pk>/generate-geometry/', api_views.route_generate_geometry_api, name='api_route_generate_geometry'),
    path('routes/<int:pk>/revisions/<int:rev_pk>/', api_views.route_revision_detail_api, name='api_route_revision_detail'),
    path('routes/<int:pk>/revisions/<int:rev_pk>/publish/', api_views.route_revision_publish_api, name='api_route_revision_publish'),
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
