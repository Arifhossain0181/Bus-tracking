from django.urls import path
from . import views

app_name = 'locations'

urlpatterns = [
    path('share/', views.share_location, name='share_location'),
    path('live-map/', views.live_map, name='live_map'),
    path('history/', views.journey_history, name='journey_history'),
]
