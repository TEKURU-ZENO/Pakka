"""Payment plan. Deterministic config, written with the civil engineer advisor. Edit freely."""
from pydantic import BaseModel

from .schemas import ElementType as E, Stage


class Milestone(BaseModel):
    id: str
    name: str
    stage: Stage
    required: list[E]            # all must be seen with enough confidence
    amount_inr: int
    engineer_gate: bool = False  # a licensed engineer must sign off at this point
    ask_for: list[str]           # what to ask the contractor to photograph if not proven


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
              required=[E.slab_shuttering, E.slab_rebar_mesh], amount_inr=150000, engineer_gate=True,
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

PLAN_BY_ID = {m.id: m for m in DEFAULT_PLAN}
PLAN_BY_STAGE = {m.stage: m for m in DEFAULT_PLAN}
