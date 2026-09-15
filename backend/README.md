# Signal Atlas — Live Data Observatory

Signal Atlas is a server-rendered public-data observatory for ocean, weather, earthquake, and space signals. Django owns the provider fetching, caching, event calculations, public route registry, daily-game snapshots, and persistent leaderboard records. Vite builds the React enhancement layer for the interactive dashboard and daily Swell Duel.

Public routes are real HTTP routes: the homepage, NOW, waves, regional pages, curated buoy pages, learning pages, game pages, `robots.txt`, and `sitemap.xml` return meaningful HTML before JavaScript runs. Invalid routes and non-curated buoy slugs return 404.

## NOW: cross-domain discovery

`/now` is the cross-domain discovery view. It displays only source-backed domain events and keeps unavailable or forecast-only providers visible as coverage states rather than turning them into zero activity or invented events.

The pipeline is:

```text
NOAA NDBC / USGS / NWS / optional OpenSky / optional AIS
  → provider normalization (GeoObservation)
  → domain-event detection (DomainEvent)
  → CrossEventDetector
  → short cache
  → /api/events/*
  → NOW UI and /events/<eventId>
```

`CrossEventDetector` first narrows candidates through a time-aware geographic bounding box, then applies a Haversine great-circle distance check. The current MVP uses a 250 km radius and a ±60-minute window. The score is only a transparent display-order score: source-event severity (up to 55), recency (up to 25), extra verified domains (up to 15), and nearby real observations (up to 5), capped at 100. It is not a safety, impact, or causation prediction.

NOW endpoints:

- `GET /api/events/live?domain=ocean&status=live&multi=true`
- `GET /api/events/recent`
- `GET /api/events/<eventId>`
- `GET /api/events/activity`

The live event feed currently derives events from live NOAA high-wave observations and significant recent USGS earthquakes. NWS is included as a forecast-only coverage source, not a detected event source. AIR and SHIPS are optional nearby-observation enrichers; without their regional provider configuration they explicitly return `unavailable` and are not represented by fabricated counts.

## Category gateway

Every product tab resolves through Django at `GET /api/categories/<category>`. Live sources today are Ocean (NOAA NDBC), Earth (USGS), Weather (NWS), and Space (NOAA SWPC). Air, Ships, and Traffic return an explicit setup state until the appropriate server-side provider credentials and coverage area are configured; the client never calls those providers directly.

## Local development

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python backend/manage.py migrate
npm run dev:all
```

Open `http://localhost:3000`. The frontend runs on port 3000 and Django runs on port 8000.

## Production

```bash
npm run build
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py collectstatic --noinput
PORT=8000 npm start
```

Set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=false`, `DJANGO_ALLOWED_HOSTS`, and `VAWE_SITE_URL` before deploying. Replace SQLite and the local cache with managed Postgres and Redis as traffic grows so daily snapshots and leaderboards persist across replicas.

For real AIR correlation, configure a bounded OpenSky-compatible endpoint and credentials. For SHIPS, configure a licensed AIS endpoint limited to the geographic coverage you are entitled to query. Do not supply global tracking feeds to NOW; its purpose is local event enrichment, not aircraft or vessel surveillance.

## Docker

The included `Dockerfile` builds the Vite client, collects Django static assets, and starts Gunicorn:

```bash
docker build -t signal-atlas .
docker run --rm -p 8000:8000 \
  -e DJANGO_SECRET_KEY='replace-me' \
  -e DJANGO_ALLOWED_HOSTS='localhost,127.0.0.1' \
  signal-atlas
```

For a durable deployment, mount or replace the SQLite database before treating the leaderboard as production-grade.
