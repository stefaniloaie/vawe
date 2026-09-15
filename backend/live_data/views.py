from __future__ import annotations

from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
from typing import Any
from xml.sax.saxutils import escape

from django.conf import settings
from django.core.cache import cache
from django.http import FileResponse, HttpRequest, HttpResponse, HttpResponseNotFound, JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .models import DailyAttempt, DailyChallenge, LeaderboardEntry
from .now_events import event_detail, filter_events, live_events_payload
from .seo import breadcrumb_schema, page_meta, public_url
from .services import (
    BUOY_STATIONS,
    HIGH_WAVE_THRESHOLD_METERS,
    REGIONS,
    ProviderError,
    buoy_payload,
    category_catalog,
    category_snapshot,
    daily_challenge_payload,
    earthquakes_payload,
    game_buoys_payload,
    ocean_overview,
    station_by_slug,
    station_intelligence,
    stations_for_region,
    wave_rankings_payload,
)


LEARN_PAGES = {
    "significant-wave-height": {
        "title": "What Is Significant Wave Height? | Signal Atlas",
        "heading": "What significant wave height means",
        "description": "Understand significant wave height in NOAA buoy observations and why it is useful for reading ocean conditions.",
        "intro": "Significant wave height is a statistical description of the sea state. It approximates the average height of the highest third of measured waves during an observation period.",
        "sections": [
            ("What the buoy reports", "NOAA NDBC publishes WVHT in metres. It describes a measured sea-state statistic, not the height of every individual wave."),
            ("Why it matters", "It gives a compact way to compare changing wave conditions between observation times and stations."),
        ],
    },
    "how-ocean-buoys-measure-waves": {
        "title": "How Ocean Buoys Measure Waves | Signal Atlas",
        "heading": "How ocean buoys measure waves",
        "description": "A plain-language guide to the observations NOAA ocean buoys collect and how Signal Atlas displays them.",
        "intro": "Ocean buoys use instruments that record motion and meteorological conditions. NOAA NDBC publishes those observations in station feeds.",
        "sections": [
            ("Observed, not predicted", "Signal Atlas displays available station observations. Forecasts and official marine warnings come from separate NOAA and NWS products."),
            ("The useful fields", "Wave height, dominant period, average period, wind speed and water temperature may be available, depending on the station feed."),
        ],
    },
    "wave-height-vs-swell-height": {
        "title": "Wave Height vs Swell Height | Signal Atlas",
        "heading": "Wave height versus swell height",
        "description": "Learn the difference between a buoy’s observed significant wave height and the idea of a swell.",
        "intro": "A buoy’s significant wave height summarizes the measured sea state at that location. Swell describes organized wave energy travelling away from its generating weather system.",
        "sections": [
            ("One observation, many influences", "A station’s observed wave height can include swell, local wind waves and other sea-state components."),
            ("Read the periods too", "Dominant and average wave periods give additional context when they are available in the source feed."),
        ],
    },
    "wave-period-explained": {
        "title": "Wave Period Explained | Signal Atlas",
        "heading": "Wave period explained",
        "description": "Understand dominant and average wave period fields in NOAA buoy observations.",
        "intro": "Wave period is the elapsed time between wave crests. NOAA station feeds can report dominant period and average period in seconds.",
        "sections": [
            ("Dominant period", "The dominant period identifies the wave energy peak reported by the station’s spectral analysis."),
            ("Average period", "Average period is another reported summary of the observed wave field. Availability differs by station and observation."),
        ],
    },
}


def _error(message: str, status: int = 502, **details: Any) -> JsonResponse:
    return JsonResponse({"error": message, **details}, status=status)


def _vite_assets() -> dict[str, str]:
    """Read the built Vite entry so interactive routes work after hashed builds."""
    index_path = Path(settings.PROJECT_ROOT) / "dist" / "index.html"
    if not index_path.exists():
        return {"styles": "", "script": ""}
    index = index_path.read_text(encoding="utf-8")
    styles = "".join(f'<link rel="stylesheet" href="{href}">' for href in re.findall(r'href="(/assets/[^"?]+\.css)"', index))
    scripts = re.findall(r'<script[^>]+type="module"[^>]+src="([^"]+)"', index)
    script = f'<script type="module" src="{scripts[-1]}"></script>' if scripts else ""
    return {"styles": styles, "script": script}


