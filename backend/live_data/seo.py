"""Small server-side SEO primitives shared by every public Signal Atlas route."""
from __future__ import annotations

import json
import os
from typing import Any

from django.http import HttpRequest


def public_url(request: HttpRequest, path: str) -> str:
    configured_base = os.environ.get("VAWE_SITE_URL", "").strip().rstrip("/")
    if configured_base:
        return f"{configured_base}{path}"
    return request.build_absolute_uri(path)


def page_meta(request: HttpRequest, *, path: str, title: str, description: str, schemas: list[dict[str, Any]]) -> dict[str, Any]:
    canonical = public_url(request, path)
    image = public_url(request, "/images/vawe-social-card.svg")
    return {
        "title": title,
        "description": description,
        "canonical": canonical,
        "social_image": image,
        "social_image_alt": "Signal Atlas live ocean, weather, earthquake and space data explorer",
        "robots": "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
        "json_ld": json.dumps(schemas, separators=(",", ":")),
    }


def breadcrumb_schema(request: HttpRequest, items: list[tuple[str, str]]) -> dict[str, Any]:
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": position,
                "name": name,
                "item": public_url(request, path),
            }
            for position, (name, path) in enumerate(items, start=1)
        ],
    }
