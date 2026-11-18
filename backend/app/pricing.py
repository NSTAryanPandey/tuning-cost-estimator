"""Pricing engine: turns a vehicle + city into cost estimates for tuning stages 1, 2 and 3.

This module is pure Python (no web framework, no database), so it is easy to unit-test.

How the cost is built (every amount is a range, min–max, in INR):
  Stage 1 = ECU remap licence + stage-1 labour
  Stage 2 = everything in Stage 1 + stage-2 parts that fit this engine + stage-2 labour
  Stage 3 = everything in Stage 2 + stage-3 parts/services + stage-3 labour + contingency
  Then GST is added on the subtotal and totals are rounded to the nearest ₹500.

Rules:
  * Parts only appear if they fit the engine type (no downpipe on a non-turbo engine).
  * Premium cars have a parts_multiplier (> 1): it scales part prices, never labour.
  * Bikes have their own rules (fuel controller, air filter, exhaust, big-bore kit) and pay a lower
    labour rate (labour_rate_factor in stage_rules).
  * Electric vehicles cannot be tuned this way, so they get no stages, only a reason.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Iterable

GST_RATE = 0.18                 # GST added to the subtotal
STAGE3_CONTINGENCY = 0.10       # Stage 3 builds often find extra work: add 10% buffer
ROUND_TO = 500                  # show totals rounded to the nearest ₹500
STAGE_NAMES = {1: "Stage 1 · Software only", 2: "Stage 2 · Hardware + software", 3: "Stage 3 · Full build"}
BIKE_STAGE_NAMES = {1: "Stage 1 · Fuel + intake", 2: "Stage 2 · Exhaust + remap", 3: "Stage 3 · Big-bore build"}
TUNABLE = {"petrol_turbo", "petrol_na", "diesel_turbo", "bike_petrol"}


@dataclass(frozen=True)
class Range:
    """A money (or number) range. Adding/scaling keeps min and max in step."""
    min: float
    max: float

    def __post_init__(self):
        if self.min > self.max:
            raise ValueError(f"Range min {self.min} is greater than max {self.max}")

    def __add__(self, other: "Range") -> "Range":
        return Range(self.min + other.min, self.max + other.max)

    def scale(self, factor: float) -> "Range":
        return Range(self.min * factor, self.max * factor)

    def times(self, other: "Range") -> "Range":
        """Multiply two ranges, e.g. hours (2–5) × rate (₹1,000–1,800/h) = ₹2,000–9,000."""
        return Range(self.min * other.min, self.max * other.max)

    def rounded(self, step: int = ROUND_TO) -> "Range":
        lo = int(self.min // step * step)                 # round the low end down
        hi = int(-(-self.max // step) * step)             # and the high end up, so the range never shrinks
        return Range(lo, hi)


ZERO = Range(0, 0)


@dataclass
class LineItem:
    label: str
    kind: str          # 'software' | 'part' | 'service' | 'labour'
    stage: int         # the stage that introduced this item
    cost: Range


@dataclass
class StageEstimate:
    stage: int
    name: str
    items: list[LineItem]
    labour_hours: Range
    subtotal: Range
    contingency: Range
    gst: Range
    total: Range
    hp: Range | None
    torque_nm: Range | None


@dataclass
class Estimate:
    vehicle: dict
    city: str
    tunable: bool
    reason: str | None
    stages: list[StageEstimate] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _sum(ranges: Iterable[Range]) -> Range:
    total = ZERO
    for r in ranges:
        total = total + r
    return total


def _gain(stock: int | None, rule: dict, key: str) -> Range | None:
    if not stock:
        return None
    lo, hi = rule[f"{key}_gain_pct_min"], rule[f"{key}_gain_pct_max"]
    digits = 1 if stock < 50 else 0                      # small bikes: keep one decimal (8.0 → 8.6 hp)
    return Range(round(stock * (1 + lo / 100), digits), round(stock * (1 + hi / 100), digits))


def estimate(vehicle: dict, city: str, labour_rate: dict, stage_rules: list[dict], parts: list[dict]) -> Estimate:
    """Build the estimate for all three stages.

    vehicle      a row of the vehicles table
    labour_rate  a row of labour_rates for the chosen city ({rate_min, rate_max})
    stage_rules  all rows of stage_rules (only this engine type's rows are used)
    parts        all rows of parts (only parts that fit this engine are used)
    """
    engine = vehicle["engine_type"]
    summary = {k: vehicle.get(k) for k in ("id", "make", "model", "engine_name", "engine_type", "year_from", "year_to", "stock_hp", "stock_torque_nm", "body_type", "image_url", "vehicle_class")}
    if engine not in TUNABLE:
        return Estimate(summary, city, False,
                        "Electric vehicles don't use ECU remaps, exhausts, intakes or turbos, so these tuning stages don't apply.")

    rules = {r["stage"]: r for r in stage_rules if r["engine_type"] == engine}
    missing = {1, 2, 3} - rules.keys()
    if missing:
        raise ValueError(f"No stage rules for {engine} stage(s) {sorted(missing)}")

    rate = Range(labour_rate["rate_min"], labour_rate["rate_max"]).scale(float(rules[1].get("labour_rate_factor") or 1))
    multiplier = float(vehicle.get("parts_multiplier") or 1)
    items: list[LineItem] = []        # grows as we go: each stage keeps the previous stage's items
    hours = ZERO
    result = Estimate(summary, city, True, None)

    for stage in (1, 2, 3):
        rule = rules[stage]
        if rule["ecu_fee_max"] > 0:
            label = rule.get("software_label") or "ECU remap licence"
            items.append(LineItem(label, "software", stage, Range(rule["ecu_fee_min"], rule["ecu_fee_max"])))
        for p in parts:
            if p["stage"] == stage and engine in p["engine_types"]:
                kind = p.get("category", "part")
                cost = Range(p["price_min"], p["price_max"])
                if kind == "part":
                    cost = cost.scale(multiplier)       # premium cars: pricier parts
                items.append(LineItem(p["name"], kind, stage, cost))
        stage_hours = Range(rule["labour_hours_min"], rule["labour_hours_max"])
        hours = hours + stage_hours
        items.append(LineItem(f"Workshop labour ({_fmt_hours(stage_hours)} h)", "labour", stage, stage_hours.times(rate)))

        subtotal = _sum(i.cost for i in items)
        contingency = subtotal.scale(STAGE3_CONTINGENCY) if stage == 3 else ZERO
        gst = (subtotal + contingency).scale(GST_RATE)
        total = (subtotal + contingency + gst).rounded()
        result.stages.append(StageEstimate(
            stage=stage, name=(BIKE_STAGE_NAMES if engine == "bike_petrol" else STAGE_NAMES)[stage], items=list(items), labour_hours=hours,
            subtotal=subtotal.rounded(), contingency=contingency.rounded(), gst=gst.rounded(), total=total,
            hp=_gain(vehicle.get("stock_hp"), rule, "hp"), torque_nm=_gain(vehicle.get("stock_torque_nm"), rule, "torque")))

    if engine == "petrol_na":
        result.notes.append("Non-turbo engines gain little from software alone; most of the gain comes from Stage 3 (turbo conversion).")
    if engine == "bike_petrol":
        result.notes.append("Bike workshop labour is charged at about half the car rate.")
    if multiplier > 1:
        result.notes.append("Parts for this model cost more than average (premium model).")
    result.notes.append("Estimates only. Tuning can affect warranty, insurance and emission compliance: check before modifying.")
    return result


def _fmt_hours(r: Range) -> str:
    f = lambda x: str(int(x)) if float(x).is_integer() else str(x)
    return f(r.min) if r.min == r.max else f"{f(r.min)}–{f(r.max)}"
