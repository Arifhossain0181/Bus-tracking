from django.urls import path
from . import views

app_name = 'issues'

urlpatterns = [
    path('', views.issue_list, name='list'),
    path('create/', views.issue_create, name='create'),
    path('<int:pk>/', views.issue_detail, name='detail'),
    path('<int:pk>/assign/', views.issue_assign, name='assign'),
    path('<int:pk>/resolve/', views.issue_resolve, name='resolve'),
]
