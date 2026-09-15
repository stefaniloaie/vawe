from django.urls import path

from . import views


urlpatterns = [
    path("categories", views.categories, name="categories"),
    path("categories/<str:category>", views.category_detail, name="category-detail"),
    path("ocean/stations", views.station_list, name="ocean-stations"),
    path("ocean/buoy/<str:station_id>", views.buoy_observations, name="ocean-buoy"),
    path("ocean/rankings", views.wave_rankings, name="ocean-rankings"),
    path("ocean/game/buoys", views.game_buoys, name="game-buoys"),
    path("game/daily/<str:day>", views.daily_challenge_api, name="daily-challenge"),
    path("game/daily/<str:day>/answer", views.daily_answer_api, name="daily-answer"),
    path("earthquakes", views.earthquakes, name="earthquakes"),
    path("events/live", views.events_live, name="events-live"),
    path("events/recent", views.events_recent, name="events-recent"),
    path("events/activity", views.events_activity, name="events-activity"),
    path("events/<str:event_id>", views.event_api, name="event-api"),
    path("game/leaderboard", views.leaderboard, name="leaderboard"),
]
