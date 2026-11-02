from django.urls import path
from . import views

app_name = 'buses'

urlpatterns = [
    path('', views.bus_list, name='bus_list'),
    path('map/', views.live_map, name='live_map'),
    path('<int:pk>/', views.bus_detail, name='bus_detail'),
    path('create/', views.bus_create, name='bus_create'),
    path('<int:pk>/edit/', views.bus_edit, name='bus_edit'),
    path('<int:pk>/delete/', views.bus_delete, name='bus_delete'),
    path('<int:pk>/follow/', views.follow_bus, name='follow_bus'),
    path('<int:bus_id>/clear-assignment/', views.assignment_clear, name='assignment_clear'),
    path('assignments/', views.assignment_list, name='assignment_list'),
    path('assignments/create/', views.assignment_create, name='assignment_create'),
]
