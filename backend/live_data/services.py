"""Server-side adapters for public NOAA and USGS live-data feeds."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import os
import random
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json

from django.core.cache import cache
from django.db import IntegrityError

from .models import DailyChallenge


CACHE_TTL_SECONDS = 60
GAME_CACHE_TTL_SECONDS = 45
NOAA_USER_AGENT = "VAWE/1.0 (Public Data Visualizer)"

CATEGORY_CATALOG = {
    "ocean": {
        "category": "OCEAN",
        "status": "live",
        "source": "NOAA National Data Buoy Center",
        "sourceUrl": "https://www.ndbc.noaa.gov",
        "message": "Live wave observations are normalized and cached by Django.",
    },
    "earth": {
        "category": "EARTH",
        "status": "live",
        "source": "USGS Earthquake Hazards Program",
        "sourceUrl": "https://earthquake.usgs.gov",
        "message": "Live global earthquake observations are normalized and cached by Django.",
    },
    "weather": {
        "category": "WEATHER",
        "status": "live",
        "source": "U.S. National Weather Service",
        "sourceUrl": "https://api.weather.gov",
        "message": "Django resolves the NWS forecast for the configured location and returns a normalized snapshot.",
    },
    "space": {
        "category": "SPACE",
        "status": "live",
        "source": "NOAA Space Weather Prediction Center",
        "sourceUrl": "https://services.swpc.noaa.gov",
        "message": "Django serves the latest GOES X-ray flare signal from NOAA SWPC.",
    },
    "air": {
        "category": "AIR",
        "status": "configuration_required",
        "source": "OpenSky Network",
        "sourceUrl": "https://opensky-network.org/data/api",
        "requiredEnv": ["OPENSKY_CLIENT_ID", "OPENSKY_CLIENT_SECRET"],
        "message": "The Django air connector is reserved for an authenticated OpenSky OAuth client and an approved airspace query.",
    },
    "ships": {
        "category": "SHIPS",
        "status": "configuration_required",
        "source": "AIS provider",
        "requiredEnv": ["AIS_PROVIDER_URL", "AIS_API_KEY"],
        "message": "The Django ships connector is ready for a licensed AIS provider. Select a provider and add its credentials server-side.",
    },
    "traffic": {
        "category": "TRAFFIC",
        "status": "configuration_required",
        "source": "Traffic provider",
        "requiredEnv": ["TRAFFIC_PROVIDER_URL", "TRAFFIC_API_KEY"],
        "message": "The Django traffic connector is ready for a chosen road-data provider and a defined geographic coverage area.",
    },
}

BUOY_STATIONS = [
    {"id": "46026", "slug": "46026-san-francisco", "region": "california", "name": "San Francisco Buoy", "location": "18 NM West of San Francisco, CA", "lat": 37.755, "lon": -122.839, "depth": "51.8 m", "description": "Central California shelf buoy monitoring Pacific swell heading toward the Bay Area."},
    {"id": "46059", "slug": "46059-california-offshore", "region": "california", "name": "California Offshore", "location": "350 NM West of San Francisco, CA", "lat": 38.047, "lon": -129.970, "depth": "4480 m", "description": "Deep ocean Pacific basin buoy capturing open ocean storms and massive groundswells."},
    {"id": "46042", "slug": "46042-monterey-bay", "region": "california", "name": "Monterey Bay Buoy", "location": "27 NM WNW of Monterey, CA", "lat": 36.785, "lon": -122.469, "depth": "1980 m", "description": "Deep canyon edge buoy providing high-resolution directional wave spectra."},
    {"id": "51001", "slug": "51001-northwest-hawaii", "region": "hawaii", "name": "NW Hawaii Buoy", "location": "170 NM NW of Kauai, HI", "lat": 24.455, "lon": -162.015, "depth": "3438 m", "description": "Critical North Shore swell indicator capturing large winter/equatorial Pacific wave trains."},
    {"id": "41002", "slug": "41002-south-hatteras", "region": "atlantic", "name": "South Hatteras Buoy", "location": "225 NM East of Charleston, SC", "lat": 31.761, "lon": -74.836, "depth": "3770 m", "description": "Atlantic Gulf Stream station monitoring hurricane swell and major nor’easters."},
    {"id": "44013", "slug": "44013-boston", "region": "new-england", "name": "Boston Harbor Approach", "location": "16 NM East of Boston, MA", "lat": 42.346, "lon": -70.651, "depth": "61.6 m", "description": "Massachusetts Bay station detecting North Atlantic storms and winter sea conditions."},
    {"id": "44007", "slug": "44007-portland-maine", "region": "new-england", "name": "Portland Maine Buoy", "location": "12 NM SE of Portland, ME", "lat": 43.525, "lon": -70.141, "depth": "64.9 m", "description": "Gulf of Maine coastal station monitoring cold Atlantic swells."},
    {"id": "46005", "slug": "46005-washington-offshore", "region": "pacific-northwest", "name": "Washington Offshore", "location": "300 NM West of Aberdeen, WA", "lat": 46.1, "lon": -131.03, "depth": "2780 m", "description": "Pacific Northwest deep-ocean buoy tracking heavy North Pacific storm systems."},
    {"id": "46214", "slug": "46214-point-reyes", "region": "california", "name": "Point Reyes (CDIP 029)", "location": "Offshore Point Reyes, CA", "lat": 37.948, "lon": -123.468, "depth": "550 m", "description": "Scripps CDIP wave buoy providing high-resolution directional wave spectra."},
    {"id": "42001", "slug": "42001-mid-gulf", "region": "gulf-of-mexico", "name": "Mid Gulf of Mexico", "location": "180 NM South of SW Pass, LA", "lat": 25.9, "lon": -89.65, "depth": "3246 m", "description": "Deep Gulf station tracking tropical depressions, storms, and southern wave dynamics."},
]

REGIONS = {
    "california": {"name": "California", "description": "NOAA and CDIP buoy observations off the California coast."},
    "hawaii": {"name": "Hawaii", "description": "Open-ocean swell observations northwest of Hawaii."},
    "new-england": {"name": "New England", "description": "North Atlantic and Gulf of Maine buoy observations."},
    "gulf-of-mexico": {"name": "Gulf of Mexico", "description": "Deep Gulf buoy observations for tropical and southern wave systems."},
}

HIGH_WAVE_THRESHOLD_METERS = 3.0


class ProviderError(Exception):
    """A public upstream source could not return usable data."""


def _fetch_text(url: str, timeout: int = 8) -> str:
    request = Request(url, headers={"User-Agent": NOAA_USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except (HTTPError, URLError, TimeoutError) as exc:
        raise ProviderError(str(exc)) from exc


def _fetch_json(url: str, timeout: int = 8) -> Any:
    return json.loads(_fetch_text(url, timeout))


def parse_ndbc_data(raw_text: str) -> list[dict[str, Any]]:
    """Normalize the NDBC realtime text feed into chronological observations."""
    lines = [line.strip() for line in raw_text.strip().splitlines() if line.strip()]
    if len(lines) < 3:
        raise ProviderError("Insufficient observation data from station")

    header = lines[0].lstrip("#").split()
    indexes = {key: header.index(key) if key in header else -1 for key in ("WVHT", "DPD", "APD", "WSPD", "WTMP")}
    if indexes["WVHT"] == -1:
        raise ProviderError("The station feed does not include significant wave height")

    def number(parts: list[str], index: int) -> float | None:
        if index == -1 or index >= len(parts) or parts[index] == "MM":
            return None
        try:
            return float(parts[index])
        except ValueError:
            return None

    measurements: list[dict[str, Any]] = []
    for line in lines[2:]:
        parts = line.split()
        if len(parts) < 5:
            continue
        wave_height = number(parts, indexes["WVHT"])
        if wave_height is None:
            continue
        year, month, day, hour, minute = parts[:5]
        measurements.append({
            "timestamp": f"{year}-{month.zfill(2)}-{day.zfill(2)}T{hour.zfill(2)}:{minute.zfill(2)}:00Z",
            "value": wave_height,
            "unit": "m",
            "metric": "Significant Wave Height",
            "dominantPeriod": number(parts, indexes["DPD"]),
            "averagePeriod": number(parts, indexes["APD"]),
            "windSpeed": number(parts, indexes["WSPD"]),
            "waterTemp": number(parts, indexes["WTMP"]),
        })

    measurements.sort(key=lambda item: item["timestamp"])
    return measurements


def station_metadata(station_id: str) -> dict[str, Any]:
    return next((station for station in BUOY_STATIONS if station["id"] == station_id), {
        "id": station_id,
        "name": f"Buoy Station {station_id}",
        "location": "NOAA Marine Observation Station",
        "lat": 0,
        "lon": 0,
        "description": "Public observation station operated by NOAA / National Data Buoy Center.",
    })


def station_by_slug(slug: str) -> dict[str, Any] | None:
    """Return only curated, indexable stations. API ids stay intentionally separate."""
    return next((station for station in BUOY_STATIONS if station["slug"] == slug.lower()), None)


def stations_for_region(region: str) -> list[dict[str, Any]]:
    return [station for station in BUOY_STATIONS if station["region"] == region]


def _observation_time(observation: dict[str, Any]) -> datetime:
    return datetime.fromisoformat(observation["timestamp"].replace("Z", "+00:00"))


def _timestamp_time(timestamp: str) -> datetime:
    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))


def detect_high_wave_events(
    measurements: list[dict[str, Any]],
    threshold: float = HIGH_WAVE_THRESHOLD_METERS,
) -> list[dict[str, Any]]:
    """Group observed threshold crossings; no inferred or forecast events are emitted."""
    events: list[dict[str, Any]] = []
    active: list[dict[str, Any]] = []
    for measurement in measurements:
        if measurement.get("value") is not None and measurement["value"] >= threshold:
            active.append(measurement)
            continue
        if active:
            events.append(_event_from_measurements(active, threshold, is_ongoing=False))
            active = []
    if active:
        events.append(_event_from_measurements(active, threshold, is_ongoing=True))
    return events


def _event_from_measurements(observations: list[dict[str, Any]], threshold: float, is_ongoing: bool) -> dict[str, Any]:
    peak = max(observations, key=lambda item: item["value"])
    start = _observation_time(observations[0])
    end = _observation_time(observations[-1])
    return {
        "type": "Threshold crossed" if not is_ongoing else "High-wave event active",
        "threshold": threshold,
        "start": observations[0]["timestamp"],
        "end": observations[-1]["timestamp"],
        "value": peak["value"],
        "peakTimestamp": peak["timestamp"],
        "durationMinutes": max(0, round((end - start).total_seconds() / 60)),
        "isOngoing": is_ongoing,
    }


def station_intelligence(station: dict[str, Any]) -> dict[str, Any]:
    """Build a transparent station page model directly from the NOAA observation series."""
    payload = buoy_payload(station["id"])
    measurements = payload.get("measurements", [])
    if not measurements:
        raise ProviderError("NOAA returned no usable significant wave-height observations")
    now = datetime.now(timezone.utc)
    today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc)
    today = [item for item in measurements if _observation_time(item) >= today_start]
    latest = measurements[-1]
    events = detect_high_wave_events(today)
    recent = list(reversed(events[-6:]))
    highest_today = max(today, key=lambda item: item["value"]) if today else None
    return {
        "station": station,
        "payload": payload,
        "latest": latest,
        "highestToday": highest_today,
        "events": recent,
        "eventsToday": len(events),
        "measurements24h": measurements[-max(1, min(145, len(measurements))):],
        "isStale": payload.get("isDelayed", True),
    }


def buoy_payload(station_id: str) -> dict[str, Any]:
    station_id = station_id.strip().upper()
    cache_key = f"buoy_{station_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    raw_text = _fetch_text(f"https://www.ndbc.noaa.gov/data/realtime2/{station_id}.txt")
    measurements = parse_ndbc_data(raw_text)
    latest = measurements[-1] if measurements else None
    if latest:
        timestamp = datetime.fromisoformat(latest["timestamp"].replace("Z", "+00:00"))
        is_delayed = (datetime.now(timezone.utc) - timestamp).total_seconds() > 3 * 60 * 60
    else:
        is_delayed = True

    payload = {
        "station": station_metadata(station_id),
        "metric": "Significant Wave Height",
        "unit": "m",
        "dataSource": "NOAA National Data Buoy Center",
        "dataSourceUrl": f"https://www.ndbc.noaa.gov/station_page.php?station={station_id}",
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "lastObservation": latest["timestamp"] if latest else None,
        "isDelayed": is_delayed,
        "isLive": not is_delayed,
        "totalObservations": len(measurements),
        "measurements": measurements,
    }
    cache.set(cache_key, payload, CACHE_TTL_SECONDS)
    return payload


def game_buoys_payload() -> dict[str, Any]:
    cached = cache.get("game_buoys_summary")
    if cached:
        return cached

    def summary(station: dict[str, Any]) -> dict[str, Any] | None:
        try:
            payload = buoy_payload(station["id"])
            if not payload["measurements"]:
                return None
            latest = payload["measurements"][-1]
            return {
                **station,
                "waveHeight": latest["value"],
                "unit": latest["unit"],
                "dominantPeriod": latest["dominantPeriod"],
                "windSpeed": latest["windSpeed"],
                "waterTemp": latest["waterTemp"],
                "timestamp": latest["timestamp"],
                "sourceUrl": payload["dataSourceUrl"],
            }
        except ProviderError:
            return None

    # Bounded parallelism keeps the public data providers protected while keeping this endpoint responsive.
    with ThreadPoolExecutor(max_workers=5) as executor:
        active_buoys = [item for item in executor.map(summary, BUOY_STATIONS) if item is not None]

    payload = {
        "total": len(active_buoys),
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "buoys": active_buoys,
    }
    if active_buoys:
        cache.set("game_buoys_summary", payload, GAME_CACHE_TTL_SECONDS)
    return payload


def _daily_round_snapshot(buoy: dict[str, Any]) -> dict[str, Any]:
    """Keep only factual, displayable values from the observed game buoy response."""
    return {
        key: buoy.get(key)
        for key in (
            "id", "slug", "name", "location", "lat", "lon", "region", "description",
            "waveHeight", "unit", "dominantPeriod", "windSpeed", "waterTemp", "timestamp", "sourceUrl",
        )
    }


def daily_challenge_payload(challenge_date: date) -> dict[str, Any]:
    """Create one day-stable set of five NOAA-observed comparison rounds.

    The first successful request for a UTC date records the exact observation
    snapshot. Every visitor afterwards receives those same pairs and values.
    """
    today = datetime.now(timezone.utc).date()
    if challenge_date > today:
        raise ValueError("Daily challenges are available only for today and previous days.")

    stored = DailyChallenge.objects.filter(challenge_date=challenge_date).first()
    if stored:
        return {
            "date": challenge_date.isoformat(),
            "rounds": stored.rounds,
            "createdAt": stored.created_at.isoformat().replace("+00:00", "Z"),
            "source": "NOAA National Data Buoy Center",
            "isRecordedSnapshot": True,
        }

    if challenge_date != today:
        raise ProviderError("This past daily challenge was not recorded while its observations were current.")

    live_buoys = sorted(game_buoys_payload().get("buoys", []), key=lambda buoy: buoy["id"])
    if len(live_buoys) < 2:
        raise ProviderError("Fewer than two NOAA buoys are reporting usable wave observations.")

    # A date-derived ordering makes the pair choices deterministic before the
    # snapshot is persisted. Five rounds may re-use a station when availability is limited.
    randomizer = random.Random(sha256(challenge_date.isoformat().encode()).hexdigest())
    pairs: list[dict[str, Any]] = []
    for round_number in range(1, 6):
        left, right = randomizer.sample(live_buoys, 2)
        pairs.append({
            "round": round_number,
            "left": _daily_round_snapshot(left),
            "right": _daily_round_snapshot(right),
            "answer": "higher" if right["waveHeight"] >= left["waveHeight"] else "lower",
        })

    try:
        stored = DailyChallenge.objects.create(challenge_date=challenge_date, rounds=pairs)
    except IntegrityError:
        stored = DailyChallenge.objects.get(challenge_date=challenge_date)
    return {
        "date": challenge_date.isoformat(),
        "rounds": stored.rounds,
        "createdAt": stored.created_at.isoformat().replace("+00:00", "Z"),
        "source": "NOAA National Data Buoy Center",
        "isRecordedSnapshot": True,
    }


def ocean_overview() -> dict[str, Any]:
    """Aggregate live curated stations and report only calculations with inputs."""
    cache_key = "ocean_overview"
    cached = cache.get(cache_key)
    if cached:
        return cached

    active = game_buoys_payload().get("buoys", [])
    observed = [buoy for buoy in active if isinstance(buoy.get("waveHeight"), (int, float))]
    if not observed:
        return {"status": "unavailable", "message": "No curated NOAA buoy currently returned a usable wave-height observation.", "stations": []}

    by_id = {station["id"]: station for station in BUOY_STATIONS}
    enriched = [{**by_id.get(buoy["id"], {}), **buoy} for buoy in observed]
    above = [buoy for buoy in enriched if buoy["waveHeight"] >= HIGH_WAVE_THRESHOLD_METERS]
    highest = max(enriched, key=lambda buoy: buoy["waveHeight"])
    region_groups: dict[str, list[dict[str, Any]]] = {}
    for buoy in enriched:
        region_groups.setdefault(buoy.get("region", "other"), []).append(buoy)
    most_active_region, most_active_buoys = max(
        region_groups.items(), key=lambda item: sum(buoy["waveHeight"] >= HIGH_WAVE_THRESHOLD_METERS for buoy in item[1])
    )

    pacific = [buoy for buoy in enriched if buoy.get("region") in {"california", "hawaii", "pacific-northwest"}]
    atlantic = [buoy for buoy in enriched if buoy.get("region") in {"new-england", "atlantic", "gulf-of-mexico"}]
    def mean_height(items: list[dict[str, Any]]) -> float | None:
        return round(sum(item["waveHeight"] for item in items) / len(items), 2) if items else None

    # A rapid rise is calculated only when the underlying station history has a
    # comparable observation roughly an hour earlier.
    rising: list[dict[str, Any]] = []
    new_events = 0
    latest_crossing: dict[str, Any] | None = None
    for buoy in enriched:
        try:
            intelligence = station_intelligence(by_id[buoy["id"]])
        except ProviderError:
            continue
        series = intelligence["payload"]["measurements"]
        latest = series[-1]
        target = _observation_time(latest) - timedelta(minutes=75)
        prior = min(series, key=lambda item: abs((_observation_time(item) - target).total_seconds()))
        delta = latest["value"] - prior["value"]
        if abs((_observation_time(prior) - target).total_seconds()) <= 30 * 60:
            rising.append({"station": buoy, "change": round(delta, 2), "fromTimestamp": prior["timestamp"]})
        for event in intelligence["events"]:
            start = _timestamp_time(event["start"])
            if start >= datetime.now(timezone.utc) - timedelta(hours=1):
                new_events += 1
                if latest_crossing is None or event["start"] > latest_crossing["event"]["start"]:
                    latest_crossing = {"station": buoy, "event": event}

    result = {
        "status": "live",
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "workingStationCount": len(enriched),
        "unavailableStationCount": len(BUOY_STATIONS) - len(enriched),
        "aboveThresholdCount": len(above),
        "threshold": HIGH_WAVE_THRESHOLD_METERS,
        "highest": highest,
        "fastestRising": max(rising, key=lambda item: item["change"]) if rising else None,
        "latestCrossing": latest_crossing,
        "mostActiveRegion": {"id": most_active_region, "name": REGIONS.get(most_active_region, {}).get("name", most_active_region.replace("-", " ").title()), "count": sum(buoy["waveHeight"] >= HIGH_WAVE_THRESHOLD_METERS for buoy in most_active_buoys)},
        "newEventsPastHour": new_events,
        "pacificAverage": mean_height(pacific),
        "atlanticAverage": mean_height(atlantic),
        "stations": enriched,
    }
    cache.set(cache_key, result, GAME_CACHE_TTL_SECONDS)
    return result


def earthquakes_payload() -> dict[str, Any]:
    cached = cache.get("earthquakes_summary")
    if cached:
        return cached

    data = _fetch_json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson")
    measurements = []
    for feature in data.get("features", []):
        properties = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        coordinates = geometry.get("coordinates", [None, None])
        epoch_ms = properties.get("time")
        if epoch_ms is None or properties.get("mag") is None:
            continue
        measurements.append({
            "timestamp": datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
            "value": properties["mag"],
            "unit": "M",
            "metric": "Earthquake Magnitude",
            "place": properties.get("place"),
            "coordinates": [coordinates[1], coordinates[0]],
            "url": properties.get("url"),
        })
    measurements.sort(key=lambda item: item["timestamp"])
    payload = {
        "dataSource": "USGS Earthquake Hazards Program",
        "dataSourceUrl": "https://earthquake.usgs.gov",
        "metric": "Earthquake Magnitude",
        "unit": "M",
        "measurements": measurements,
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    cache.set("earthquakes_summary", payload, CACHE_TTL_SECONDS)
    return payload


def weather_payload() -> dict[str, Any]:
    """Return a server-side NWS forecast snapshot for the configured coordinates."""
    cached = cache.get("weather_summary")
    if cached:
        return cached

    latitude = os.environ.get("VAWE_WEATHER_LAT", "37.7749")
    longitude = os.environ.get("VAWE_WEATHER_LON", "-122.4194")
    point = _fetch_json(f"https://api.weather.gov/points/{latitude},{longitude}")
    point_properties = point.get("properties", {})
    forecast_url = point_properties.get("forecastHourly")
    if not forecast_url:
        raise ProviderError("NWS did not provide a forecast endpoint for the configured coordinates")
    forecast = _fetch_json(forecast_url)
    periods = forecast.get("properties", {}).get("periods", [])
    measurements = [{
        "timestamp": period.get("startTime"),
        "value": period.get("temperature"),
        "unit": period.get("temperatureUnit", "F"),
        "metric": "Air temperature",
        "summary": period.get("shortForecast"),
        "windSpeed": period.get("windSpeed"),
        "precipitationProbability": period.get("probabilityOfPrecipitation", {}).get("value"),
    } for period in periods if period.get("startTime") and period.get("temperature") is not None]
    location = point_properties.get("relativeLocation", {}).get("properties", {})
    payload = {
        "dataSource": "U.S. National Weather Service",
        "dataSourceUrl": "https://api.weather.gov",
        "metric": "Air temperature",
        "unit": measurements[0]["unit"] if measurements else "F",
        "location": location.get("city", "Configured weather location"),
        "coordinates": {"lat": float(latitude), "lon": float(longitude)},
        "measurements": measurements,
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    cache.set("weather_summary", payload, CACHE_TTL_SECONDS)
    return payload


def space_payload() -> dict[str, Any]:
    """Normalize the latest GOES X-ray flare observation from NOAA SWPC."""
    cached = cache.get("space_summary")
    if cached:
        return cached

    readings = _fetch_json("https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json")
    if not isinstance(readings, list) or not readings:
        raise ProviderError("NOAA SWPC did not return a current GOES X-ray flare reading")
    latest = readings[0]
    measurement = {
        "timestamp": latest.get("time_tag"),
        "value": latest.get("current_int_xrlong"),
        "unit": "W/m²",
        "metric": "GOES X-ray flux",
        "classification": latest.get("current_class"),
        "satellite": latest.get("satellite"),
        "latestFlareClass": latest.get("max_class"),
        "latestFlareTime": latest.get("max_time"),
    }
    payload = {
        "dataSource": "NOAA Space Weather Prediction Center",
        "dataSourceUrl": "https://services.swpc.noaa.gov",
        "metric": "GOES X-ray flux",
        "unit": "W/m²",
        "measurements": [measurement],
        "fetchedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    cache.set("space_summary", payload, CACHE_TTL_SECONDS)
    return payload


def category_catalog() -> list[dict[str, Any]]:
    """Expose backend ownership and configuration state for every frontend tab."""
    catalog = []
    for slug, config in CATEGORY_CATALOG.items():
        record = {"id": slug, **config}
        if config["status"] == "configuration_required":
            record["isConfigured"] = all(os.environ.get(name) for name in config["requiredEnv"])
        else:
            record["isConfigured"] = True
        catalog.append(record)
    return catalog


def category_snapshot(category: str) -> dict[str, Any]:
    """Use one Django contract for every tab without fabricating unavailable provider data."""
    slug = category.strip().lower()
    if slug not in CATEGORY_CATALOG:
        raise KeyError(slug)

    config = CATEGORY_CATALOG[slug]
    base = {"id": slug, **config, "isConfigured": True}
    if config["status"] == "configuration_required":
        configured = all(os.environ.get(name) for name in config["requiredEnv"])
        return {**base, "isConfigured": configured}

    if slug == "ocean":
        data = buoy_payload(os.environ.get("VAWE_DEFAULT_BUOY", "46026"))
    elif slug == "earth":
        data = earthquakes_payload()
    elif slug == "weather":
        data = weather_payload()
    elif slug == "space":
        data = space_payload()
    else:
        raise KeyError(slug)

    measurements = data.get("measurements", [])
    # NWS periods run forward in time, while the other feeds are chronological histories.
    latest = measurements[0] if slug == "weather" and measurements else measurements[-1] if measurements else None
    return {
        **base,
        "updatedAt": data.get("fetchedAt"),
        "metric": data.get("metric"),
        "unit": data.get("unit"),
        "observationCount": len(measurements),
        "latestMeasurement": latest,
        "location": data.get("location"),
    }