def _chart_points(measurements: list[dict[str, Any]]) -> list[str]:
    values = [item["value"] for item in measurements if isinstance(item.get("value"), (int, float))]
    if len(values) < 2:
        return []
    low, high = min(values), max(values)
    span = high - low or 1
    return [f"{round(index * 720 / (len(values) - 1), 1)},{round(180 - ((value - low) / span) * 164 - 8, 1)}" for index, value in enumerate(values)]


def _page(request: HttpRequest, *, path: str, title: str, description: str, schemas: list[dict[str, Any]], context: dict[str, Any], interactive: bool = False, status: int = 200) -> HttpResponse:
    assets = _vite_assets() if interactive else {"styles": "", "script": ""}
    return render(request, "live_data/page.html", {
        **page_meta(request, path=path, title=title, description=description, schemas=schemas),
        **context,
        "current_path": path,
        "regions": REGIONS,
        "today": datetime.now(timezone.utc).date().isoformat(),
        "vite_styles": assets["styles"],
        "vite_script": assets["script"],
        "interactive": interactive,
    }, status=status)


def _dataset_schema(request: HttpRequest, station: dict[str, Any], intelligence: dict[str, Any] | None) -> dict[str, Any]:
    payload = intelligence["payload"] if intelligence else {}
    return {
        "@context": "https://schema.org", "@type": "Dataset", "name": f"{station['name']} NOAA buoy observations",
        "description": "Observed significant wave height and related marine measurements from NOAA NDBC.",
        "url": public_url(request, f"/buoys/{station['slug']}"),
        "creator": {"@type": "Organization", "name": "NOAA National Data Buoy Center", "url": "https://www.ndbc.noaa.gov"},
        "temporalCoverage": payload.get("lastObservation"),
        "variableMeasured": ["Significant wave height", "Dominant wave period", "Average wave period", "Wind speed", "Water temperature"],
        "spatialCoverage": {"@type": "Place", "geo": {"@type": "GeoCoordinates", "latitude": station["lat"], "longitude": station["lon"]}},
    }


@require_GET
def station_list(_: HttpRequest) -> JsonResponse:
    return JsonResponse({"stations": BUOY_STATIONS, "source": "NOAA National Data Buoy Center (NDBC)", "homepage": "https://www.ndbc.noaa.gov"})


@require_GET
def categories(_: HttpRequest) -> JsonResponse:
    return JsonResponse({"categories": category_catalog()})


@require_GET
def category_detail(_: HttpRequest, category: str) -> JsonResponse:
    try:
        payload = category_snapshot(category)
    except KeyError:
        return _error("Unknown telemetry category.", 404, category=category.upper())
    except ProviderError as exc:
        return _error("The configured public provider could not return live data.", category=category.upper(), details=str(exc))
    if payload["status"] == "configuration_required" and not payload["isConfigured"]:
        return JsonResponse(payload, status=503)
    return JsonResponse(payload)


@require_GET
def buoy_observations(_: HttpRequest, station_id: str) -> JsonResponse:
    try:
        return JsonResponse(buoy_payload(station_id))
    except ProviderError as exc:
        return _error(f"Failed to fetch NOAA buoy data for station {station_id.upper()}", stationId=station_id.upper(), isUnavailable=True, details=str(exc))


@require_GET
def wave_rankings(request: HttpRequest) -> JsonResponse:
    try:
        return JsonResponse(wave_rankings_payload(request.GET.get("window", "24H")))
    except ValueError as exc:
        return _error(str(exc), 400)


@require_GET
def game_buoys(_: HttpRequest) -> JsonResponse:
    return JsonResponse(game_buoys_payload())


@require_GET
def daily_challenge_api(_: HttpRequest, day: str) -> JsonResponse:
    try:
        challenge_date = date.fromisoformat(day)
        challenge = daily_challenge_payload(challenge_date)
        public_rounds = [{
            "round": round_data["round"],
            "left": round_data["left"],
            "right": {key: value for key, value in round_data["right"].items() if key != "waveHeight"},
        } for round_data in challenge["rounds"]]
        # Answers and the hidden buoy height are revealed only after a
        # server-validated, in-order guess from this browser.
        return JsonResponse({**challenge, "rounds": public_rounds})
    except ValueError:
        return _error("Use a valid ISO date for the daily challenge.", 404)
    except ProviderError as exc:
        return _error("Today’s daily challenge is not available yet because enough NOAA buoy observations were not returned.", 503, details=str(exc))


