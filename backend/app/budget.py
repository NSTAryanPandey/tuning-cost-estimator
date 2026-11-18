"""Budget planner: "I have ₹X. Which upgrades give the most power for that money?"

Each upgrade (ECU software, each part) gets:
  * a cost: its price + its share of that stage's labour hours, plus GST (and the Stage 3
    contingency if the plan includes Stage 3 parts);
  * a power gain: its share of what its stage adds (Stage 2 parts split the Stage 2 gain, etc.).

Upgrades depend on each other, like in a real workshop:
  * any hardware needs the ECU software / fuel controller (otherwise the engine can't use it);
  * Stage 3 parts need all Stage 2 parts, and always come with the dyno tuning session.

There are at most ~6 choosable upgrades per engine, so the planner simply tries every valid
combination (2^6 = 64) and keeps the one with the biggest gain that fits the budget. That's exact and
instant at this size; with hundreds of parts you would switch to a knapsack-style dynamic programme.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from itertools import combinations

from .pricing import GST_RATE, STAGE3_CONTINGENCY, TUNABLE, Range, ZERO


@dataclass
class Upgrade:
    key: str
    label: str
    stage: int
    kind: str            # 'software' | 'part' | 'service'
    cost: Range          # price + labour share, before GST
    gain_pct: Range      # power gain this upgrade adds (percent of stock)
    torque_pct: Range


def _mid(r: Range) -> float:
    return (r.min + r.max) / 2


def _diff(a: Range, b: Range) -> Range:
    lo, hi = a.min - b.min, a.max - b.max
    return Range(min(lo, hi), max(lo, hi))


def build_upgrades(vehicle: dict, labour_rate: dict, stage_rules: list[dict], parts: list[dict]) -> list[Upgrade]:
    engine = vehicle["engine_type"]
    rules = {r["stage"]: r for r in stage_rules if r["engine_type"] == engine}
    factor = float(rules[1].get("labour_rate_factor") or 1)
    rate = Range(labour_rate["rate_min"], labour_rate["rate_max"]).scale(factor)
    multiplier = float(vehicle.get("parts_multiplier") or 1)
    ups: list[Upgrade] = []
    prev_hp, prev_tq = Range(0, 0), Range(0, 0)
    for stage in (1, 2, 3):
        rule = rules[stage]
        hp = Range(rule["hp_gain_pct_min"], rule["hp_gain_pct_max"])
        tq = Range(rule["torque_gain_pct_min"], rule["torque_gain_pct_max"])
        stage_hp = _diff(hp, prev_hp)       # what this stage adds on top of the previous one
        stage_tq = _diff(tq, prev_tq)
        prev_hp, prev_tq = hp, tq

        items = []
        if rule["ecu_fee_max"] > 0:
            items.append(("software", rule.get("software_label") or "ECU remap licence", "software", Range(rule["ecu_fee_min"], rule["ecu_fee_max"])))
        for p in parts:
            if p["stage"] == stage and engine in p["engine_types"]:
                kind = p.get("category", "part")
                price = Range(p["price_min"], p["price_max"])
                items.append((f"part-{p['id']}", p["name"], kind, price.scale(multiplier) if kind == "part" else price))
        if not items:
            continue
        hours = Range(rule["labour_hours_min"], rule["labour_hours_max"]).scale(1 / len(items))
        n_gainers = sum(1 for i in items if i[2] != "service") or len(items)
        for key, label, kind, price in items:
            share = 0 if kind == "service" and n_gainers != len(items) else 1 / n_gainers
            ups.append(Upgrade(key, label, stage, kind, price + hours.times(rate),
                               stage_hp.scale(share), stage_tq.scale(share)))
    return ups


def _valid(chosen: list[Upgrade], all_ups: list[Upgrade]) -> bool:
    keys = {u.key for u in chosen}
    has_software = any(u.kind == "software" for u in chosen)
    if any(u.kind != "software" for u in chosen) and not has_software:
        return False
    if any(u.stage == 3 for u in chosen):
        stage2 = {u.key for u in all_ups if u.stage == 2}
        if not stage2 <= keys:
            return False
    return True


def _total(chosen: list[Upgrade]) -> tuple[Range, Range, Range]:
    subtotal = ZERO
    for u in chosen:
        subtotal = subtotal + u.cost
    contingency = subtotal.scale(STAGE3_CONTINGENCY) if any(u.stage == 3 for u in chosen) else ZERO
    gst = (subtotal + contingency).scale(GST_RATE)
    return subtotal + contingency + gst, contingency, gst


def plan(vehicle: dict, labour_rate: dict, stage_rules: list[dict], parts: list[dict], budget: float, basis: str = "typical") -> dict:
    """basis 'typical' compares the budget with the middle of each price range, 'worst' with the top."""
    if vehicle["engine_type"] not in TUNABLE:
        return {"tunable": False, "budget": budget, "basis": basis, "chosen": [], "next_step": None}

    ups = build_upgrades(vehicle, labour_rate, stage_rules, parts)
    services = [u for u in ups if u.kind == "service"]
    choosable = [u for u in ups if u.kind != "service"]
    price = (lambda r: _mid(r)) if basis == "typical" else (lambda r: r.max)

    candidates = []
    for n in range(len(choosable) + 1):
        for combo in combinations(choosable, n):
            chosen = list(combo)
            if not _valid(chosen, ups):
                continue
            if any(u.stage == 3 for u in chosen):
                chosen += services                      # stage 3 always comes with the dyno session
            total, contingency, gst = _total(chosen)
            gain = ZERO
            tq = ZERO
            for u in chosen:
                gain, tq = gain + u.gain_pct, tq + u.torque_pct
            candidates.append({"chosen": chosen, "total": total, "contingency": contingency, "gst": gst,
                               "gain": gain, "torque": tq, "cost": price(total), "score": _mid(gain)})

    fits = [c for c in candidates if c["cost"] <= budget]          # the empty plan (₹0) always fits
    best = max(fits, key=lambda c: (round(c["score"], 6), -c["cost"]))
    have_keys = {u.key for u in best["chosen"]}
    # the next step only ADDS to the current build (never swaps something out)
    better = [c for c in candidates if c["score"] > best["score"] + 1e-9 and have_keys <= {u.key for u in c["chosen"]}]
    nxt = min(better, key=lambda c: (c["cost"], -c["score"])) if better else None

    stock_hp, stock_tq = vehicle.get("stock_hp"), vehicle.get("stock_torque_nm")
    digits = 1 if stock_hp and stock_hp < 50 else 0

    def power(stock, pct: Range):
        if not stock:
            return None
        return asdict(Range(round(stock * (1 + pct.min / 100), digits), round(stock * (1 + pct.max / 100), digits)))

    def describe(c):
        return {
            "items": [{"label": u.label, "kind": u.kind, "stage": u.stage, "cost": asdict(u.cost.rounded(100))} for u in c["chosen"]],
            "gst": asdict(c["gst"].rounded()), "contingency": asdict(c["contingency"].rounded()),
            "total": asdict(c["total"].rounded()), "gain_pct": asdict(Range(round(c["gain"].min, 1), round(c["gain"].max, 1))),
            "hp": power(stock_hp, c["gain"]), "torque_nm": power(stock_tq, c["torque"]),
        }

    result = {"tunable": True, "budget": budget, "basis": basis, "affordable": bool(best["chosen"]),
              "options_checked": len(candidates), **describe(best), "next_step": None}
    if nxt:
        have = have_keys
        result["next_step"] = {
            "extra_cost": math.ceil((nxt["cost"] - best["cost"]) / 500) * 500,
            "adds": [u.label for u in nxt["chosen"] if u.key not in have],
            **describe(nxt),
        }
    return result
