from django.urls import path
from . import api_views

urlpatterns = [
    path('', api_views.issue_list_api, name='api_issue_list'),
    path('create/', api_views.issue_create_api, name='api_issue_create'),
    path('<int:pk>/', api_views.issue_detail_api, name='api_issue_detail'),
    path('<int:pk>/update/', api_views.issue_update_api, name='api_issue_update'),
    path('<int:pk>/comments/', api_views.issue_comment_api, name='api_issue_comment'),
    path('<int:pk>/assign/', api_views.issue_assign_api, name='api_issue_assign'),
    path('<int:pk>/resolve/', api_views.issue_resolve_api, name='api_issue_resolve'),
]
