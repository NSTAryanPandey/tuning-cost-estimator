"""Tests for the Wikimedia photo lookup (with a fake network, so they run offline)."""
from app import photos


def fake(search_pages, file_pages):
    calls = []

    def fetch(params):
        calls.append(params)
        if params.get("generator") == "search":
            assert params["pilicense"] == "free"          # only freely licensed images
            return {"query": {"pages": search_pages}}
        return {"query": {"pages": file_pages}}
    return fetch, calls


GOOD_FILE = {"-1": {"imageinfo": [{
    "thumburl": "https://upload.wikimedia.org/x/640px-Bike.jpg",
    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Bike.jpg",
    "extmetadata": {"Artist": {"value": '<a href="//x">Jane &amp; Co</a>'},
                    "LicenseShortName": {"value": "CC BY-SA 4.0"},
                    "LicenseUrl": {"value": "https://creativecommons.org/licenses/by-sa/4.0"}}}]}}


def setup_function():
    photos._cache.clear()


def test_finds_photo_with_credit():
    fetch, calls = fake({"1": {"title": "Royal Enfield Classic", "pageimage": "Bike.jpg"}}, GOOD_FILE)
    p = photos.find_photo("Royal Enfield", "Classic 350", fetch)
    assert p["url"].endswith("640px-Bike.jpg")
    assert p["artist"] == "Jane & Co"                    # HTML removed
    assert p["license"] == "CC BY-SA 4.0" and p["article"] == "Royal Enfield Classic"
    assert calls[0]["gsrsearch"] == "Royal Enfield Classic 350"


def test_result_is_cached():
    fetch, calls = fake({"1": {"title": "T", "pageimage": "Bike.jpg"}}, GOOD_FILE)
    photos.find_photo("Tata", "Nexon", fetch)
    photos.find_photo("Tata", "Nexon", fetch)
    assert len(calls) == 2                               # 2 requests for the first lookup, none for the second


def test_no_free_image_gives_none_and_is_cached():
    fetch, calls = fake({"1": {"title": "Splendor (motorcycle)"}}, {})
    assert photos.find_photo("Hero", "Splendor Plus", fetch) is None
    assert photos.find_photo("Hero", "Splendor Plus", fetch) is None
    assert len(calls) == 1


def test_network_error_is_not_cached():
    def broken(params):
        raise OSError("offline")
    assert photos.find_photo("Kia", "Seltos", broken) is None
    fetch, calls = fake({"1": {"title": "Kia Seltos", "pageimage": "Bike.jpg"}}, GOOD_FILE)
    assert photos.find_photo("Kia", "Seltos", fetch) is not None
