# VAWE — Live Ocean Events

Vawe is a server-rendered live ocean-event platform. Django owns the NOAA/USGS fetching, caching, event calculations, public route registry, daily-game snapshots, and persistent leaderboard records. Vite builds the React enhancement layer for the interactive dashboard and daily Swell Duel.

Public routes are real HTTP routes: the homepage, waves, four regional pages, ten curated buoy pages, learning pages, game pages, `robots.txt`, and `sitemap.xml` return meaningful HTML before JavaScript runs. Invalid routes and non-curated buoy slugs return 404.

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

## Docker

The included `Dockerfile` builds the Vite client, collects Django static assets, and starts Gunicorn:

```bash
docker build -t vawe .
docker run --rm -p 8000:8000 \
  -e DJANGO_SECRET_KEY='replace-me' \
  -e DJANGO_ALLOWED_HOSTS='localhost,127.0.0.1' \
  vawe
```

For a durable deployment, mount or replace the SQLite database before treating the leaderboard as production-grade.
