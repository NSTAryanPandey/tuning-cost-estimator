"""Real vehicle photos from Wikimedia Commons (the free photo library behind Wikipedia).

Only freely licensed photos are used (Creative Commons or public domain): the Wikipedia search asks for
`pilicense=free`. Every photo is returned with its credit (photographer, licence, link to the original),
and the app shows that credit under the photo, as the licences require.

How it works, for "Royal Enfield" + "Classic 350":
  1. Search English Wikipedia for "Royal Enfield Classic 350" and take the best article's main image
     (only if that image is free).
  2. Ask for that file's details: a 640 px wide version, the author and the licence.
The photo shows the MODEL (often a different year or market version), and the caption says which
article it came from. Results, including "no photo found", are cached so each model is looked up once.
"""
from __future__ import annotations

import html
import re
import time
from typing import Callable

API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "TuningCostEstimator/1.0 (https://github.com/NSTAryanPandey/tuning-cost-estimator)"   # Wikimedia asks for one
CACHE_TTL = 7 * 24 * 3600

FetchJson = Callable[[dict], dict]
_cache: dict[str, tuple[float, dict | None]] = {}


def _http_fetch(params: dict) -> dict:
    import httpx  # imported here so tests and local mode don't need network access

    r = httpx.get(API, params={"format": "json", **params}, headers={"User-Agent": USER_AGENT}, timeout=8)
    r.raise_for_status()
    return r.json()


def _clean(text: str | None) -> str | None:
    """Commons gives the author as HTML ("<a href=...>Name</a>"): keep only the plain text."""
    if not text:
        return None
    plain = html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
    return re.sub(r"\s+", " ", plain)[:120] or None


def find_photo(make: str, model: str, fetch: FetchJson = _http_fetch) -> dict | None:
    key = f"{make}|{model}".lower()
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    try:
        photo = _lookup(f"{make} {model}", fetch)
    except Exception:
        return None                      # network trouble: don't cache, try again next time
    _cache[key] = (time.time(), photo)
    return photo


def _lookup(query: str, fetch: FetchJson) -> dict | None:
    found = fetch({"action": "query", "generator": "search", "gsrsearch": query, "gsrlimit": 1,
                   "prop": "pageimages", "piprop": "name", "pilicense": "free"})
    pages = list((found.get("query") or {}).get("pages", {}).values())
    if not pages or not pages[0].get("pageimage"):
        return None
    article, file_name = pages[0]["title"], pages[0]["pageimage"]

    info = fetch({"action": "query", "titles": f"File:{file_name}", "prop": "imageinfo",
                  "iiprop": "url|extmetadata", "iiurlwidth": 640,
                  "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl"})
    file_pages = list((info.get("query") or {}).get("pages", {}).values())
    if not file_pages or not file_pages[0].get("imageinfo"):
        return None
    ii = file_pages[0]["imageinfo"][0]
    meta = ii.get("extmetadata") or {}
    value = lambda k: (meta.get(k) or {}).get("value")
    url = ii.get("thumburl") or ii.get("url")
    if not url:
        return None
    return {
        "url": url,
        "page_url": ii.get("descriptionurl"),
        "article": article,
        "artist": _clean(value("Artist")),
        "license": _clean(value("LicenseShortName")),
        "license_url": value("LicenseUrl"),
        "source": "Wikimedia Commons",
    }
