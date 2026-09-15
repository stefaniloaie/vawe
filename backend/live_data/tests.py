import json
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.core.cache import cache

from .cross_events import CrossEventDetector, DomainEvent, GeoObservation
from .models import DailyChallenge


class ApiContractTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_station_directory_is_served_by_django(self):
        response = self.client.get("/api/ocean/stations")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["stations"][0]["id"], "46026")
        self.assertIn("NOAA", payload["source"])

    @patch("live_data.views.wave_rankings_payload")
    def test_wave_rankings_are_served_by_django_for_a_selected_window(self, mock_rankings):
        mock_rankings.return_value = {
            "window": "6H",
            "stationsReporting": 4,
            "rankings": [{
                "station": {"id": "46026", "name": "San Francisco Buoy", "location": "18 NM West of San Francisco, CA"},
                "peakWaveHeight": 2.8,
                "unit": "m",
                "peakObservedAt": "2026-09-15T08:00:00Z",
            }],
        }
        response = self.client.get("/api/ocean/rankings?window=6H")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["window"], "6H")
        self.assertEqual(response.json()["rankings"][0]["station"]["id"], "46026")
        mock_rankings.assert_called_once_with("6H")

    @patch("live_data.views.wave_rankings_payload", side_effect=ValueError("window must be one of 1H, 6H, 24H, or 7D"))
    def test_wave_rankings_reject_unknown_windows(self, _):
        response = self.client.get("/api/ocean/rankings?window=forever")

        self.assertEqual(response.status_code, 400)

    def test_every_tab_has_a_django_category_contract(self):
        response = self.client.get("/api/categories")

        self.assertEqual(response.status_code, 200)
        category_ids = {category["category"] for category in response.json()["categories"]}
        self.assertSetEqual(category_ids, {"OCEAN", "EARTH", "AIR", "SHIPS", "WEATHER", "TRAFFIC", "SPACE"})

        air_response = self.client.get("/api/categories/air")
        self.assertEqual(air_response.status_code, 503)
        self.assertEqual(air_response.json()["status"], "configuration_required")

    @patch("live_data.views.live_events_payload")
    def test_now_events_api_filters_real_event_contract_without_creating_mock_events(self, mock_events):
        mock_events.return_value = {
            "updatedAt": "2026-09-15T12:00:00Z",
            "events": [{"id": "event-ocean", "status": "LIVE", "domains": ["OCEAN"], "title": "High waves"}, {"id": "event-earth", "status": "RECENT", "domains": ["EARTH", "OCEAN"], "title": "Earthquake"}],
            "eventDetails": {}, "providers": [], "counts": {"OCEAN": 1, "EARTH": 1}, "activeEventCount": 1, "activity": [], "isQuiet": False,
            "correlation": {"radiusKm": 250, "timeWindowMinutes": 60, "method": "Haversine"},
        }

        response = self.client.get("/api/events/live?domain=ocean&status=live&multi=true")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["filters"], {"domain": "OCEAN", "status": "LIVE", "multi": True})
        self.assertEqual(response.json()["events"], [])
        self.assertNotIn("eventDetails", response.json())

    def test_now_page_is_indexable_and_in_sitemap(self):
        response = self.client.get("/now")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "What&#x27;s Happening Right Now? Live World Events | Signal Atlas")
        self.assertContains(response, 'rel="canonical" href="http://testserver/now"')
        self.assertContains(response, "What's happening right now?")
        self.assertContains(self.client.get("/sitemap.xml"), "/now")

    def test_leaderboard_score_is_persisted(self):
        response = self.client.post(
            "/api/game/leaderboard",
            data=json.dumps({"name": "TestRider", "streak": 7, "rankTitle": "Coastline Scout", "accuracy": 86}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["entry"]["name"], "TestRider")
        self.assertEqual(payload["leaderboard"][0]["streak"], 7)

    @patch("live_data.views.station_intelligence")
    @patch("live_data.views.ocean_overview")
    def test_public_wave_routes_render_meaningful_html_and_unknown_routes_404(self, mock_overview, mock_station_intelligence):
        mock_overview.return_value = {
            "status": "live", "threshold": 3.0, "aboveThresholdCount": 1,
            "workingStationCount": 1, "unavailableStationCount": 9,
            "highest": {"waveHeight": 3.4, "slug": "46026-san-francisco", "name": "San Francisco Buoy", "id": "46026"},
            "newEventsPastHour": 0, "fastestRising": None, "pacificAverage": 3.4,
            "atlanticAverage": None, "latestCrossing": None,
            "stations": [{"slug": "46026-san-francisco", "name": "San Francisco Buoy", "id": "46026", "location": "San Francisco", "waveHeight": 3.4, "timestamp": "2026-01-01T00:00:00Z"}],
        }
        mock_station_intelligence.return_value = {"latest": {"value": 3.4, "timestamp": "2026-01-01T00:00:00Z"}, "isStale": False}
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Live ocean wave data from NOAA buoys")
        self.assertContains(response, "Live Ocean Wave Data &amp; NOAA Buoy Tracker | Signal Atlas")
        self.assertContains(response, 'rel="canonical" href="http://testserver/"')
        self.assertContains(response, 'property="og:site_name" content="Signal Atlas"')
        self.assertContains(response, 'name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"')
        self.assertContains(response, '"@type":"WebSite"')
        self.assertEqual(self.client.get("/waves/california").status_code, 200)
        self.assertEqual(self.client.get("/waves/atlantic").status_code, 200)
        self.assertEqual(self.client.get("/learn").status_code, 200)
        legacy = self.client.get("/ocean/waves/46026")
        self.assertEqual(legacy.status_code, 301)
        self.assertEqual(legacy["Location"], "/buoys/46026-san-francisco")
        self.assertEqual(self.client.get("/buoys/not-a-station").status_code, 404)
        self.assertEqual(self.client.get("/not-a-route").status_code, 404)

    def test_sitemap_uses_curated_station_routes_and_robots_excludes_api(self):
        sitemap = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap.status_code, 200)
        self.assertContains(sitemap, "/buoys/46026-san-francisco")
        self.assertContains(sitemap, "/waves/atlantic")
        self.assertContains(sitemap, "/learn")
        self.assertNotContains(sitemap, "/ocean/waves/")
        self.assertNotContains(sitemap, "/api/")
        robots = self.client.get("/robots.txt")
        self.assertContains(robots, "Disallow: /api/")