@csrf_exempt
@require_http_methods(["POST"])
def daily_answer_api(request: HttpRequest, day: str) -> JsonResponse:
    try:
        challenge_date = date.fromisoformat(day)
        challenge = DailyChallenge.objects.get(challenge_date=challenge_date)
        body = json.loads(request.body or "{}")
    except (ValueError, DailyChallenge.DoesNotExist, json.JSONDecodeError):
        return _error("This recorded daily challenge is not available.", 404)
    player_key = str(body.get("playerKey", "")).strip()
    guess, round_number = body.get("guess"), body.get("round")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", player_key):
        return _error("A valid local game key is required.", 400)
    if guess not in {"higher", "lower"} or not isinstance(round_number, int) or not 1 <= round_number <= 5:
        return _error("Use a valid round and higher-or-lower guess.", 400)
    if not cache.add(f"daily-answer:{_request_identity(request)}", True, 1):
        return _error("Please wait a moment before the next guess.", 429)
    attempt, _ = DailyAttempt.objects.get_or_create(challenge=challenge, player_key=player_key)
    if attempt.completed or round_number != len(attempt.answers) + 1:
        return _error("This guess is out of sequence or has already been recorded.", 409)
    round_data = next((item for item in challenge.rounds if item.get("round") == round_number), None)
    if not round_data:
        return _error("This challenge round does not exist.", 404)
    correct = round_data["answer"] == guess
    attempt.answers = [*attempt.answers, {"round": round_number, "guess": guess, "correct": correct}]
    attempt.score += int(correct)
    attempt.completed = round_number == len(challenge.rounds)
    attempt.save(update_fields=["answers", "score", "completed", "updated_at"])
    return JsonResponse({"round": round_number, "correct": correct, "answer": round_data["answer"], "left": round_data["left"], "right": round_data["right"], "score": attempt.score, "completed": attempt.completed})


@require_GET
def earthquakes(_: HttpRequest) -> JsonResponse:
    try:
        return JsonResponse(earthquakes_payload())
    except ProviderError as exc:
        return _error("Failed to fetch the USGS earthquake feed", details=str(exc))


@require_GET
def events_live(request: HttpRequest) -> JsonResponse:
    domain = request.GET.get("domain", "ALL").upper()
    status = request.GET.get("status", "ALL").upper()
    if domain not in {"ALL", "EARTH", "OCEAN", "WEATHER", "AIR", "SHIPS"}:
        return _error("Use a supported NOW domain filter.", 400)
    if status not in {"ALL", "LIVE", "RECENT"}:
        return _error("Use ALL, LIVE, or RECENT for the NOW status filter.", 400)
    multi = request.GET.get("multi", "false").lower() in {"1", "true", "yes"}
    return JsonResponse(filter_events(live_events_payload(), domain=domain, status=status, multi=multi))


@require_GET
def events_recent(request: HttpRequest) -> JsonResponse:
    domain = request.GET.get("domain", "ALL").upper()
    if domain not in {"ALL", "EARTH", "OCEAN", "WEATHER", "AIR", "SHIPS"}:
        return _error("Use a supported NOW domain filter.", 400)
    multi = request.GET.get("multi", "false").lower() in {"1", "true", "yes"}
    return JsonResponse(filter_events(live_events_payload(), domain=domain, status="RECENT", multi=multi))


@require_GET
def event_api(_: HttpRequest, event_id: str) -> JsonResponse:
    detail = event_detail(event_id)
    if not detail:
        return _error("This live event has expired or is no longer available.", 404)
    return JsonResponse(detail)


@require_GET
def events_activity(_: HttpRequest) -> JsonResponse:
    payload = live_events_payload()
    return JsonResponse({"updatedAt": payload["updatedAt"], "activity": payload["activity"], "providers": payload["providers"]})


