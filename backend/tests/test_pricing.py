"""Tests for the pricing engine. Run from the backend folder:  pytest -q"""
import json

import pytest

from app.pricing import GST_RATE, ROUND_TO, Range, estimate
from app.repository import load_catalogue, load_vehicles

CAT = load_catalogue()
VEHICLES = load_vehicles()
RULES, PARTS, RATES = CAT["stage_rules"], CAT["parts"], CAT["labour_rates"]
RATE = {"rate_min": 1000, "rate_max": 1000}           # fixed ₹1,000/h makes the maths easy to check


def vehicle(**over):
    v = {"id": 99, "make": "Test", "model": "Car", "engine_name": "1.5T", "engine_type": "petrol_turbo",
         "year_from": 2022, "year_to": None, "stock_hp": 100, "stock_torque_nm": 200, "parts_multiplier": 1.0}
    v.update(over)
    return v


def names(stage):
    return [i.label for i in stage.items]


# ---------- Range helper

def test_range_add_scale_times():
    assert Range(1, 2) + Range(10, 20) == Range(11, 22)
    assert Range(10, 20).scale(1.5) == Range(15, 30)
    assert Range(2, 5).times(Range(1000, 1800)) == Range(2000, 9000)


def test_range_rounding_never_shrinks():
    r = Range(10_250, 10_251).rounded()
    assert r == Range(10_000, 10_500)
    assert r.min <= 10_250 and r.max >= 10_251


def test_range_rejects_min_above_max():
    with pytest.raises(ValueError):
        Range(5, 1)


# ---------- Stage maths

def test_stage1_is_ecu_fee_plus_two_hours_labour_plus_gst():
    s1 = estimate(vehicle(), "X", RATE, RULES, PARTS).stages[0]
    assert names(s1) == ["ECU remap licence", "Workshop labour (2 h)"]
    rule = next(r for r in RULES if r["engine_type"] == "petrol_turbo" and r["stage"] == 1)
    expected_min = (rule["ecu_fee_min"] + 2 * 1000) * (1 + GST_RATE)
    expected_max = (rule["ecu_fee_max"] + 2 * 1000) * (1 + GST_RATE)
    assert s1.total.min <= expected_min < s1.total.min + ROUND_TO
    assert s1.total.max - ROUND_TO < expected_max <= s1.total.max
    assert s1.labour_hours == Range(2, 2)


def test_stages_are_cumulative():
    s1, s2, s3 = estimate(vehicle(), "X", RATE, RULES, PARTS).stages
    assert set(names(s1)) <= set(names(s2)) <= set(names(s3))
    assert s1.total.min < s2.total.min < s3.total.min
    assert s2.labour_hours == Range(6, 7)            # 2 h + 4–5 h
    assert s3.labour_hours == Range(14, 19)          # + 8–12 h


def test_turbo_stage2_has_intake_and_downpipe():
    s2 = estimate(vehicle(), "X", RATE, RULES, PARTS).stages[1]
    assert "High-flow air intake" in names(s2) and "Performance downpipe" in names(s2)
    assert "Exhaust header (extractor)" not in names(s2)


def test_stage3_has_turbo_internals_and_dyno():
    s3 = estimate(vehicle(), "X", RATE, RULES, PARTS).stages[2]
    for part in ("Upgraded turbocharger", "Forged internals (pistons + rods)", "Custom dyno tuning session"):
        assert part in names(s3)


def test_non_turbo_engine_gets_matching_parts_only():
    s1, s2, s3 = estimate(vehicle(engine_type="petrol_na"), "X", RATE, RULES, PARTS).stages
    assert "Performance downpipe" not in names(s2)
    assert "Exhaust header (extractor)" in names(s2)
    assert "Upgraded turbocharger" not in names(s3)
    assert "Turbo conversion kit" in names(s3)


def test_contingency_only_on_stage3():
    s1, s2, s3 = estimate(vehicle(), "X", RATE, RULES, PARTS).stages
    assert s1.contingency == s2.contingency == Range(0, 0)
    assert s3.contingency.min > 0


def test_premium_multiplier_scales_parts_not_labour_or_software():
    base = estimate(vehicle(), "X", RATE, RULES, PARTS).stages[1]
    premium = estimate(vehicle(parts_multiplier=2.0), "X", RATE, RULES, PARTS).stages[1]
    cost = lambda s, label: next(i.cost for i in s.items if i.label == label)
    assert cost(premium, "Performance downpipe") == cost(base, "Performance downpipe").scale(2)
    assert cost(premium, "ECU remap licence") == cost(base, "ECU remap licence")
    labour = [i.label for i in base.items if i.kind == "labour"]
    for label in labour:
        assert cost(premium, label) == cost(base, label)