class CrossEventDetectorTests(TestCase):
    def _event(self, identifier, domain, latitude, longitude, timestamp, severity):
        observation = GeoObservation(identifier, domain, timestamp, latitude, longitude, f"{domain} source", timestamp, metric="test", value=1, unit="unit")
        return DomainEvent(identifier, domain, f"{domain} event", "Observed source event.", "LIVE", timestamp, latitude, longitude, "Test location", f"{domain} source", "https://example.test", timestamp, severity, observation)

    def test_detector_joins_only_events_within_time_and_distance(self):
        timestamp = "2026-09-15T12:00:00Z"
        ocean = self._event("ocean-a", "OCEAN", 37.75, -122.84, timestamp, 45)
        earth = self._event("earth-a", "EARTH", 37.9, -122.8, "2026-09-15T12:20:00Z", 50)
        distant = self._event("earth-b", "EARTH", 12.0, 20.0, timestamp, 50)

        events = CrossEventDetector(radius_km=250, time_window_minutes=60).detect([ocean, earth, distant])

        self.assertEqual(len(events), 2)
        self.assertEqual(events[0].domains, ["EARTH", "OCEAN"])
        self.assertGreater(events[0].significance, 0)
        self.assertEqual(events[1].domains, ["EARTH"])

    def test_recorded_daily_challenge_can_be_served_without_creating_fake_rounds(self):
        today = date.today()
        DailyChallenge.objects.create(challenge_date=today, rounds=[{"round": 1, "left": {"id": "46026", "waveHeight": 1.0}, "right": {"id": "46059", "waveHeight": 2.0}, "answer": "higher"}])
        response = self.client.get(f"/api/game/daily/{today.isoformat()}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rounds"][0]["left"]["id"], "46026")
        self.assertNotIn("answer", response.json()["rounds"][0])
        self.assertNotIn("waveHeight", response.json()["rounds"][0]["right"])

    def test_daily_answers_are_server_validated_before_a_score_can_be_submitted(self):
        today = date.today()
        DailyChallenge.objects.create(challenge_date=today, rounds=[{"round": 1, "left": {"id": "46026", "waveHeight": 1.0}, "right": {"id": "46059", "waveHeight": 2.0}, "answer": "higher"}])
        player_key = "a" * 16
        answer = self.client.post(f"/api/game/daily/{today.isoformat()}/answer", data=json.dumps({"playerKey": player_key, "round": 1, "guess": "higher"}), content_type="application/json")
        self.assertEqual(answer.status_code, 200)
        self.assertTrue(answer.json()["correct"])

        cache.clear()
        forged_score = self.client.post("/api/game/leaderboard", data=json.dumps({"name": "Cheater", "streak": 5, "challengeDate": today.isoformat(), "attemptKey": player_key}), content_type="application/json")
        self.assertEqual(forged_score.status_code, 400)
