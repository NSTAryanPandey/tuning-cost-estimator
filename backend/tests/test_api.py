"""API tests using FastAPI's test client and the bundled sample data (no database needed)."""
import os

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
import tempfile

os.environ.pop("SUPABASE_URL", None)            # always test against the local sample data
os.environ["LOCAL_DB"] = os.path.join(tempfile.mkdtemp(), "test_db.json")   # never touch your real local accounts

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def vid(model, engine_type=None):
    from app.repository import load_vehicles
    return next(v["id"] for v in load_vehicles() if v["model"] == model and (engine_type is None or v["engine_type"] == engine_type))


def test_health():
    body = client.get("/health").json()
    assert body["data_source"] == "LocalRepository" and body["cars"] > 100 and body["bikes"] > 100


def test_dropdown_chain():
    assert "Hyundai" in client.get("/api/makes").json()
    assert "Verna" in client.get("/api/models", params={"make": "Hyundai"}).json()
    assert 2024 in client.get("/api/years", params={"make": "Hyundai", "model": "Verna"}).json()
    engines = client.get("/api/engines", params={"make": "Hyundai", "model": "Verna", "year": 2024}).json()
    assert {e["engine_type"] for e in engines} == {"petrol_turbo", "petrol_na"}   # Verna has two engines
    assert engines[0]["body_type"] == "sedan"


def test_unknown_make_is_404():
    assert client.get("/api/models", params={"make": "Ferrari"}).status_code == 404


def test_estimate_and_share():
    r = client.post("/api/estimate", json={"vehicle_id": vid("Verna", "petrol_turbo"), "city": "bangalore"})
    assert r.status_code == 200
    body = r.json()
    assert [s["stage"] for s in body["stages"]] == [1, 2, 3]
    assert body["city"] == "Bangalore"
    shared = client.get(f"/api/estimate/{body['share_code']}").json()
    assert shared["stages"][0]["total"] == body["stages"][0]["total"]


def test_estimate_validation():
    assert client.post("/api/estimate", json={"vehicle_id": 0, "city": "Bangalore"}).status_code == 422
    assert client.post("/api/estimate", json={"vehicle_id": 1, "city": "Atlantis"}).status_code == 404
    assert client.post("/api/estimate", json={"vehicle_id": 99999, "city": "Bangalore"}).status_code == 404


def test_ev_returns_reason_not_stages():
    body = client.post("/api/estimate", json={"vehicle_id": vid("Nexon EV"), "city": "Pune"}).json()
    assert body["tunable"] is False and body["stages"] == []


def test_bikes_are_separate_from_cars():
    car_makes = client.get("/api/makes").json()
    bike_makes = client.get("/api/makes", params={"vehicle_class": "bike"}).json()
    assert "Royal Enfield" in bike_makes and "Royal Enfield" not in car_makes
    assert "Activa 6G" in client.get("/api/models", params={"make": "Honda", "vehicle_class": "bike"}).json()
    assert "Activa 6G" not in client.get("/api/models", params={"make": "Honda"}).json()


def test_bike_estimate():
    body = client.post("/api/estimate", json={"vehicle_id": vid("Classic 350"), "city": "Bangalore"}).json()
    assert body["vehicle"]["vehicle_class"] == "bike"
    assert body["stages"][0]["items"][0]["label"] == "Fuel controller / ECU flash"


def test_search_ranks_model_matches_first():
    hits = client.get("/api/search", params={"q": "classic"}).json()
    assert hits[0]["model"].startswith("Classic")
    assert all("classic" in f"{h['make']} {h['model']}".lower() for h in hits)


def test_search_multiple_words_and_class_filter():
    hits = client.get("/api/search", params={"q": "creta diesel"}).json()
    assert hits and all(h["model"] == "Creta" and h["engine_type"] == "diesel_turbo" for h in hits)
    assert client.get("/api/search", params={"q": "activa", "vehicle_class": "car"}).json() == []


def test_budget_endpoint():
    body = client.post("/api/budget", json={"vehicle_id": vid("Verna", "petrol_turbo"), "city": "Bangalore", "budget": 100000}).json()
    assert body["affordable"] and body["items"][0]["kind"] == "software"
    assert client.post("/api/budget", json={"vehicle_id": 1, "city": "Bangalore", "budget": 0}).status_code == 422


def test_search_understands_short_names():
    assert client.get("/api/search", params={"q": "re hunter"}).json()[0]["model"] == "Hunter 350"
    assert any(h["make"] == "Volkswagen" for h in client.get("/api/search", params={"q": "vw"}).json())


def test_signup_login_and_garage():
    creds = {"email": "Driver@Example.com", "password": "supersecret1"}
    r = client.post("/api/auth/signup", json=creds)
    assert r.status_code == 201 and r.json()["user"]["email"] == "driver@example.com"
    assert "password_hash" not in r.json()["user"]
    assert client.post("/api/auth/signup", json=creds).status_code == 409
    assert client.post("/api/auth/login", json={**creds, "password": "wrong-pass"}).status_code == 401

    token = client.post("/api/auth/login", json=creds).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/me", headers=h).json()["email"] == "driver@example.com"
    assert client.get("/api/garage").status_code == 401

    item = client.post("/api/garage", headers=h, json={"vehicle_id": vid("Verna", "petrol_turbo"), "city": "pune", "target_stage": 2, "nickname": "My Verna"}).json()
    assert item["city"] == "Pune" and item["target"]["name"].startswith("Stage 2") and item["vehicle"]["model"] == "Verna"
    assert [g["nickname"] for g in client.get("/api/garage", headers=h).json()] == ["My Verna"]
    assert client.delete(f"/api/garage/{item['id']}", headers=h).status_code == 204
    assert client.get("/api/garage", headers=h).json() == []


def test_bad_token_rejected():
    assert client.get("/api/me", headers={"Authorization": "Bearer forged.token"}).status_code == 401
