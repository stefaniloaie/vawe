"""Optional, provider-neutral AIR and SHIPS observation adapters.

These adapters are intentionally bounded enrichment inputs for NOW. They do not
power aircraft/vessel trackers. Each requires an explicitly configured regional
provider endpoint; an absent configuration reports unavailable coverage instead
of returning synthetic observations.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import base64
import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .cross_events import GeoObservation


@dataclass(frozen=True)
class ProviderSnapshot:
    domain: str
    status: str
    source: str
    source_url: str | None
    retrieved_at: str
    observations: list[GeoObservation]
    message: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _fetch_json(url: str, headers: dict[str, str]) -> Any:
    request = Request(url, headers={"User-Agent": "SignalAtlas/1.0 (Event Correlation)", **headers})
    try:
        with urlopen(request, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise RuntimeError(str(exc)) from exc


def _iso_timestamp(value: Any) -> str:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, str) and value:
        return value.replace("+00:00", "Z")
    return _now()


def _state_value(row: list[Any], index: int) -> Any:
    return row[index] if len(row) > index else None


class AircraftSource:
    """Normalize a bounded OpenSky-compatible response into GeoObservations."""

    def fetch(self) -> ProviderSnapshot:
        endpoint = os.environ.get("OPENSKY_STATES_URL", "").strip()
        client_id = os.environ.get("OPENSKY_CLIENT_ID", "").strip()
        client_secret = os.environ.get("OPENSKY_CLIENT_SECRET", "").strip()
        if not endpoint or not client_id or not client_secret:
            return ProviderSnapshot("AIR", "unavailable", "OpenSky Network", "https://opensky-network.org/data/api", _now(), [], "AIR data temporarily unavailable: a bounded OpenSky endpoint and credentials are not configured.")

        token = os.environ.get("OPENSKY_ACCESS_TOKEN", "").strip()
        headers: dict[str, str] = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        else:
            basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
            headers["Authorization"] = f"Basic {basic}"
        try:
            payload = _fetch_json(endpoint, headers)
        except RuntimeError as exc:
            return ProviderSnapshot("AIR", "unavailable", "OpenSky Network", endpoint, _now(), [], f"AIR data temporarily unavailable: {exc}")

        rows = payload.get("states", payload.get("aircraft", [])) if isinstance(payload, dict) else payload
        observations: list[GeoObservation] = []
        for row in (rows or [])[:2000]:
            if isinstance(row, list):
                identifier, callsign = _state_value(row, 0), _state_value(row, 1)
                timestamp = _state_value(row, 4) or _state_value(row, 3)
                longitude, latitude = _state_value(row, 5), _state_value(row, 6)
                altitude = _state_value(row, 13) or _state_value(row, 7)
                speed, heading, vertical_rate, squawk = _state_value(row, 9), _state_value(row, 10), _state_value(row, 11), _state_value(row, 14)
            elif isinstance(row, dict):
                identifier = row.get("icao24") or row.get("id")
                callsign = row.get("callsign")
                timestamp = row.get("last_contact") or row.get("timestamp")
                latitude, longitude = row.get("latitude"), row.get("longitude")
                altitude, speed, heading = row.get("geo_altitude") or row.get("altitude"), row.get("velocity") or row.get("speed"), row.get("true_track") or row.get("heading")
                vertical_rate, squawk = row.get("vertical_rate"), row.get("squawk")
            else:
                continue
            if not identifier or latitude is None or longitude is None:
                continue
            observations.append(GeoObservation(
                id=f"air-{identifier}", domain="AIR", timestamp=_iso_timestamp(timestamp), latitude=float(latitude), longitude=float(longitude),
                source="OpenSky Network", retrieved_at=_now(), metric="Aircraft observation", metadata={"callsign": str(callsign or "").strip(), "altitude": altitude, "speed": speed, "heading": heading, "verticalRate": vertical_rate, "squawk": squawk},
            ))
        return ProviderSnapshot("AIR", "live", "OpenSky Network", endpoint, _now(), observations)


class VesselSource:
    """Normalize a configured AIS provider response into GeoObservations."""

    def fetch(self) -> ProviderSnapshot:
        endpoint = os.environ.get("AIS_PROVIDER_URL", "").strip()
        api_key = os.environ.get("AIS_API_KEY", "").strip()
        if not endpoint or not api_key:
            return ProviderSnapshot("SHIPS", "unavailable", "Configured AIS provider", None, _now(), [], "SHIPS data temporarily unavailable: a licensed, bounded AIS provider is not configured.")
        try:
            payload = _fetch_json(endpoint, {"Accept": "application/json", "Authorization": f"Bearer {api_key}"})
        except RuntimeError as exc:
            return ProviderSnapshot("SHIPS", "unavailable", "Configured AIS provider", endpoint, _now(), [], f"SHIPS data temporarily unavailable: {exc}")

        rows = payload.get("vessels", payload.get("data", [])) if isinstance(payload, dict) else payload
        observations: list[GeoObservation] = []
        for row in (rows or [])[:2000]:
            if not isinstance(row, dict):
                continue
            mmsi = row.get("mmsi") or row.get("MMSI") or row.get("id")
            latitude = row.get("latitude", row.get("lat"))
            longitude = row.get("longitude", row.get("lon"))
            if not mmsi or latitude is None or longitude is None:
                continue
            observations.append(GeoObservation(
                id=f"ship-{mmsi}", domain="SHIPS", timestamp=_iso_timestamp(row.get("timestamp") or row.get("lastUpdate")), latitude=float(latitude), longitude=float(longitude),
                source="Configured AIS provider", retrieved_at=_now(), metric="Vessel observation", metadata={"mmsi": str(mmsi), "name": row.get("name"), "speed": row.get("speed") or row.get("sog"), "course": row.get("course") or row.get("cog"), "vesselType": row.get("vesselType") or row.get("type")},
            ))
        return ProviderSnapshot("SHIPS", "live", "Configured AIS provider", endpoint, _now(), observations)
