"""FastAPI app: the HTTP layer. It only validates input, fetches data and calls the pricing engine.

Run locally (from the backend folder):
    pip install -r requirements.txt
    uvicorn app.main:app --reload
Then open http://localhost:8000/docs for interactive API docs.
"""
from __future__ import annotations

import os
import secrets
import string
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import auth
from .budget import plan
from .pricing import estimate
from .repository import LocalRepository, SupabaseRepository


def make_repository():
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    if url and key:
        return SupabaseRepository(url, key)
    return LocalRepository()        # no database configured: use the bundled sample data


repo = make_repository()
app = FastAPI(title="Automotive Tuning Cost Estimator", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


class EstimateRequest(BaseModel):
    vehicle_id: int = Field(gt=0)
    city: str = Field(min_length=1, max_length=60)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class GarageItemIn(BaseModel):
    vehicle_id: int = Field(gt=0)
    city: str = Field(min_length=1, max_length=60)
    nickname: str | None = Field(default=None, max_length=60)
    target_stage: int | None = Field(default=None, ge=1, le=3)
    notes: str | None = Field(default=None, max_length=500)


class BudgetRequest(EstimateRequest):
    budget: int = Field(gt=0, le=100_000_000)
    basis: Literal["typical", "worst"] = "typical"


VehicleClass = Literal["car", "bike"]


def _vehicles_for(vehicle_class: str, make: str | None = None, model: str | None = None, year: int | None = None) -> list[dict]:
    out = [v for v in repo.catalogue().vehicles if v.get("vehicle_class", "car") == vehicle_class]
    if make:
        out = [v for v in out if v["make"].lower() == make.lower()]
    if model:
        out = [v for v in out if v["model"].lower() == model.lower()]
    if year:
        out = [v for v in out if v["year_from"] <= year and (v["year_to"] is None or year <= v["year_to"])]
    return out


@app.get("/health")
def health():
    vs = repo.catalogue().vehicles
    return {"ok": True, "data_source": type(repo).__name__,
            "cars": sum(v.get("vehicle_class") == "car" for v in vs), "bikes": sum(v.get("vehicle_class") == "bike" for v in vs)}


@app.get("/api/makes")
def makes(vehicle_class: VehicleClass = "car") -> list[str]:
    return sorted({v["make"] for v in _vehicles_for(vehicle_class)})


@app.get("/api/models")
def models(make: str = Query(..., min_length=1), vehicle_class: VehicleClass = "car") -> list[str]:
    found = sorted({v["model"] for v in _vehicles_for(vehicle_class, make)})
    if not found:
        raise HTTPException(404, f"No models found for make '{make}'")
    return found


@app.get("/api/years")
def years(make: str, model: str, vehicle_class: VehicleClass = "car") -> list[int]:
    from datetime import date

    this_year = date.today().year
    ys: set[int] = set()
    for v in _vehicles_for(vehicle_class, make, model):
        ys.update(range(v["year_from"], (v["year_to"] or this_year) + 1))
    if not ys:
        raise HTTPException(404, "No years found for this model")
    return sorted(ys, reverse=True)


@app.get("/api/engines")
def engines(make: str, model: str, year: int, vehicle_class: VehicleClass = "car") -> list[dict]:
    found = _vehicles_for(vehicle_class, make, model, year)
    if not found:
        raise HTTPException(404, "No engines found for this car and year")
    return [{"vehicle_id": v["id"], "engine_name": v["engine_name"], "engine_type": v["engine_type"],
             "stock_hp": v["stock_hp"], "stock_torque_nm": v["stock_torque_nm"],
             "body_type": v.get("body_type"), "image_url": v.get("image_url")} for v in found]


# Short names people actually type
MAKE_ALIASES = {"Royal Enfield": "re", "Volkswagen": "vw", "Mercedes-Benz": "merc benz mercedes", "Maruti Suzuki": "msil",
                "Harley-Davidson": "hd harley", "BMW Motorrad": "bmw bike", "Land Rover": "lr", "Hyundai": "hyundai",
                "Mahindra": "m&m", "Ola Electric": "ola"}


@app.get("/api/search")
def search(q: str = Query(..., min_length=1, max_length=60), vehicle_class: VehicleClass | None = None,
           limit: int = Query(8, ge=1, le=25)) -> list[dict]:
    """Type-ahead search: every word must appear in "make model engine". Ranked so that
    matches at the start of the model name come first ("cla" → Classic 350 before Pulsar)."""
    words = q.lower().replace("-", " ").split()
    scored = []
    for v in repo.catalogue().vehicles:
        if vehicle_class and v.get("vehicle_class") != vehicle_class:
            continue
        model, make = v["model"].lower(), v["make"].lower()
        text = f"{make} {MAKE_ALIASES.get(v['make'], '')} {model} {model.replace('-', ' ')} {v['engine_name'].lower()}"
        if not all(w in text for w in words):
            continue
        score = (0 if model.startswith(words[0]) else 1 if make.startswith(words[0]) else 2, len(text))
        scored.append((score, v))
    scored.sort(key=lambda t: t[0])
    return [{"vehicle_id": v["id"], "vehicle_class": v.get("vehicle_class"), "make": v["make"], "model": v["model"],
             "engine_name": v["engine_name"], "engine_type": v["engine_type"], "year_from": v["year_from"],
             "year_to": v["year_to"], "stock_hp": v["stock_hp"], "body_type": v.get("body_type")} for _, v in scored[:limit]]


@app.get("/api/cities")
def cities() -> list[str]:
    return [r["city"] for r in repo.catalogue().labour_rates]


def _vehicle_and_rate(req: EstimateRequest):
    cat = repo.catalogue()
    vehicle = next((v for v in cat.vehicles if v["id"] == req.vehicle_id), None)
    if vehicle is None:
        raise HTTPException(404, "Vehicle not found")
    rate = next((r for r in cat.labour_rates if r["city"].lower() == req.city.lower()), None)
    if rate is None:
        raise HTTPException(404, f"No labour rate for city '{req.city}'")
    return cat, vehicle, rate


@app.post("/api/budget")
def budget_plan(req: BudgetRequest) -> dict:
    """Best set of upgrades for a budget (see app/budget.py)."""
    cat, vehicle, rate = _vehicle_and_rate(req)
    return plan(vehicle, rate, cat.stage_rules, cat.parts, req.budget, req.basis)


@app.post("/api/estimate")
def create_estimate(req: EstimateRequest) -> dict:
    cat, vehicle, rate = _vehicle_and_rate(req)
    result = estimate(vehicle, rate["city"], rate, cat.stage_rules, cat.parts).to_dict()
    code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    try:
        repo.save_estimate(code, vehicle["id"], rate["city"], result)
        result["share_code"] = code
    except Exception:          # sharing is a bonus: still return the estimate if saving fails
        result["share_code"] = None
    return result


@app.get("/api/estimate/{code}")
def get_estimate(code: str) -> dict:
    row = repo.get_estimate(code.upper())
    if row is None:
        raise HTTPException(404, "Quote not found")
    return {**row["result"], "share_code": row["code"]}


# ---------------------------------------------------------------- accounts + My Garage
limiter = auth.LoginLimiter()
MAX_GARAGE = 50


def current_user(authorization: str | None = Header(default=None)) -> dict:
    """Reads 'Authorization: Bearer <token>' and returns the logged-in user, or answers 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in.")
    user_id = auth.read_token(authorization.removeprefix("Bearer ").strip())
    user = repo.get_user(user_id) if user_id else None
    if user is None:
        raise HTTPException(401, "Your session has expired. Please log in again.")
    return user


def _public(user: dict) -> dict:
    return {"id": user["id"], "email": user["email"]}      # never send the password hash back


@app.post("/api/auth/signup", status_code=201)
def signup(body: Credentials) -> dict:
    email = body.email.strip().lower()
    problem = auth.validate_new_account(email, body.password)
    if problem:
        raise HTTPException(422, problem)
    try:
        user = repo.create_user(email, auth.hash_password(body.password))
    except ValueError:
        raise HTTPException(409, "An account with this email already exists. Try logging in.")
    return {"token": auth.create_token(user["id"]), "user": _public(user)}


@app.post("/api/auth/login")
def login(body: Credentials) -> dict:
    email = body.email.strip().lower()
    if limiter.blocked(email):
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = repo.get_user_by_email(email)
    if user is None or not auth.verify_password(body.password, user["password_hash"]):
        limiter.failed(email)
        raise HTTPException(401, "Wrong email or password.")      # same message either way: don't reveal which emails exist
    limiter.succeeded(email)
    return {"token": auth.create_token(user["id"]), "user": _public(user)}


@app.get("/api/me")
def me(user: dict = Depends(current_user)) -> dict:
    return _public(user)


def _garage_view(item: dict) -> dict:
    """Adds the vehicle details and today's estimate for the target stage to a saved item."""
    cat = repo.catalogue()
    vehicle = next((v for v in cat.vehicles if v["id"] == item["vehicle_id"]), None)
    out = {k: item.get(k) for k in ("id", "vehicle_id", "city", "nickname", "target_stage", "notes", "created_at")}
    out["vehicle"] = vehicle and {k: vehicle.get(k) for k in ("id", "vehicle_class", "make", "model", "engine_name", "engine_type",
                                                             "year_from", "year_to", "stock_hp", "stock_torque_nm", "body_type", "image_url")}
    rate = next((r for r in cat.labour_rates if r["city"] == item["city"]), None)
    out["target"] = None
    if vehicle and rate and item.get("target_stage"):
        est = estimate(vehicle, rate["city"], rate, cat.stage_rules, cat.parts)
        stage = next((s for s in est.stages if s.stage == item["target_stage"]), None)
        if stage:
            out["target"] = {"name": stage.name, "total": {"min": stage.total.min, "max": stage.total.max},
                             "hp": stage.hp and {"min": stage.hp.min, "max": stage.hp.max}}
    return out


@app.get("/api/garage")
def list_garage(user: dict = Depends(current_user)) -> list[dict]:
    return [_garage_view(g) for g in repo.list_garage(user["id"])]


@app.post("/api/garage", status_code=201)
def add_to_garage(body: GarageItemIn, user: dict = Depends(current_user)) -> dict:
    cat = repo.catalogue()
    if not any(v["id"] == body.vehicle_id for v in cat.vehicles):
        raise HTTPException(404, "Vehicle not found")
    city = next((r["city"] for r in cat.labour_rates if r["city"].lower() == body.city.lower()), None)
    if city is None:
        raise HTTPException(404, f"No labour rate for city '{body.city}'")
    if len(repo.list_garage(user["id"])) >= MAX_GARAGE:
        raise HTTPException(400, f"Your garage is full ({MAX_GARAGE} vehicles). Remove one first.")
    item = repo.add_garage(user["id"], {"vehicle_id": body.vehicle_id, "city": city, "nickname": (body.nickname or "").strip() or None,
                                        "target_stage": body.target_stage, "notes": (body.notes or "").strip() or None})
    return _garage_view(item)


@app.delete("/api/garage/{item_id}", status_code=204)
def remove_from_garage(item_id: str, user: dict = Depends(current_user)) -> Response:
    if not repo.delete_garage(user["id"], item_id):     # only deletes rows that belong to this user
        raise HTTPException(404, "Not found in your garage")
    return Response(status_code=204)
