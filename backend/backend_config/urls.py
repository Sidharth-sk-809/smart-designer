from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('customizer.urls')),
]

# Serve media files in development AND production for this prototype
# In a real production environment, use S3 or a dedicated media server
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
