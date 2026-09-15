"""Provider-neutral geographic observations and cross-domain event correlation.

The detector works with a deliberately small, already-normalized event set. It
first narrows candidates with a latitude/longitude bounding box and time window,
then uses Haversine distance for the final match. It never performs a global
Cartesian comparison of raw provider feeds.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
from math import asin, cos, radians, sin, sqrt
from typing import Any, Iterable


DOMAIN_ORDER = ("EARTH", "OCEAN", "WEATHER", "AIR", "SHIPS")


@dataclass(frozen=True)
class GeoObservation:
    id: str
    domain: str
    timestamp: str
    latitude: float
    longitude: float
    source: str
    retrieved_at: str
    metric: str | None = None
    value: float | None = None
    unit: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def public_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class DomainEvent:
    id: str
    domain: str
    title: str
    summary: str
    status: str
    timestamp: str
    latitude: float
    longitude: float
    location: str
    source: str
    source_url: str
    retrieved_at: str
    severity: float
    observation: GeoObservation
    metadata: dict[str, Any] = field(default_factory=dict)

    def public_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["observation"] = self.observation.public_dict()
        return data


@dataclass(frozen=True)
class CrossEvent:
    id: str
    status: str
    title: str
    summary: str
    timestamp: str
    latitude: float
    longitude: float
    location: str
    domains: list[str]
    significance: int
    radius_km: int
    time_window_minutes: int
    events: list[DomainEvent]
    nearby_observations: dict[str, int]
    sources: list[dict[str, str]]
    correlation_note: str

    def public_dict(self, *, include_observations: bool = False) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "status": self.status,
            "title": self.title,
            "summary": self.summary,
            "timestamp": self.timestamp,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "location": self.location,
            "domains": self.domains,
            "significance": self.significance,
            "radiusKm": self.radius_km,
            "timeWindowMinutes": self.time_window_minutes,
            "nearbyObservations": self.nearby_observations,
            "sources": self.sources,
            "correlationNote": self.correlation_note,
        }
        if include_observations:
            data["events"] = [event.public_dict() for event in self.events]
        return data


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def haversine_km(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    """Return great-circle distance in kilometres between two WGS84 points."""
    earth_radius_km = 6371.0088
    lat_delta = radians(latitude_b - latitude_a)
    lon_delta = radians(longitude_b - longitude_a)
    a = sin(lat_delta / 2) ** 2 + cos(radians(latitude_a)) * cos(radians(latitude_b)) * sin(lon_delta / 2) ** 2
    return earth_radius_km * 2 * asin(sqrt(a))


class CrossEventDetector:
    """Correlate detected domain events and nearby real observations by time/location.

    Significance is a transparent display-order score, never a risk prediction:
    source-event severity (0-55), recency (0-25), each extra correlated domain
    (0-15), and verified nearby observations (0-5), capped at 100.
    """

    def __init__(self, *, radius_km: int = 250, time_window_minutes: int = 60) -> None:
        self.radius_km = radius_km
        self.time_window_minutes = time_window_minutes

    def _matches(self, primary: DomainEvent, candidate: DomainEvent | GeoObservation) -> bool:
        latitude_delta = self.radius_km / 111.0
        longitude_delta = self.radius_km / max(12.0, 111.0 * cos(radians(primary.latitude)))
        if abs(primary.latitude - candidate.latitude) > latitude_delta or abs(primary.longitude - candidate.longitude) > longitude_delta:
            return False
        seconds = abs((parse_time(primary.timestamp) - parse_time(candidate.timestamp)).total_seconds())
        if seconds > self.time_window_minutes * 60:
            return False
        return haversine_km(primary.latitude, primary.longitude, candidate.latitude, candidate.longitude) <= self.radius_km

    def _score(self, events: list[DomainEvent], nearby_observations: dict[str, int]) -> int:
        now = datetime.now(timezone.utc)
        source_severity = min(55.0, max(event.severity for event in events))
        newest = max(parse_time(event.timestamp) for event in events)
        age_minutes = max(0.0, (now - newest).total_seconds() / 60)
        recency = max(0.0, 25.0 * (1 - min(age_minutes, 360.0) / 360.0))
        domain_bonus = min(15.0, 5.0 * max(0, len({event.domain for event in events}) - 1))
        observation_bonus = min(5.0, float(sum(min(count, 10) for count in nearby_observations.values())) / 2)
        return round(min(100.0, source_severity + recency + domain_bonus + observation_bonus))

    def _component_events(self, events: list[DomainEvent]) -> list[list[DomainEvent]]:
        remaining = {event.id: event for event in events}
        components: list[list[DomainEvent]] = []
        while remaining:
            seed_id, seed = next(iter(remaining.items()))
            del remaining[seed_id]
            component = [seed]
            pending = [seed]
            while pending:
                primary = pending.pop()
                matches = [candidate for candidate in remaining.values() if candidate.domain != primary.domain and self._matches(primary, candidate)]
                for candidate in matches:
                    remaining.pop(candidate.id, None)
                    component.append(candidate)
                    pending.append(candidate)
            components.append(component)
        return components

    def _nearby_counts(self, events: Iterable[DomainEvent], observations: Iterable[GeoObservation]) -> dict[str, int]:
        counts: dict[str, set[str]] = {}
        event_domains = {event.domain for event in events}
        for event in events:
            for observation in observations:
                if observation.domain in event_domains or not self._matches(event, observation):
                    continue
                counts.setdefault(observation.domain, set()).add(observation.id)
        return {domain: len(ids) for domain, ids in counts.items()}

    def detect(self, events: list[DomainEvent], observations: list[GeoObservation] | None = None) -> list[CrossEvent]:
        observations = observations or []
        cross_events: list[CrossEvent] = []
        for component in self._component_events(events):
            primary = max(component, key=lambda event: (event.severity, event.timestamp))
            nearby_counts = self._nearby_counts(component, observations)
            domains = sorted({event.domain for event in component} | set(nearby_counts), key=lambda domain: DOMAIN_ORDER.index(domain) if domain in DOMAIN_ORDER else len(DOMAIN_ORDER))
            event_ids = ":".join(sorted(event.id for event in component))
            event_id = f"event-{sha256(event_ids.encode()).hexdigest()[:16]}"
            all_live = any(event.status == "LIVE" for event in component)
            sources = []
            seen_sources: set[str] = set()
            for event in component:
                if event.source not in seen_sources:
                    sources.append({"name": event.source, "url": event.source_url})
                    seen_sources.add(event.source)
            if len(domains) > 1:
                title = primary.title
                summary = f"{primary.summary} · {len(domains)} live signal domains connected by time and location."
            else:
                title, summary = primary.title, primary.summary
            cross_events.append(CrossEvent(
                id=event_id,
                status="LIVE" if all_live else "RECENT",
                title=title,
                summary=summary,
                timestamp=primary.timestamp,
                latitude=primary.latitude,
                longitude=primary.longitude,
                location=primary.location,
                domains=domains,
                significance=self._score(component, nearby_counts),
                radius_km=self.radius_km,
                time_window_minutes=self.time_window_minutes,
                events=component,
                nearby_observations=nearby_counts,
                sources=sources,
                correlation_note=f"These observations occurred within {self.radius_km} km and within a {self.time_window_minutes}-minute time window.",
            ))
        return sorted(cross_events, key=lambda event: (event.status == "LIVE", event.significance, event.timestamp), reverse=True)
