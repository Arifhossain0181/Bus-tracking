from django.urls import path
from . import api_views

urlpatterns = [
    path('routes/', api_views.route_list_api, name='api_route_list'),
    path('routes/<int:pk>/', api_views.route_detail_api, name='api_route_detail'),
    path('routes/<int:pk>/stops/', api_views.route_stops_api, name='api_route_stops'),
    path('routes/<int:pk>/eta/', api_views.route_with_eta_api, name='api_route_eta'),
    path('', api_views.schedule_list_api, name='api_schedule_list'),
    path('today/', api_views.today_schedules_api, name='api_today_schedules'),
]
