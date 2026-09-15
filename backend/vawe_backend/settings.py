"""Django settings for the VAWE live-data API."""
from __future__ import annotations

import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "unsafe-development-key-change-before-deploying")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = [host.strip() for host in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if host.strip()]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "live_data",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
]

ROOT_URLCONF = "vawe_backend.urls"
WSGI_APPLICATION = "vawe_backend.wsgi.application"
ASGI_APPLICATION = "vawe_backend.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "live_data" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# The cache boundary sits in Django, so clients never call NOAA or USGS directly.
# Use RedisCache in production by setting DJANGO_CACHE_BACKEND and DJANGO_CACHE_LOCATION.
CACHES = {
    "default": {
        "BACKEND": os.environ.get("DJANGO_CACHE_BACKEND", "django.core.cache.backends.locmem.LocMemCache"),
        "LOCATION": os.environ.get("DJANGO_CACHE_LOCATION", "vawe-live-data"),
        "TIMEOUT": 60,
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/assets/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [PROJECT_ROOT / "dist" / "assets"]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