def test_city_rate_changes_only_labour():
    cheap = estimate(vehicle(), "A", {"rate_min": 500, "rate_max": 500}, RULES, PARTS).stages[0]
    dear = estimate(vehicle(), "B", {"rate_min": 2000, "rate_max": 2000}, RULES, PARTS).stages[0]
    assert dear.total.min > cheap.total.min
    assert cheap.items[0].cost == dear.items[0].cost   # ECU fee unchanged


def test_power_gain_from_stock_figures():
    s1 = estimate(vehicle(stock_hp=100), "X", RATE, RULES, PARTS).stages[0]
    assert s1.hp == Range(115, 125)                 # +15–25% for petrol turbo stage 1


def test_missing_stock_power_gives_no_gain():
    s1 = estimate(vehicle(stock_hp=None, stock_torque_nm=None), "X", RATE, RULES, PARTS).stages[0]
    assert s1.hp is None and s1.torque_nm is None


def test_bike_gets_bike_parts_and_cheaper_labour():
    bike = vehicle(vehicle_class="bike", engine_type="bike_petrol", stock_hp=20, stock_torque_nm=27, body_type="naked")
    s1, s2, s3 = estimate(bike, "X", RATE, RULES, PARTS).stages
    assert s1.name == "Stage 1 · Fuel + intake"
    assert names(s1) == ["Fuel controller / ECU flash", "Performance air filter", "Workshop labour (1–1.5 h)"]
    assert "Full exhaust system" in names(s2) and "Performance downpipe" not in names(s2)
    assert {"Big-bore kit", "Performance camshaft", "Dyno tuning session (bike)"} <= set(names(s3))
    labour = next(i.cost for i in s1.items if i.kind == "labour")
    assert labour == Range(500, 750)                  # 1–1.5 h × ₹1,000/h × 0.5 bike factor


def test_small_bike_power_keeps_one_decimal():
    bike = vehicle(engine_type="bike_petrol", stock_hp=8.0, stock_torque_nm=8.1)
    assert estimate(bike, "X", RATE, RULES, PARTS).stages[0].hp == Range(8.4, 8.6)


def test_car_stage1_never_includes_bike_parts():
    s1 = estimate(vehicle(), "X", RATE, RULES, PARTS).stages[0]
    assert "Performance air filter" not in names(s1)


def test_electric_car_is_not_tunable():
    e = estimate(vehicle(engine_type="ev"), "X", RATE, RULES, PARTS)
    assert e.tunable is False and e.stages == [] and "Electric" in e.reason


def test_every_range_is_valid_for_every_seed_vehicle():
    for v in VEHICLES:
        for city in RATES[:2]:
            e = estimate(v, city["city"], city, RULES, PARTS)
            for s in e.stages:
                for r in (s.subtotal, s.gst, s.total, s.labour_hours):
                    assert r.min <= r.max
                assert s.total.min % ROUND_TO == 0 and s.total.max % ROUND_TO == 0


def test_result_is_json_serialisable():
    json.dumps(estimate(vehicle(), "X", RATE, RULES, PARTS).to_dict())


# ---------- Seed data sanity

def test_seed_data_is_consistent():
    engine_types = {"petrol_turbo", "petrol_na", "diesel_turbo", "bike_petrol", "ev"}
    car_bodies = {"hatchback", "sedan", "suv", "mpv", "pickup"}
    bike_bodies = {"scooter", "commuter", "naked", "sport", "cruiser", "adventure"}
    ids = [v["id"] for v in VEHICLES]
    assert len(ids) == len(set(ids)), "duplicate id"
    for v in VEHICLES:
        assert v["engine_type"] in engine_types, v
        assert v["year_to"] is None or v["year_to"] >= v["year_from"], v
        assert 1990 < v["year_from"] < 2030, v
        assert v["parts_multiplier"] > 0 and (v["stock_hp"] is None or v["stock_hp"] > 0), v
        if v["vehicle_class"] == "car":
            assert v["body_type"] in car_bodies and v["engine_type"] != "bike_petrol" and v["id"] < 1000, v
        else:
            assert v["vehicle_class"] == "bike", v
            assert v["body_type"] in bike_bodies and v["engine_type"] in {"bike_petrol", "ev"} and v["id"] > 1000, v
    combos = [(v["make"], v["model"], v["engine_name"], v["year_from"]) for v in VEHICLES]
    assert len(combos) == len(set(combos)), "duplicate vehicle"
    for p in PARTS:
        assert set(p["engine_types"]) <= engine_types and p["price_min"] <= p["price_max"]
    for t in ("petrol_turbo", "petrol_na", "diesel_turbo", "bike_petrol"):
        assert {r["stage"] for r in RULES if r["engine_type"] == t} == {1, 2, 3}
