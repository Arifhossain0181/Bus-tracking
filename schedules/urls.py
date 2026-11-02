from django.urls import path
from . import views

app_name = 'schedules'

urlpatterns = [
    # Routes
    path('routes/', views.route_list, name='route_list'),
    path('routes/create/', views.route_create, name='route_create'),
    path('routes/<int:pk>/', views.route_detail, name='route_detail'),
    path('routes/<int:pk>/edit/', views.route_edit, name='route_edit'),
    path('routes/<int:pk>/delete/', views.route_delete, name='route_delete'),
    path('routes/<int:pk>/publish/', views.publish_route, name='publish_route'),
    path('routes/<int:pk>/unpublish/', views.unpublish_route, name='unpublish_route'),
    
    # Stops
    path('routes/<int:route_pk>/stops/add/', views.stop_create, name='stop_create'),
    path('stops/<int:pk>/edit/', views.stop_edit, name='stop_edit'),
    path('stops/<int:pk>/delete/', views.stop_delete, name='stop_delete'),
    
    # Trips
    path('routes/<int:route_pk>/trips/add/', views.trip_create, name='trip_create'),
    path('trips/<int:pk>/', views.trip_detail, name='trip_detail'),
    path('trips/<int:pk>/edit/', views.trip_edit, name='trip_edit'),
    path('trips/<int:pk>/delete/', views.trip_delete, name='trip_delete'),
    path('trips/<int:trip_pk>/stops/add/', views.trip_stop_add, name='trip_stop_add'),
    path('trip-stops/<int:pk>/delete/', views.trip_stop_delete, name='trip_stop_delete'),
    
    # Schedules
    path('', views.schedule_list, name='schedule_list'),
    path('create/', views.schedule_create, name='schedule_create'),
    path('<int:pk>/edit/', views.schedule_edit, name='schedule_edit'),
    path('<int:pk>/delete/', views.schedule_delete, name='schedule_delete'),
    
    # User-facing
    path('view/', views.user_schedules, name='user_schedules'),
]
