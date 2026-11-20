"""Data contracts. Gemini must return exactly these shapes; the rules engine only trusts these."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


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


class DefectSeen(BaseModel):
    defect: DefectType
    severity: Severity
    confidence: float
    note: str = Field(description="One short plain sentence describing what is visible")
    box_2d: Optional[list[int]] = None
    timestamp_s: Optional[float] = None


class MediaObservation(BaseModel):
    """What Gemini sees in ONE photo or video. Observation only, no judgement about payment."""
    usable: bool = Field(description="False if too dark, blurry, too far, or not a construction site")
    quality_issue: Optional[str] = Field(None, description="Why it is not usable, if not usable")
    stage: Stage
    stage_confidence: float
    elements: list[ElementSeen]
    defects: list[DefectSeen]
    summary: str = Field(description="One plain sentence of what the media shows")


class VoiceClaim(BaseModel):
    """What the contractor claims in a voice note."""
    language: str = Field(description="e.g. Tamil, Hindi, Telugu, English, mixed")
    transcript: str = Field(description="Verbatim transcript in the original language")
    translation_en: str
    claimed_stage: Stage = Field(description="Stage the contractor says is finished, unknown if none")
    amount_requested_inr: Optional[int] = Field(None, description="Rupees requested, null if not mentioned")
    confidence: float


class Verdict(str, Enum):
    proven = "proven"
    not_proven = "not_proven"
    needs_engineer = "needs_engineer"


class Finding(BaseModel):
    kind: str          # "ok" | "seen" | "missing" | "behind" | "defect" | "unclear" | "amount"
    text: str
    media_index: Optional[int] = None
    box_2d: Optional[list[int]] = None
    timestamp_s: Optional[float] = None


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
    prompt_version: Optional[str] = None
