"""Regression tests for the P1 audit fixes (see AUDIT.md)."""
import io
import os
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image

import app.perception as p
from app import main
from app.milestones import PLAN_BY_ID, milestone_for_claimed_stage
from app.rules import decide
from app.schemas import MediaObservation, Severity, Stage, Verdict, VoiceClaim

MOCK = Path(__file__).parent.parent / "app" / "mock"


def obs(name):
    return MediaObservation.model_validate_json((MOCK / f"{name}.json").read_text())


def voice(**kw):
    base = dict(language="Tamil", transcript="t", translation_en="t", claimed_stage="slab_cast",
                amount_requested_inr=250000, confidence=0.9)
    return VoiceClaim.model_validate({**base, **kw})


def _jpeg():
    img = Image.frombytes("L", (64, 64), os.urandom(4096))
    b = io.BytesIO()
    img.save(b, "JPEG")
    return b.getvalue()


# ---- W5: model output is range-checked before rules.py sees it
def test_percent_confidence_and_bad_boxes_are_coerced():
    o = MediaObservation.model_validate({
        "usable": True, "stage": "slab_cast", "stage_confidence": 85, "summary": "x", "defects": [],
        "elements": [
            {"element": "slab_concrete_surface", "confidence": 95, "box_2d": [900, 10], "count": -2},
            {"element": "brick_wall", "confidence": 0.7, "box_2d": [500, 100, 50, 900]},
            {"element": "plaster_finish", "confidence": 1.3, "box_2d": [-5, 0, 1200, 500.4]},
        ]})
    assert o.stage_confidence == pytest.approx(0.85)
    e0, e1, e2 = o.elements
    assert e0.confidence == pytest.approx(0.95) and e0.box_2d is None and e0.count is None
    assert e1.box_2d is None
    assert e2.confidence == 1.0 and e2.box_2d == [0, 0, 1000, 500]


def test_percent_confidence_cannot_sneak_past_thresholds():
    """A 0-100 'confidence 50' must not count as 50 > 0.6."""
    o = obs("slab").model_copy(deep=True)
    raw = o.model_dump()
    raw["elements"][0]["confidence"] = 50
    assert decide(PLAN_BY_ID["m5"], [MediaObservation.model_validate(raw)]).verdict == Verdict.not_proven


# ---- W6: Gemini failures degrade gracefully
def test_retry_then_friendly_error(monkeypatch):
    from google.genai import errors
    calls = []
    monkeypatch.setattr(p.time, "sleep", lambda s: None)

    def flaky():
        calls.append(1)
        raise errors.APIError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})

    with pytest.raises(p.PerceptionError):
        p._retrying(flaky, "test")
    assert len(calls) == p.MAX_ATTEMPTS

    calls.clear()

    def bad_request():
        calls.append(1)
        raise errors.APIError(400, {"error": {"message": "bad", "status": "INVALID_ARGUMENT"}})

    with pytest.raises(p.PerceptionError):
        p._retrying(bad_request, "test")
    assert len(calls) == 1  # never retry a 4xx other than 429


def test_all_observations_failing_is_a_502(monkeypatch):
    def boom(*a, **k):
        raise p.PerceptionError("down")
    monkeypatch.setattr(p, "observe_media", boom)
    with pytest.raises(HTTPException) as e:
        main.create_update(files=[UploadFile(file=io.BytesIO(_jpeg()), filename="slab.jpg")], milestone_id="m5")
    assert e.value.status_code == 502


def test_one_failed_photo_and_failed_voice_still_check_the_rest(monkeypatch):
    monkeypatch.setattr(p, "MOCK", True)
    real = p.observe_media

    def half(path, mime=None):
        if "bad" in path.name:
            raise p.PerceptionError("down")
        return real(path, mime)

    def no_voice(*a, **k):
        raise p.PerceptionError("down")

    monkeypatch.setattr(p, "observe_media", half)
    monkeypatch.setattr(p, "understand_voice", no_voice)
    r = main.create_update(files=[UploadFile(file=io.BytesIO(_jpeg()), filename="slab_good.jpg"),
                                  UploadFile(file=io.BytesIO(_jpeg()), filename="slab_bad.jpg"),
                                  UploadFile(file=io.BytesIO(b"OggS" + bytes(60)), filename="voice.opus")],
                           milestone_id="m5")
    assert r["report"]["verdict"] == Verdict.proven
    texts = " ".join(f["text"] for f in r["report"]["findings"])
    assert "couldn't analyse" in texts and "voice note could not be understood" in texts


def test_gemini_client_without_key_is_a_perception_error(monkeypatch):
    monkeypatch.setattr(p, "_client", None)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(p.PerceptionError):
        p._gemini()


# ---- W7: signals the rules engine used to ignore
def test_low_confidence_voice_amount_is_not_trusted():
    r = decide(PLAN_BY_ID["m5"], [obs("slab")], voice=voice(amount_requested_inr=900000, confidence=0.3))
    assert r.amount_requested_inr is None
    assert not any(f.kind == "amount" for f in r.findings)
    assert any("not heard clearly" in f.text for f in r.findings)


def test_clear_voice_amount_is_used_and_owner_entry_wins():
    assert decide(PLAN_BY_ID["m5"], [obs("slab")], voice=voice(amount_requested_inr=300000)).amount_requested_inr == 300000
    r = decide(PLAN_BY_ID["m5"], [obs("slab")], 250000, voice=voice(amount_requested_inr=300000))
    assert r.amount_requested_inr == 250000
    assert any(f.kind == "claim" and "₹3,00,000" in f.text for f in r.findings)


def test_voice_stage_mismatch_is_flagged():
    r = decide(PLAN_BY_ID["m3"], [obs("column")], voice=voice(claimed_stage="slab_cast"))
    assert any(f.kind == "claim" and "slab cast" in f.text for f in r.findings)


def test_lower_amount_and_site_ahead_are_noted():
    r = decide(PLAN_BY_ID["m3"], [obs("slab")], 100000)
    kinds = [f.kind for f in r.findings]
    assert kinds.count("note") == 2


def test_possible_and_medium_defects_reach_the_owner():
    o = obs("honeycomb").model_copy(deep=True)
    o.defects[0] = o.defects[0].model_copy(update={"confidence": 0.5})
    r = decide(PLAN_BY_ID["m3"], [o])
    assert r.verdict != Verdict.needs_engineer or r.engineer_gate  # a possible defect never escalates
    assert any(f.kind == "possible" for f in r.findings)
    o2 = obs("honeycomb").model_copy(deep=True)
    o2.defects[0] = o2.defects[0].model_copy(update={"severity": Severity.medium})
    r2 = decide(PLAN_BY_ID["m3"], [o2])
    assert any("will be fixed" in a for a in r2.ask_next)


def test_claimed_stage_without_milestone_maps_to_latest_earlier_one():
    assert milestone_for_claimed_stage(Stage.slab_cast).id == "m5"
    assert milestone_for_claimed_stage(Stage.slab_shuttering).id == "m3"
    assert milestone_for_claimed_stage(Stage.finishing).id == "m8"
    assert milestone_for_claimed_stage(Stage.excavation) is None
    assert milestone_for_claimed_stage(Stage.unknown) is None