def _entry_json(entry: LeaderboardEntry) -> dict[str, Any]:
    return {"id": str(entry.id), "name": entry.name, "streak": entry.streak, "rankTitle": entry.rank_title, "accuracy": entry.accuracy, "challengeDate": entry.challenge_date.isoformat() if entry.challenge_date else None, "timestamp": entry.created_at.isoformat().replace("+00:00", "Z")}


def _top_scores(challenge_date: date | None = None) -> list[LeaderboardEntry]:
    query = LeaderboardEntry.objects.all()
    if challenge_date:
        query = query.filter(challenge_date=challenge_date)
    return list(query[:10])


def _request_identity(request: HttpRequest) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
    return forwarded or request.META.get("REMOTE_ADDR", "unknown")


@csrf_exempt
@require_http_methods(["GET", "POST"])
def leaderboard(request: HttpRequest) -> JsonResponse:
    if request.method == "GET":
        raw_day = request.GET.get("date")
        try:
            challenge_date = date.fromisoformat(raw_day) if raw_day else None
        except ValueError:
            return _error("Use a valid ISO date.", 400)
        entries = _top_scores(challenge_date)
        total = LeaderboardEntry.objects.filter(challenge_date=challenge_date).count() if raw_day else LeaderboardEntry.objects.count()
        return JsonResponse({"total": total, "leaderboard": [_entry_json(entry) for entry in entries]})

    try:
        body = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return _error("Invalid JSON body.", 400)
    if not cache.add(f"leaderboard-submit:{_request_identity(request)}", True, 8):
        return _error("Please wait a few seconds before another score submission.", 429)

    name = str(body.get("name", "")).strip()[:20] or "Anonymous Navigator"
    streak = body.get("streak")
    if not isinstance(streak, (int, float)) or isinstance(streak, bool) or streak <= 0:
        return _error("Invalid score submission. A positive score is required.", 400)
    challenge_date: date | None = None
    raw_day = body.get("challengeDate")
    if raw_day:
        try:
            challenge_date = date.fromisoformat(str(raw_day))
        except ValueError:
            return _error("Use a valid ISO challenge date.", 400)
        challenge = DailyChallenge.objects.filter(challenge_date=challenge_date).first()
        attempt_key = str(body.get("attemptKey", "")).strip()
        if not challenge or not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", attempt_key):
            return _error("This daily score does not match a recorded five-round challenge.", 400)
        attempt = DailyAttempt.objects.filter(challenge=challenge, player_key=attempt_key).first()
        if not attempt or not attempt.completed or not float(streak).is_integer() or int(streak) != attempt.score:
            return _error("Finish the recorded challenge before submitting its server-verified score.", 400)
        submission_key = f"daily-{challenge_date.isoformat()}-{attempt_key}"
    else:
        submission_key = str(body.get("submissionKey", "")).strip()
    if submission_key and not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", submission_key):
        return _error("Invalid score submission key.", 400)
    if submission_key:
        existing = LeaderboardEntry.objects.filter(submission_key=submission_key).first()
        if existing:
            return JsonResponse({"success": True, "duplicate": True, "entry": _entry_json(existing), "leaderboard": [_entry_json(item) for item in _top_scores(existing.challenge_date)]})
    accuracy = body.get("accuracy")
    accuracy = max(0, min(100, round(accuracy))) if isinstance(accuracy, (int, float)) and not isinstance(accuracy, bool) else None
    entry = LeaderboardEntry.objects.create(name=name, streak=min(int(streak), 5 if challenge_date else 100), rank_title=str(body.get("rankTitle") or "Ocean Navigator")[:60], accuracy=accuracy, challenge_date=challenge_date, submission_key=submission_key or None)
    query = LeaderboardEntry.objects.filter(challenge_date=challenge_date) if challenge_date else LeaderboardEntry.objects.filter(challenge_date__isnull=True)
    overflow = list(query[50:])
    if overflow:
        LeaderboardEntry.objects.filter(id__in=[item.id for item in overflow]).delete()
    top_entries = _top_scores(challenge_date)
    player_rank = next((index + 1 for index, item in enumerate(top_entries) if item.id == entry.id), None)
    return JsonResponse({"success": True, "entry": _entry_json(entry), "playerRank": player_rank, "leaderboard": [_entry_json(item) for item in top_entries]})


