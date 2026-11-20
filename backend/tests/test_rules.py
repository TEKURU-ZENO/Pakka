import json
from pathlib import Path

from app.milestones import PLAN_BY_ID
from app.rules import decide
from app.schemas import MediaObservation, Verdict

MOCK = Path(__file__).parent.parent / "app" / "mock"


def obs(name):
    return MediaObservation.model_validate_json((MOCK / f"{name}.json").read_text())


def test_slab_claim_on_shuttering_photo_is_not_proven():
    r = decide(PLAN_BY_ID["m5"], [obs("shuttering")], 250000)
    assert r.verdict == Verdict.not_proven
    assert any(f.kind == "behind" for f in r.findings)
    assert any(f.kind == "missing" for f in r.findings)


def test_slab_claim_with_slab_photo_is_proven():
    assert decide(PLAN_BY_ID["m5"], [obs("slab")], 250000).verdict == Verdict.proven


def test_high_defect_needs_engineer():
    assert decide(PLAN_BY_ID["m3"], [obs("honeycomb")]).verdict == Verdict.needs_engineer


def test_only_blurry_is_not_proven_and_asks_retake():
    r = decide(PLAN_BY_ID["m5"], [obs("blurry")])
    assert r.verdict == Verdict.not_proven
    assert "daylight" in r.ask_next[0]


def test_amount_above_plan_is_flagged():
    r = decide(PLAN_BY_ID["m5"], [obs("slab")], 300000)
    assert any(f.kind == "amount" for f in r.findings)


def test_engineer_gate_stage():
    o = obs("shuttering").model_copy(deep=True)
    o.elements.append(o.elements[0].model_copy(update={"element": "slab_rebar_mesh", "confidence": 0.8}))
    o.stage = "slab_reinforcement"
    assert decide(PLAN_BY_ID["m4"], [o]).verdict == Verdict.needs_engineer
