"""Payment plan. Deterministic config, written with the civil engineer advisor. Edit freely."""
from pydantic import BaseModel

from typing import Optional

from .schemas import STAGE_ORDER, ElementType as E, Stage


class Milestone(BaseModel):
    id: str
    name: str
    stage: Stage
    required: list[E]            # all must be seen with enough confidence
    amount_inr: int
    engineer_gate: bool = False  # a licensed engineer must sign off at this point
    ask_for: list[str]           # what to ask the contractor to photograph if not proven
    name_ta: str = ""            # Tamil (owner and mestri screens); needs native review
    ask_for_ta: list[str] = []


DEFAULT_PLAN: list[Milestone] = [
    Milestone(id="m1", name="Foundation and footings", stage=Stage.footing,
              required=[E.footing_concrete], amount_inr=300000, engineer_gate=True,
              ask_for=["Close photo of each footing after concreting", "Wide photo showing all footings together"]),
    Milestone(id="m2", name="Plinth beam", stage=Stage.plinth,
              required=[E.plinth_beam], amount_inr=200000,
              ask_for=["Photo along the full length of the plinth beam"]),
    Milestone(id="m3", name="Ground floor columns", stage=Stage.columns,
              required=[E.column_concrete], amount_inr=250000,
              ask_for=["Photo of each column after removing the formwork"]),
    Milestone(id="m4", name="Slab reinforcement ready", stage=Stage.slab_reinforcement,
              # Mesh only: from above, the mesh covers the deck it rests on, and a slab mesh can't be laid
              # without one. Requiring the shuttering too sent real mesh photos to 'not proven' (eval).
              required=[E.slab_rebar_mesh], amount_inr=150000, engineer_gate=True,
              ask_for=["Top view of the full rebar mesh before the pour", "Close photo showing cover blocks under the mesh"]),
    Milestone(id="m5", name="Roof slab cast", stage=Stage.slab_cast,
              required=[E.slab_concrete_surface], amount_inr=250000,
              ask_for=["Photo of the top surface of the slab from the stairs or a corner", "Short video walking across the slab"]),
    Milestone(id="m6", name="Brickwork", stage=Stage.brickwork,
              required=[E.brick_wall], amount_inr=200000,
              ask_for=["Photo of each room's walls to lintel height"]),
    Milestone(id="m7", name="Plastering", stage=Stage.plastering,
              required=[E.plaster_finish], amount_inr=150000,
              ask_for=["Photo of plastered walls in every room"]),
    Milestone(id="m8", name="Flooring", stage=Stage.flooring,
              required=[E.flooring_tiles], amount_inr=150000,
              ask_for=["Wide photo of each finished floor"]),
]

# Tamil text for each milestone (kept separate so the English template above stays readable)
_TA = {'m1': ('அஸ்திவாரம் (ஃபுட்டிங்)', ['கான்கிரீட் போட்ட பின் ஒவ்வொரு ஃபுட்டிங்கையும் அருகிலிருந்து எடுத்த புகைப்படம்', 'அனைத்து ஃபுட்டிங்குகளும் ஒன்றாகத் தெரியும் அகலமான புகைப்படம்']), 'm2': ('பிளின்த் பீம்', ['பிளின்த் பீமின் முழு நீளமும் தெரியும் புகைப்படம்']), 'm3': ('தரைத்தள தூண்கள்', ['ஷட்டரிங் எடுத்த பின் ஒவ்வொரு தூணின் புகைப்படம்']), 'm4': ('ஸ்லாப் கம்பி கட்டும் வேலை முடிந்தது', ['கான்கிரீட் போடும் முன் முழு கம்பி வலையையும் மேலிருந்து எடுத்த புகைப்படம்', 'கம்பி வலைக்குக் கீழே உள்ள கவர் பிளாக்குகளை அருகிலிருந்து எடுத்த புகைப்படம்']), 'm5': ('கூரை ஸ்லாப் கான்கிரீட்', ['படிக்கட்டு அல்லது ஒரு மூலையிலிருந்து ஸ்லாபின் மேற்பரப்பு புகைப்படம்', 'ஸ்லாப் மேல் நடந்தபடி எடுத்த சிறிய வீடியோ']), 'm6': ('செங்கல் சுவர் வேலை', ['ஒவ்வொரு அறையின் சுவர்களும் லிண்டல் உயரம் வரை தெரியும் புகைப்படம்']), 'm7': ('பூச்சு வேலை (பிளாஸ்டரிங்)', ['ஒவ்வொரு அறையிலும் பூசப்பட்ட சுவர்களின் புகைப்படம்']), 'm8': ('தரை (டைல்ஸ்) வேலை', ['முடிந்த ஒவ்வொரு தரையின் அகலமான புகைப்படம்'])}
DEFAULT_PLAN = [m.model_copy(update={"name_ta": _TA[m.id][0], "ask_for_ta": _TA[m.id][1]}) for m in DEFAULT_PLAN]

PLAN_BY_ID = {m.id: m for m in DEFAULT_PLAN}
PLAN_BY_STAGE = {m.stage: m for m in DEFAULT_PLAN}


def milestone_for_claimed_stage(stage: Stage) -> Optional[Milestone]:
    """A voice note may name a stage with no milestone of its own (e.g. "shuttering done").
    Map it to the latest milestone at or before that stage; None if nothing fits (e.g. excavation)."""
    if stage in PLAN_BY_STAGE:
        return PLAN_BY_STAGE[stage]
    if stage not in STAGE_ORDER:
        return None
    rank = STAGE_ORDER.index(stage)
    earlier = [m for m in DEFAULT_PLAN if STAGE_ORDER.index(m.stage) <= rank]
    return max(earlier, key=lambda m: STAGE_ORDER.index(m.stage)) if earlier else None



# ---------------------------------------------------------------- the owner's plan (template + edits)
# The template above (stages, required evidence, shot lists) was written with the engineer advisor and is fixed.
# The owner may change amounts, and may ADD engineer gates. Gates in the template can never be removed:
# "critical stages always go to a licensed engineer, whatever the AI says."
LOCKED_GATES = {m.id for m in DEFAULT_PLAN if m.engineer_gate}


def current_plan() -> list[Milestone]:
    from . import store  # local import: store must not depend on milestones

    edits = store.plan_overrides()
    plan = []
    for m in DEFAULT_PLAN:
        e = edits.get(m.id, {})
        plan.append(m.model_copy(update={
            "amount_inr": e.get("amount_inr") or m.amount_inr,
            "engineer_gate": m.engineer_gate or bool(e.get("engineer_gate")),
        }))
    return plan


def current_by_id() -> dict[str, Milestone]:
    return {m.id: m for m in current_plan()}


def plan_version(plan: Optional[list[Milestone]] = None) -> str:
    import hashlib
    import json

    plan = plan or current_plan()
    canon = json.dumps([(m.id, m.amount_inr, m.engineer_gate) for m in plan])
    return hashlib.sha256(canon.encode()).hexdigest()[:12]


def claimed_stage_milestone(stage: Stage) -> Optional[Milestone]:
    """milestone_for_claimed_stage, but returning the owner's edited milestone."""
    m = milestone_for_claimed_stage(stage)
    return current_by_id().get(m.id) if m else None