@require_GET
def home(request: HttpRequest) -> HttpResponse:
    try:
        overview = ocean_overview()
    except ProviderError as exc:
        overview = {"status": "unavailable", "message": str(exc), "stations": []}
    schemas = [
        {"@context": "https://schema.org", "@type": "WebSite", "name": "Signal Atlas", "description": "Live ocean, weather, earthquake and space data with source context.", "url": public_url(request, "/")},
        {"@context": "https://schema.org", "@type": "WebApplication", "name": "Signal Atlas Live Data Explorer", "description": "Explore live ocean waves, weather, earthquakes and space-weather conditions from public data sources.", "applicationCategory": "WeatherApplication", "operatingSystem": "Web", "isAccessibleForFree": True, "url": public_url(request, "/")},
    ]
    return _page(request, path="/", title="Live Ocean Wave Data & NOAA Buoy Tracker | Signal Atlas", description="Explore live ocean waves, weather, earthquakes and space-weather conditions from transparent public data sources with Signal Atlas.", schemas=schemas, context={"page_type": "home", "overview": overview})


@require_GET
def waves(request: HttpRequest) -> HttpResponse:
    try:
        overview = ocean_overview()
    except ProviderError as exc:
        overview = {"status": "unavailable", "message": str(exc), "stations": []}
    schema = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "Live NOAA wave height observations", "description": "Live ocean wave height and NOAA buoy data from Signal Atlas's curated stations.", "url": public_url(request, "/waves"), "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": index, "name": station["name"], "url": public_url(request, f"/buoys/{station['slug']}")} for index, station in enumerate(overview.get("stations", []), start=1)]}}
    return _page(request, path="/waves", title="Live Wave Height Today — NOAA Buoy Data | Signal Atlas", description="Explore observed wave height, changing conditions and recent threshold events from curated NOAA ocean buoys.", schemas=[schema, breadcrumb_schema(request, [("Home", "/"), ("Waves", "/waves")])], context={"page_type": "waves", "overview": overview, "breadcrumbs": [("Home", "/"), ("Waves", "/waves")]})


@require_GET
def region_page(request: HttpRequest, region: str) -> HttpResponse:
    details = REGIONS.get(region)
    if not details:
        return HttpResponseNotFound("This wave region does not exist.")
    stations = stations_for_region(region)
    cards = []
    for station in stations:
        try:
            intelligence = station_intelligence(station)
            cards.append({"station": station, "latest": intelligence["latest"], "isStale": intelligence["isStale"], "unavailable": False})
        except ProviderError:
            cards.append({"station": station, "latest": None, "isStale": True, "unavailable": True})
    title_region = details["name"]
    schema = {"@context": "https://schema.org", "@type": "CollectionPage", "name": f"{title_region} wave observations", "description": f"Observed NOAA buoy wave-height data for {title_region}.", "url": public_url(request, f"/waves/{region}"), "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": index, "name": station["name"], "url": public_url(request, f"/buoys/{station['slug']}")} for index, station in enumerate(stations, 1)]}}
    breadcrumbs = [("Home", "/"), ("Waves", "/waves"), (title_region, f"/waves/{region}")]
    return _page(request, path=f"/waves/{region}", title=f"{title_region} Wave Height Today — NOAA Buoys | Signal Atlas", description=f"Observed NOAA buoy wave heights and event context for {title_region}.", schemas=[schema, breadcrumb_schema(request, breadcrumbs)], context={"page_type": "region", "region": {"id": region, **details}, "cards": cards, "breadcrumbs": breadcrumbs})


