import json
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.core.cache import cache

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

    def test_every_tab_has_a_django_category_contract(self):
        response = self.client.get("/api/categories")

        self.assertEqual(response.status_code, 200)
        category_ids = {category["category"] for category in response.json()["categories"]}
        self.assertSetEqual(category_ids, {"OCEAN", "EARTH", "AIR", "SHIPS", "WEATHER", "TRAFFIC", "SPACE"})

        air_response = self.client.get("/api/categories/air")
        self.assertEqual(air_response.status_code, 503)
        self.assertEqual(air_response.json()["status"], "configuration_required")

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
        self.assertContains(response, "See where waves are rising")
        self.assertContains(response, "Live Ocean Wave Events &amp; NOAA Buoy Data")
        self.assertEqual(self.client.get("/waves/california").status_code, 200)
        self.assertEqual(self.client.get("/buoys/not-a-station").status_code, 404)
        self.assertEqual(self.client.get("/not-a-route").status_code, 404)

    def test_sitemap_uses_curated_station_routes_and_robots_excludes_api(self):
        sitemap = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap.status_code, 200)
        self.assertContains(sitemap, "/buoys/46026-san-francisco")
        self.assertNotContains(sitemap, "/api/")
        robots = self.client.get("/robots.txt")
        self.assertContains(robots, "Disallow: /api/")

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
