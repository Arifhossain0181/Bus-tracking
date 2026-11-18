from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse


def api_root(request):
    return JsonResponse({
        'name': 'UBus Tracking & Management API',
        'status': 'ok',
        'endpoints': {
            'auth': '/api/auth/',
            'buses': '/api/buses/',
            'schedules': '/api/schedules/',
            'issues': '/api/issues/',
            'notifications': '/api/notifications/',
            'reports': '/api/reports/',
            'locations': '/api/locations/',
            'admin': '/admin/',
        }
    })


urlpatterns = [
    path('', api_root, name='api_root'),
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.api_urls')),
    path('api/buses/', include('buses.api_urls')),
    path('api/schedules/', include('schedules.api_urls')),
    path('api/issues/', include('issues.api_urls')),
    path('api/notifications/', include('notifications.api_urls')),
    path('api/reports/', include('reports.api_urls')),
    path('api/locations/', include('locations.api_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
