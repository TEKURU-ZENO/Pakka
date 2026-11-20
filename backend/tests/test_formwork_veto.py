"""Formwork veto (rules v1.3.0). Built from the live eval: gemini-3-flash-preview reported column_concrete 0.9
for blue steel column shutters ('images_4.jpg'), which made an unfinished stage look payable."""
from app.milestones import PLAN_BY_ID
from app.prompts import SITE_PROMPT
from app.rules import decide
from app.schemas import MediaObservation, Verdict


def obs(*elements, stage="columns"):
    return MediaObservation.model_validate({
        "usable": True, "stage": stage, "stage_confidence": 0.9, "defects": [], "summary": "x",
        "elements": [{"element": e, "confidence": c, "box_2d": [100, 100, 900, 900]} for e, c in elements],
    })


def test_columns_in_their_shutters_are_not_proven():
    r = decide(PLAN_BY_ID["m3"], [obs(("column_rebar", 0.9), ("column_concrete", 0.9), ("column_formwork", 0.9))])
    assert r.verdict == Verdict.not_proven
    miss = next(f for f in r.findings if f.kind == "missing")
    assert "column formwork" in miss.text and miss.box_2d is not None
    assert any("removing the formwork" in a for a in r.ask_next)


def test_stripped_columns_in_another_photo_still_prove_it():
    shuttered = obs(("column_concrete", 0.9), ("column_formwork", 0.9))
    stripped = obs(("column_concrete", 0.85))
    r = decide(PLAN_BY_ID["m3"], [shuttered, stripped])
    assert r.verdict == Verdict.proven
    assert next(f for f in r.findings if f.kind == "ok").media_index == 1


def test_low_confidence_formwork_does_not_veto():
    r = decide(PLAN_BY_ID["m3"], [obs(("column_concrete", 0.9), ("column_formwork", 0.4))])
    assert r.verdict == Verdict.proven


def test_plinth_shuttering_vetoes_plinth_beam():
    r = decide(PLAN_BY_ID["m2"], [obs(("plinth_beam", 0.95), ("beam_formwork", 0.85), stage="plinth")])
    assert r.verdict == Verdict.not_proven


def test_slab_pour_is_not_vetoed_by_shuttering_underneath():
    """Shuttering stays under a fresh slab for weeks; it must not block a cast-slab claim."""
    r = decide(PLAN_BY_ID["m5"], [obs(("slab_concrete_surface", 0.9), ("slab_shuttering", 0.9), stage="slab_cast")])
    assert r.verdict == Verdict.proven


def test_prompt_separates_formwork_from_concrete():
    assert "Formwork is not concrete" in SITE_PROMPT
    for el in ("column_formwork", "beam_formwork", "footing_formwork"):
        assert el in SITE_PROMPT
