"""Where the data comes from.

Two interchangeable data sources with the same methods:
  * LocalRepository    reads app/data/cars.csv, bikes.csv and catalogue.json. No database needed.
  * SupabaseRepository reads the same tables from Supabase over its REST API.

The catalogue (vehicles, parts, rules, rates) is small and rarely changes, so it is loaded once and
kept in memory for CATALOGUE_TTL seconds. That makes every estimate fast and keeps database usage low.
"""
from __future__ import annotations

import csv
import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
CATALOGUE_TTL = 600  # seconds
INT_COLS = {"id", "year_from", "year_to"}
FLOAT_COLS = {"stock_hp", "stock_torque_nm", "parts_multiplier"}


def load_vehicles(data_dir: Path = DATA_DIR) -> list[dict]:
    """Read cars.csv and bikes.csv. Empty cells become None; numbers become int/float."""
    vehicles = []
    for name in ("cars.csv", "bikes.csv"):
        with open(data_dir / name, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                v: dict = {}
                for k, val in row.items():
                    val = val.strip()
                    if val == "":
                        v[k] = None
                    elif k in INT_COLS:
                        v[k] = int(val)
                    elif k in FLOAT_COLS:
                        v[k] = float(val)
                    else:
                        v[k] = val
                v["image_url"] = v.get("image_url")
                vehicles.append(v)
    return vehicles


def load_catalogue(data_dir: Path = DATA_DIR) -> dict:
    return json.loads((data_dir / "catalogue.json").read_text(encoding="utf-8"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


LOCAL_DB = Path(os.getenv("LOCAL_DB", Path(__file__).resolve().parent.parent / ".local_db.json"))


class LocalRepository:
    """Catalogue from the data files. Accounts and garages are kept in a small JSON file
    (backend/.local_db.json, ignored by git) so they survive restarts during development."""

    def __init__(self, data_dir: Path = DATA_DIR, db_file: Path = LOCAL_DB):
        cat = load_catalogue(data_dir)
        self.vehicles = load_vehicles(data_dir)
        self.stage_rules = cat["stage_rules"]
        self.parts = cat["parts"]
        self.labour_rates = cat["labour_rates"]
        self._estimates: dict[str, dict] = {}
        self._db_file = Path(db_file)
        self._lock = threading.Lock()
        self._db = json.loads(self._db_file.read_text()) if self._db_file.exists() else {"users": [], "garage": []}

    def _save(self) -> None:
        tmp = self._db_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._db, indent=1))
        tmp.replace(self._db_file)                       # write-then-rename: never leaves a half-written file

    # accounts
    def create_user(self, email: str, password_hash: str) -> dict:
        with self._lock:
            if any(u["email"] == email for u in self._db["users"]):
                raise ValueError("exists")
            user = {"id": str(uuid.uuid4()), "email": email, "password_hash": password_hash, "created_at": _now()}
            self._db["users"].append(user)
            self._save()
            return user

    def get_user_by_email(self, email: str) -> dict | None:
        return next((u for u in self._db["users"] if u["email"] == email), None)

    def get_user(self, user_id: str) -> dict | None:
        return next((u for u in self._db["users"] if u["id"] == user_id), None)

    # garage
    def list_garage(self, user_id: str) -> list[dict]:
        return sorted((g for g in self._db["garage"] if g["user_id"] == user_id), key=lambda g: g["created_at"], reverse=True)

    def add_garage(self, user_id: str, item: dict) -> dict:
        with self._lock:
            row = {"id": str(uuid.uuid4()), "user_id": user_id, **item, "created_at": _now()}
            self._db["garage"].append(row)
            self._save()
            return row

    def delete_garage(self, user_id: str, item_id: str) -> bool:
        with self._lock:
            before = len(self._db["garage"])
            self._db["garage"] = [g for g in self._db["garage"] if not (g["id"] == item_id and g["user_id"] == user_id)]
            self._save()
            return len(self._db["garage"]) < before

    def catalogue(self) -> "LocalRepository":
        return self

    def save_estimate(self, code: str, vehicle_id: int, city: str, result: dict) -> None:
        self._estimates[code] = {"code": code, "vehicle_id": vehicle_id, "city": city, "result": result}

    def get_estimate(self, code: str) -> dict | None:
        return self._estimates.get(code)


class SupabaseRepository:
    """Talks to Supabase's REST API (PostgREST). The service key stays on the server only."""

    def __init__(self, url: str, key: str):
        import httpx  # imported here so local mode doesn't need it

        headers = {"apikey": key}
        if key.startswith("eyJ"):                       # legacy service_role key is a JWT: also send it as a Bearer token
            headers["Authorization"] = f"Bearer {key}"   # new "sb_secret_..." keys go in the apikey header only
        self._http = httpx.Client(base_url=url.rstrip("/") + "/rest/v1", headers=headers, timeout=10)
        self._loaded_at = 0.0
        self.vehicles = self.stage_rules = self.parts = self.labour_rates = []

    def _get(self, table: str, params: dict | None = None) -> list[dict]:
        r = self._http.get(f"/{table}", params={"select": "*", **(params or {})})
        r.raise_for_status()
        return r.json()

    def catalogue(self) -> "SupabaseRepository":
        if time.time() - self._loaded_at > CATALOGUE_TTL:
            self.vehicles = self._get("vehicles", {"order": "make,model,year_from"})
            self.stage_rules = self._get("stage_rules")
            self.parts = self._get("parts", {"order": "stage,id"})
            self.labour_rates = self._get("labour_rates", {"order": "city"})
            for v in self.vehicles:                       # Postgres numeric arrives as a string
                for k in ("parts_multiplier", "stock_hp", "stock_torque_nm"):
                    if v.get(k) is not None:
                        v[k] = float(v[k])
            for r in self.stage_rules:
                r["labour_rate_factor"] = float(r.get("labour_rate_factor") or 1)
            self._loaded_at = time.time()
        return self

    def save_estimate(self, code: str, vehicle_id: int, city: str, result: dict) -> None:
        r = self._http.post("/estimates", json={"code": code, "vehicle_id": vehicle_id, "city": city, "result": result},
                            headers={"Prefer": "return=minimal"})
        r.raise_for_status()

    def get_estimate(self, code: str) -> dict | None:
        rows = self._get("estimates", {"code": f"eq.{code}"})
        return rows[0] if rows else None

    # accounts
    def create_user(self, email: str, password_hash: str) -> dict:
        r = self._http.post("/app_users", json={"email": email, "password_hash": password_hash},
                            headers={"Prefer": "return=representation"})
        if r.status_code == 409:
            raise ValueError("exists")
        r.raise_for_status()
        return r.json()[0]

    def get_user_by_email(self, email: str) -> dict | None:
        rows = self._get("app_users", {"email": f"eq.{email}"})
        return rows[0] if rows else None

    def get_user(self, user_id: str) -> dict | None:
        rows = self._get("app_users", {"id": f"eq.{user_id}"})
        return rows[0] if rows else None

    # garage
    def list_garage(self, user_id: str) -> list[dict]:
        return self._get("garage_items", {"user_id": f"eq.{user_id}", "order": "created_at.desc"})

    def add_garage(self, user_id: str, item: dict) -> dict:
        r = self._http.post("/garage_items", json={"user_id": user_id, **item}, headers={"Prefer": "return=representation"})
        r.raise_for_status()
        return r.json()[0]

    def delete_garage(self, user_id: str, item_id: str) -> bool:
        r = self._http.delete("/garage_items", params={"id": f"eq.{item_id}", "user_id": f"eq.{user_id}"},
                              headers={"Prefer": "return=representation"})
        r.raise_for_status()
        return bool(r.json())