@require_GET
def buoy_page(request: HttpRequest, station_slug: str) -> HttpResponse:
    station = station_by_slug(station_slug)
    if not station:
        return HttpResponseNotFound("This curated NOAA buoy page does not exist.")
    try:
        intelligence, error = station_intelligence(station), None
    except ProviderError as exc:
        intelligence, error = None, str(exc)
    region = REGIONS.get(station["region"], {"name": station["region"].replace("-", " ").title()})
    nearby = [candidate for candidate in BUOY_STATIONS if candidate["id"] != station["id"] and candidate["region"] == station["region"]][:3] or [candidate for candidate in BUOY_STATIONS if candidate["id"] != station["id"]][:3]
    breadcrumbs = [("Home", "/"), ("Waves", "/waves"), (region["name"], f"/waves/{station['region']}"), (station["name"], f"/buoys/{station['slug']}")]
    schemas = [
        {"@context": "https://schema.org", "@type": "WebPage", "name": f"{station['name']} wave height today", "url": public_url(request, f"/buoys/{station['slug']}")}, _dataset_schema(request, station, intelligence), breadcrumb_schema(request, breadcrumbs),
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": "What is significant wave height?", "acceptedAnswer": {"@type": "Answer", "text": "It is a statistical measure that approximates the average height of the highest third of measured waves during an observation period."}}]},
    ]
    title = f"{station['name'].replace(' Buoy', '')} Wave Height Today — NOAA Buoy {station['id']} | Signal Atlas"
    return _page(request, path=f"/buoys/{station['slug']}", title=title, description=f"Live observed significant wave height, wave period and event context for NOAA buoy {station['id']} near {station['location']}.", schemas=schemas, context={"page_type": "station", "station": station, "intelligence": intelligence, "error": error, "nearby": nearby, "chart_points": _chart_points(intelligence["measurements24h"]) if intelligence else [], "breadcrumbs": breadcrumbs, "high_threshold": HIGH_WAVE_THRESHOLD_METERS})


@require_GET
def legacy_ocean_buoy(request: HttpRequest, station_id: str) -> HttpResponse:
    """Consolidate the former client-side buoy URL into its indexable page."""
    station = next((item for item in BUOY_STATIONS if item["id"] == station_id.upper()), None)
    if not station:
        return HttpResponseNotFound("This curated NOAA buoy page does not exist.")
    return redirect(f"/buoys/{station['slug']}", permanent=True)


@require_GET
def game_page(request: HttpRequest) -> HttpResponse:
    today = datetime.now(timezone.utc).date().isoformat()
    schema = {"@context": "https://schema.org", "@type": "Game", "name": "Swell Duel", "description": "A five-round higher-or-lower game based on a recorded NOAA buoy observation snapshot.", "url": public_url(request, "/game")}
    return _page(request, path="/game", title="Swell Duel — Daily NOAA Buoy Game | Signal Atlas", description="Play a daily higher-or-lower wave challenge using observed NOAA buoy data.", schemas=[schema], context={"page_type": "game", "daily_path": f"/game/daily/{today}"}, interactive=True)


@require_GET
def daily_game_page(request: HttpRequest, day: str) -> HttpResponse:
    try:
        challenge_date = date.fromisoformat(day)
        if challenge_date > datetime.now(timezone.utc).date():
            raise ValueError
        challenge = daily_challenge_payload(challenge_date)
    except (ValueError, ProviderError):
        return HttpResponseNotFound("This daily challenge is not available.")
    schema = {"@context": "https://schema.org", "@type": "Game", "name": f"Swell Duel daily challenge {day}", "url": public_url(request, f"/game/daily/{day}")}
    return _page(request, path=f"/game/daily/{day}", title=f"Swell Duel Daily Challenge — {day} | Signal Atlas", description="Five NOAA-observed higher-or-lower buoy rounds recorded for this day.", schemas=[schema], context={"page_type": "daily_game", "challenge": challenge, "daily_path": f"/game/daily/{day}"}, interactive=True)


@require_GET
def earthquake_page(request: HttpRequest) -> HttpResponse:
    try:
        data, error = earthquakes_payload(), None
        latest = data.get("measurements", [])[-1] if data.get("measurements") else None
    except ProviderError as exc:
        latest, error = None, str(exc)
    schema = {"@context": "https://schema.org", "@type": "WebPage", "name": "Live earthquakes from USGS", "url": public_url(request, "/earthquakes")}
    return _page(request, path="/earthquakes", title="Live Earthquake Events Today — USGS Data | Signal Atlas", description="Observed earthquake events from the USGS Earthquake Hazards Program.", schemas=[schema], context={"page_type": "earthquakes", "latest_earthquake": latest, "error": error}, interactive=True)


