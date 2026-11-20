"""Data contracts. Gemini must return exactly these shapes; the rules engine only trusts these."""
from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

log = logging.getLogger("pakka.validation")


# ---- Model-output guards. The model's JSON is shaped by response_schema but not range-checked by it.
# These run on every parse, so a bad value can never reach rules.py. Every coercion is logged.

def _confidence(v: Any) -> float:
    try:
        f = float(v)
    except (TypeError, ValueError):
        log.warning("confidence %r not a number, using 0", v)
        return 0.0
    if f != f:  # NaN
        log.warning("confidence NaN, using 0")
        return 0.0
    if 2.0 <= f <= 100.0:  # model answered in percent (1 < f < 2 is just a slip; clamped below)
        log.warning("confidence %s looks like a percentage, dividing by 100", f)
        f /= 100.0
    if not 0.0 <= f <= 1.0:
        log.warning("confidence %s out of range, clamping", f)
        f = min(max(f, 0.0), 1.0)
    return f


def _box(v: Any) -> Optional[list[int]]:
    """[ymin, xmin, ymax, xmax] on 0-1000, or None. A bad box is dropped, never 'fixed' into a wrong place."""
    if v is None:
        return None
    try:
        b = [int(round(float(x))) for x in v]
    except (TypeError, ValueError):
        log.warning("box %r not numeric, dropped", v)
        return None
    if len(b) != 4:
        log.warning("box %r does not have 4 values, dropped", v)
        return None
    b = [min(max(x, 0), 1000) for x in b]
    if not (b[0] < b[2] and b[1] < b[3]):
        log.warning("box %r is empty or inverted, dropped", v)
        return None
    return b


def _non_negative(v: Any, what: str):
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        log.warning("%s %r not numeric, dropped", what, v)
        return None
    if n < 0:
        log.warning("%s %r negative, dropped", what, v)
        return None
    return v


class Stage(str, Enum):
    """Construction stages of a typical Indian RCC framed house, in build order."""
    site_clearing = "site_clearing"
    excavation = "excavation"
    footing = "footing"
    plinth = "plinth"
    columns = "columns"
    slab_shuttering = "slab_shuttering"
    slab_reinforcement = "slab_reinforcement"
    slab_cast = "slab_cast"
    brickwork = "brickwork"
    plastering = "plastering"
    flooring = "flooring"
    finishing = "finishing"
    unknown = "unknown"


STAGE_ORDER = [s for s in Stage if s is not Stage.unknown]


class ElementType(str, Enum):
    excavation_pit = "excavation_pit"
    pcc_bed = "pcc_bed"
    footing_rebar = "footing_rebar"
    footing_concrete = "footing_concrete"
    plinth_beam = "plinth_beam"
    column_rebar = "column_rebar"
    column_concrete = "column_concrete"
    slab_shuttering = "slab_shuttering"
    slab_rebar_mesh = "slab_rebar_mesh"
    slab_concrete_surface = "slab_concrete_surface"
    brick_wall = "brick_wall"
    plaster_finish = "plaster_finish"
    door_window_frame = "door_window_frame"
    flooring_tiles = "flooring_tiles"


class DefectType(str, Enum):
    honeycombing = "honeycombing"
    exposed_rebar = "exposed_rebar"
    crack = "crack"
    missing_cover_blocks = "missing_cover_blocks"
    water_ponding = "water_ponding"
    misaligned_member = "misaligned_member"
    other = "other"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Box(BaseModel):
    """Gemini's convention: [ymin, xmin, ymax, xmax] normalised to 0-1000."""
    box_2d: list[int] = Field(description="[ymin, xmin, ymax, xmax] normalised 0-1000")


class ElementSeen(BaseModel):
    element: ElementType
    count: Optional[int] = Field(None, description="Count if countable and clearly visible, else null")
    confidence: float = Field(description="0 to 1")
    box_2d: Optional[list[int]] = Field(None, description="[ymin, xmin, ymax, xmax] 0-1000, images only")
    timestamp_s: Optional[float] = Field(None, description="Seconds into the video, videos only")

    _conf = field_validator("confidence", mode="before")(lambda v: _confidence(v))
    _box = field_validator("box_2d", mode="before")(lambda v: _box(v))
    _count = field_validator("count", mode="before")(lambda v: _non_negative(v, "count"))
    _ts = field_validator("timestamp_s", mode="before")(lambda v: _non_negative(v, "timestamp_s"))


class DefectSeen(BaseModel):
    defect: DefectType
    severity: Severity
    confidence: float
    note: str = Field(description="One short plain sentence describing what is visible")
    box_2d: Optional[list[int]] = None
    timestamp_s: Optional[float] = None

    _conf = field_validator("confidence", mode="before")(lambda v: _confidence(v))
    _box = field_validator("box_2d", mode="before")(lambda v: _box(v))
    _ts = field_validator("timestamp_s", mode="before")(lambda v: _non_negative(v, "timestamp_s"))


class MediaObservation(BaseModel):
    """What Gemini sees in ONE photo or video. Observation only, no judgement about payment."""
    usable: bool = Field(description="False if too dark, blurry, too far, or not a construction site")
    quality_issue: Optional[str] = Field(None, description="Why it is not usable, if not usable")
    stage: Stage
    stage_confidence: float
    elements: list[ElementSeen]
    defects: list[DefectSeen]
    summary: str = Field(description="One plain sentence of what the media shows")

    _conf = field_validator("stage_confidence", mode="before")(lambda v: _confidence(v))


class VoiceClaim(BaseModel):
    """What the contractor claims in a voice note."""
    language: str = Field(description="e.g. Tamil, Hindi, Telugu, English, mixed")
    transcript: str = Field(description="Verbatim transcript in the original language")
    translation_en: str
    claimed_stage: Stage = Field(description="Stage the contractor says is finished, unknown if none")
    amount_requested_inr: Optional[int] = Field(None, description="Rupees requested, null if not mentioned")
    confidence: float

    _conf = field_validator("confidence", mode="before")(lambda v: _confidence(v))
    _amount = field_validator("amount_requested_inr", mode="before")(lambda v: _non_negative(v, "amount"))


class Verdict(str, Enum):
    proven = "proven"
    not_proven = "not_proven"
    needs_engineer = "needs_engineer"


class Finding(BaseModel):
    kind: str          # ok | seen | missing | behind | defect | possible | unclear | amount | repeat | claim | note
    text: str
    media_index: Optional[int] = None
    box_2d: Optional[list[int]] = None
    timestamp_s: Optional[float] = None


class AuditStamp(BaseModel):
    model: str
    prompt_version: str
    rules_version: str  # set from rules.RULES_VERSION, the single source
    thresholds: dict[str, float]
    human_decides_payment: bool = True


class VerdictReport(BaseModel):
    milestone_id: str
    milestone_name: str
    verdict: Verdict
    headline: str
    findings: list[Finding]
    ask_next: list[str]
    amount_requested_inr: Optional[int]
    amount_planned_inr: int
    engineer_gate: bool
    work_visible: bool = False   # required work seen, nothing behind, no serious defect
    prompt_version: Optional[str] = None
    audit_stamp: Optional[AuditStamp] = None
