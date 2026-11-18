"""Tests for the budget planner."""
from app.budget import build_upgrades, plan
from app.repository import load_catalogue

CAT = load_catalogue()
RULES, PARTS = CAT["stage_rules"], CAT["parts"]
RATE = {"rate_min": 1000, "rate_max": 1000}


def car(**over):
    v = {"id": 1, "make": "T", "model": "C", "engine_type": "petrol_turbo", "stock_hp": 100, "stock_torque_nm": 200, "parts_multiplier": 1.0}
    v.update(over)
    return v


def labels(p):
    return {i["label"] for i in p["items"]}


def test_tiny_budget_buys_nothing_and_suggests_the_software():
    p = plan(car(), RATE, RULES, PARTS, budget=1000)
    assert p["affordable"] is False and p["items"] == []
    assert p["next_step"]["adds"] == ["ECU remap licence"]
    assert p["next_step"]["extra_cost"] > 1000


def test_software_comes_first():
    p = plan(car(), RATE, RULES, PARTS, budget=45_000)
    assert labels(p) == {"ECU remap licence"}
    assert p["hp"]["min"] > 100


def test_huge_budget_buys_everything():
    p = plan(car(), RATE, RULES, PARTS, budget=10_000_000)
    everything = {u.label for u in build_upgrades(car(), RATE, RULES, PARTS)}
    assert labels(p) == everything and p["next_step"] is None


def test_stage3_parts_never_without_stage2_parts_and_dyno():
    for budget in range(0, 1_500_000, 25_000):
        p = plan(car(), RATE, RULES, PARTS, budget=budget)
        got = labels(p)
        if got & {"Upgraded turbocharger", "Forged internals (pistons + rods)"}:
            assert {"High-flow air intake", "Performance downpipe", "Custom dyno tuning session"} <= got
        if got:
            assert "ECU remap licence" in got


def test_more_money_never_means_less_power():
    gains = [plan(car(), RATE, RULES, PARTS, budget=b)["gain_pct"]["min"] for b in range(0, 1_500_000, 20_000)]
    assert gains == sorted(gains)


def test_total_never_exceeds_budget():
    for budget in (30_000, 80_000, 150_000, 600_000):
        typical = plan(car(), RATE, RULES, PARTS, budget=budget, basis="typical")
        worst = plan(car(), RATE, RULES, PARTS, budget=budget, basis="worst")
        assert (typical["total"]["min"] + typical["total"]["max"]) / 2 <= budget + 500   # +500: rounding
        assert worst["total"]["max"] <= budget + 500
        assert worst["gain_pct"]["min"] <= typical["gain_pct"]["min"]                     # worst case is stricter


def test_gains_add_up_to_stage3_gain():
    p = plan(car(), RATE, RULES, PARTS, budget=10_000_000)
    rule3 = next(r for r in RULES if r["engine_type"] == "petrol_turbo" and r["stage"] == 3)
    assert round(p["gain_pct"]["min"], 1) == rule3["hp_gain_pct_min"]
    assert round(p["gain_pct"]["max"], 1) == rule3["hp_gain_pct_max"]


def test_bike_budget():
    bike = car(engine_type="bike_petrol", stock_hp=20.2, stock_torque_nm=27)
    p = plan(bike, RATE, RULES, PARTS, budget=20_000)
    assert "Fuel controller / ECU flash" in labels(p)
    assert "Downpipe" not in " ".join(labels(p))


def test_ev_not_tunable():
    assert plan(car(engine_type="ev"), RATE, RULES, PARTS, budget=100_000)["tunable"] is False


def test_next_step_only_adds_upgrades():
    bike = car(engine_type="bike_petrol", stock_hp=20.2, stock_torque_nm=27)
    for budget in range(5_000, 400_000, 5_000):
        p = plan(bike, RATE, RULES, PARTS, budget=budget)
        if p["next_step"]:
            assert labels(p) <= labels(p["next_step"]), budget
            assert p["next_step"]["gain_pct"]["min"] >= p["gain_pct"]["min"]