@require_GET
def now_page(request: HttpRequest) -> HttpResponse:
    schemas = [{"@context": "https://schema.org", "@type": "WebPage", "name": "What's Happening Right Now? Live World Events", "description": "Explore live events happening around the world, connecting observed ocean and earthquake signals with available public data sources.", "url": public_url(request, "/now") }]
    return _page(request, path="/now", title="What's Happening Right Now? Live World Events | Signal Atlas", description="Explore live events happening around the world right now, connecting signals from oceans, earthquakes, weather, aircraft and ships.", schemas=schemas, context={"page_type": "now"}, interactive=True)


@require_GET
def event_page(request: HttpRequest, event_id: str) -> HttpResponse:
    detail = event_detail(event_id)
    if not detail:
        return HttpResponseNotFound("This live event has expired or is no longer available.")
    event = detail["event"]
    schemas = [{"@context": "https://schema.org", "@type": "Event", "name": event["title"], "startDate": event["timestamp"], "location": {"@type": "Place", "name": event["location"], "geo": {"@type": "GeoCoordinates", "latitude": event["latitude"], "longitude": event["longitude"]}}, "url": public_url(request, f"/events/{event_id}") }]
    return _page(request, path=f"/events/{event_id}", title=f"{event['title']} — Live Event | Signal Atlas", description=event["summary"], schemas=schemas, context={"page_type": "event_detail", "event": event}, interactive=True)


@require_GET
def learn_index(request: HttpRequest) -> HttpResponse:
    articles = [{"slug": slug, **article} for slug, article in LEARN_PAGES.items()]
    schema = {"@context": "https://schema.org", "@type": "CollectionPage", "name": "Ocean wave data guides", "description": "Plain-language guides to significant wave height, wave periods, swells, and NOAA buoy observations.", "url": public_url(request, "/learn"), "mainEntity": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": index, "name": article["heading"], "url": public_url(request, f"/learn/{article['slug']}")} for index, article in enumerate(articles, start=1)]}}
    return _page(request, path="/learn", title="Ocean Wave Data Explained — NOAA Buoy Guides | Signal Atlas", description="Learn how to read live wave height, NOAA buoy observations, swell, and wave period data in plain language.", schemas=[schema, breadcrumb_schema(request, [("Home", "/"), ("Learn", "/learn")])], context={"page_type": "learn_index", "articles": articles, "breadcrumbs": [("Home", "/"), ("Learn", "/learn")]})


@require_GET
def learn_page(request: HttpRequest, article: str) -> HttpResponse:
    page = LEARN_PAGES.get(article)
    if not page:
        return HttpResponseNotFound("This learning page does not exist.")
    path = f"/learn/{article}"
    breadcrumbs = [("Home", "/"), ("Learn", "/learn"), (page["heading"], path)]
    schema = {"@context": "https://schema.org", "@type": "Article", "headline": page["heading"], "description": page["description"], "mainEntityOfPage": public_url(request, path), "publisher": {"@type": "Organization", "name": "Signal Atlas"}}
    return _page(request, path=path, title=page["title"], description=page["description"], schemas=[schema, breadcrumb_schema(request, breadcrumbs)], context={"page_type": "learn", "article": page, "breadcrumbs": breadcrumbs})


@require_GET
def robots(request: HttpRequest) -> HttpResponse:
    return HttpResponse(f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {public_url(request, '/sitemap.xml')}\n", content_type="text/plain; charset=utf-8")


@require_GET
def sitemap(request: HttpRequest) -> HttpResponse:
    paths = ["/", "/now", "/waves", "/learn", "/game", f"/game/daily/{datetime.now(timezone.utc).date().isoformat()}", "/earthquakes"]
    paths.extend(f"/waves/{region}" for region in REGIONS)
    paths.extend(f"/buoys/{station['slug']}" for station in BUOY_STATIONS)
    paths.extend(f"/learn/{article}" for article in LEARN_PAGES)
    entries = "".join(f"<url><loc>{escape(public_url(request, path))}</loc></url>" for path in paths)
    return HttpResponse(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{entries}</urlset>', content_type="application/xml; charset=utf-8")


@require_GET
def public_image(_: HttpRequest, asset_path: str) -> HttpResponse:
    root = (Path(settings.PROJECT_ROOT) / "dist" / "images").resolve()
    candidate = (root / asset_path).resolve()
    if root not in candidate.parents or not candidate.is_file():
        return HttpResponseNotFound("Image not found.")
    return FileResponse(candidate.open("rb"))
