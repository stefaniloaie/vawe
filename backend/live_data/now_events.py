"""Build the trustworthy, bounded NOW feed from live provider snapshots."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from django.core.cache import cache

from .cross_events import CrossEvent, CrossEventDetector, DomainEvent, GeoObservation, parse_time
from .provider_sources import AircraftSource, ProviderSnapshot, VesselSource
from .services import HIGH_WAVE_THRESHOLD_METERS, ProviderError, earthquakes_payload, ocean_overview, weather_payload


NOW_CACHE_SECONDS = 45
EARTHQUAKE_MIN_MAGNITUDE = 4.5
CORRELATION_RADIUS_KM = 250
CORRELATION_TIME_WINDOW_MINUTES = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_now() -> str:
    return _now().isoformat().replace("+00:00", "Z")


def _event_status(timestamp: str, *, live_minutes: int, recent_hours: int = 24) -> str | None:
    try:
        age = _now() - parse_time(timestamp)
    except (TypeError, ValueError):
        return None
    if age < timedelta(minutes=-5):
        return None
    if age <= timedelta(minutes=live_minutes):
        return "LIVE"
    if age <= timedelta(hours=recent_hours):
        return "RECENT"
    return None


def _provider_record(domain: str, status: str, source: str, *, source_url: str | None = None, retrieved_at: str | None = None, message: str | None = None, event_count: int | None = None) -> dict[str, Any]:
    return {
        "domain": domain,
        "status": status,
        "source": source,
        "sourceUrl": source_url,
        "retrievedAt": retrieved_at,
        "message": message,
        "eventCount": event_count,
    }


def _ocean_domain_events(overview: dict[str, Any]) -> list[DomainEvent]:
    if overview.get("status") != "live":
        return []
    events: list[DomainEvent] = []
    for buoy in overview.get("stations", []):
        height = buoy.get("waveHeight")
        timestamp = buoy.get("timestamp")
        if not isinstance(height, (int, float)) or not timestamp or height < HIGH_WAVE_THRESHOLD_METERS:
            continue
        status = _event_status(timestamp, live_minutes=180)
        if not status:
            continue
        observation = GeoObservation(
            id=f"ocean-observation-{buoy['id']}-{timestamp}", domain="OCEAN", timestamp=timestamp,
            latitude=float(buoy["lat"]), longitude=float(buoy["lon"]), source="NOAA National Data Buoy Center",
            retrieved_at=overview.get("fetchedAt", _iso_now()), metric="Significant wave height", value=float(height), unit="m",
            metadata={"stationId": buoy["id"], "stationName": buoy["name"], "sourceUrl": buoy.get("sourceUrl")},
        )
        events.append(DomainEvent(
            id=f"ocean-{buoy['id']}", domain="OCEAN", title="High waves", summary=f"{height:.1f} m significant waves observed at {buoy['name']}.",
            status=status, timestamp=timestamp, latitude=float(buoy["lat"]), longitude=float(buoy["lon"]), location=buoy["location"],
            source="NOAA National Data Buoy Center", source_url=buoy.get("sourceUrl") or "https://www.ndbc.noaa.gov", retrieved_at=overview.get("fetchedAt", _iso_now()),
            severity=min(55.0, 15.0 + float(height) * 10.0), observation=observation,
            metadata={"waveHeight": height, "stationId": buoy["id"], "stationSlug": buoy.get("slug")},
        ))
    return events


def _earth_domain_events(payload: dict[str, Any]) -> list[DomainEvent]:
    events: list[DomainEvent] = []
    for measurement in payload.get("measurements", []):
        magnitude = measurement.get("value")
        coordinates = measurement.get("coordinates") or []
        timestamp = measurement.get("timestamp")
        if not isinstance(magnitude, (int, float)) or magnitude < EARTHQUAKE_MIN_MAGNITUDE or len(coordinates) < 2 or not timestamp:
            continue
        status = _event_status(timestamp, live_minutes=60)
        if not status:
            continue
        latitude, longitude = coordinates[0], coordinates[1]
        if latitude is None or longitude is None:
            continue
        external_id = measurement.get("id") or f"{latitude}-{longitude}-{timestamp}"
        observation = GeoObservation(
            id=f"earth-observation-{external_id}", domain="EARTH", timestamp=timestamp, latitude=float(latitude), longitude=float(longitude),
            source="USGS Earthquake Hazards Program", retrieved_at=payload.get("fetchedAt", _iso_now()), metric="Earthquake magnitude", value=float(magnitude), unit="M",
            metadata={"place": measurement.get("place"), "sourceUrl": measurement.get("url")},
        )
        events.append(DomainEvent(
            id=f"earth-{external_id}", domain="EARTH", title=f"M{magnitude:.1f} earthquake", summary=f"M{magnitude:.1f} earthquake recorded by USGS.",
            status=status, timestamp=timestamp, latitude=float(latitude), longitude=float(longitude), location=measurement.get("place") or "Reported USGS location",
            source="USGS Earthquake Hazards Program", source_url=measurement.get("url") or "https://earthquake.usgs.gov", retrieved_at=payload.get("fetchedAt", _iso_now()),
            severity=min(55.0, 8.0 + float(magnitude) * 9.0), observation=observation,
            metadata={"magnitude": magnitude, "sourceUrl": measurement.get("url")},
        ))
    return events


def _source_fetches() -> dict[str, Any]:
    def safe(fetch: Callable[[], Any]) -> tuple[Any | None, str | None]:
        try:
            return fetch(), None
        except ProviderError as exc:
            return None, str(exc)

    with ThreadPoolExecutor(max_workers=5) as executor:
        tasks = {
            "ocean": executor.submit(safe, ocean_overview),
            "earth": executor.submit(safe, earthquakes_payload),
            "weather": executor.submit(safe, weather_payload),
            "air": executor.submit(AircraftSource().fetch),
            "ships": executor.submit(VesselSource().fetch),
        }
        return {name: task.result() for name, task in tasks.items()}


def live_events_payload() -> dict[str, Any]:
    cached = cache.get("now_live_events_v1")
    if cached:
        return cached

    snapshots = _source_fetches()
    overview, ocean_error = snapshots["ocean"]
    earthquakes, earth_error = snapshots["earth"]
    weather, weather_error = snapshots["weather"]
    air: ProviderSnapshot = snapshots["air"]
    ships: ProviderSnapshot = snapshots["ships"]

    domain_events = _ocean_domain_events(overview) if overview else []
    domain_events.extend(_earth_domain_events(earthquakes) if earthquakes else [])
    nearby_observations = [*air.observations, *ships.observations]
    detector = CrossEventDetector(radius_km=CORRELATION_RADIUS_KM, time_window_minutes=CORRELATION_TIME_WINDOW_MINUTES)
    events = detector.detect(domain_events, nearby_observations)

    provider_records = [
        _provider_record("OCEAN", "live" if overview and overview.get("status") == "live" else "unavailable", "NOAA National Data Buoy Center", source_url="https://www.ndbc.noaa.gov", retrieved_at=overview.get("fetchedAt") if overview else None, message=ocean_error or (overview or {}).get("message"), event_count=len([event for event in domain_events if event.domain == "OCEAN"])),
        _provider_record("EARTH", "live" if earthquakes else "unavailable", "USGS Earthquake Hazards Program", source_url="https://earthquake.usgs.gov", retrieved_at=earthquakes.get("fetchedAt") if earthquakes else None, message=earth_error, event_count=len([event for event in domain_events if event.domain == "EARTH"])),
        _provider_record("WEATHER", "forecast_only" if weather else "unavailable", "U.S. National Weather Service", source_url="https://api.weather.gov", retrieved_at=weather.get("fetchedAt") if weather else None, message=weather_error or "Forecast data is available but is not represented as a detected event in NOW.", event_count=None),
        _provider_record("AIR", air.status, air.source, source_url=air.source_url, retrieved_at=air.retrieved_at, message=air.message, event_count=None if air.status != "live" else 0),
        _provider_record("SHIPS", ships.status, ships.source, source_url=ships.source_url, retrieved_at=ships.retrieved_at, message=ships.message, event_count=None if ships.status != "live" else 0),
    ]
    counts = {
        domain: sum(1 for event in domain_events if event.domain == domain and event.status == "LIVE")
        if next((provider["status"] for provider in provider_records if provider["domain"] == domain), "unavailable") == "live"
        else None
        for domain in ("EARTH", "OCEAN", "WEATHER", "AIR", "SHIPS")
    }
    activity: list[dict[str, Any]] = []
    for event in events[:8]:
        activity.append({"id": f"event-{event.id}", "timestamp": event.timestamp, "kind": "event", "message": f"{event.title} detected near {event.location}", "eventId": event.id, "source": event.sources[0]["name"] if event.sources else None})
    for provider in provider_records:
        if provider["retrievedAt"] and provider["status"] != "unavailable":
            activity.append({"id": f"source-{provider['domain']}-{provider['retrievedAt']}", "timestamp": provider["retrievedAt"], "kind": "source", "message": f"{provider['domain']} source snapshot updated", "source": provider["source"]})
    activity.sort(key=lambda item: item["timestamp"], reverse=True)
    payload = {
        "updatedAt": _iso_now(),
        "events": [event.public_dict() for event in events],
        "eventDetails": {event.id: event.public_dict(include_observations=True) for event in events},
        "providers": provider_records,
        "counts": counts,
        "activeEventCount": len([event for event in events if event.status == "LIVE"]),
        "activity": activity[:12],
        "isQuiet": not events,
        "correlation": {"radiusKm": CORRELATION_RADIUS_KM, "timeWindowMinutes": CORRELATION_TIME_WINDOW_MINUTES, "method": "Bounding-box candidate filter followed by Haversine distance and timestamp matching."},
    }
    cache.set("now_live_events_v1", payload, NOW_CACHE_SECONDS)
    return payload


def filter_events(payload: dict[str, Any], *, domain: str | None = None, status: str | None = None, multi: bool = False) -> dict[str, Any]:
    normalized_domain = (domain or "ALL").upper()
    normalized_status = (status or "ALL").upper()
    events = [event for event in payload["events"] if (normalized_domain == "ALL" or normalized_domain in event["domains"]) and (normalized_status == "ALL" or event["status"] == normalized_status) and (not multi or len(event["domains"]) > 1)]
    public_payload = {key: value for key, value in payload.items() if key != "eventDetails"}
    return {**public_payload, "events": events, "filters": {"domain": normalized_domain, "status": normalized_status, "multi": multi}}


def event_detail(event_id: str) -> dict[str, Any] | None:
    payload = live_events_payload()
    event = payload.get("eventDetails", {}).get(event_id)
    if not event:
        return None
    return {"event": event, "updatedAt": payload["updatedAt"], "providers": payload["providers"], "correlation": payload["correlation"]}
