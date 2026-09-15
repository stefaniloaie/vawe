from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

from live_data import views


urlpatterns = [
    path("api/", include("live_data.urls")),
    path("robots.txt", views.robots, name="robots"),
    path("sitemap.xml", views.sitemap, name="sitemap"),
    path("images/<path:asset_path>", views.public_image, name="public-image"),
    path("", views.home, name="home"),
    path("waves", views.waves, name="waves"),
    path("waves/<str:region>", views.region_page, name="region"),
    path("buoys/<str:station_slug>", views.buoy_page, name="buoy-page"),
    path("ocean/waves/<str:station_id>", views.legacy_ocean_buoy, name="legacy-ocean-buoy"),
    path("game", views.game_page, name="game"),
    path("game/daily/<str:day>", views.daily_game_page, name="daily-game"),
    path("earthquakes", views.earthquake_page, name="earthquakes"),
    path("now", views.now_page, name="now"),
    path("events/<str:event_id>", views.event_page, name="event-page"),
    path("learn", views.learn_index, name="learn-index"),
    path("learn/<str:article>", views.learn_page, name="learn"),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.PROJECT_ROOT / "dist" / "assets")
