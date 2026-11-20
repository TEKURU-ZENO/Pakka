"""Deterministic verdict engine. No AI here. Every rupee and every verdict comes from this file."""
from __future__ import annotations

from typing import Optional

from .milestones import Milestone
from .prompts import PROMPT_VERSION_HASH
from .schemas import (STAGE_ORDER, Finding, MediaObservation, Severity, Stage, Verdict,
                      VerdictReport)

ELEMENT_MIN_CONF = 0.6
STAGE_MIN_CONF = 0.55
DEFECT_MIN_CONF = 0.6
AMOUNT_TOLERANCE = 0.02  # 2% rounding slack


def _rank(stage: Stage) -> int:
    return STAGE_ORDER.index(stage) if stage in STAGE_ORDER else -1


def decide(milestone: Milestone, observations: list[MediaObservation],
           amount_requested: Optional[int] = None) -> VerdictReport:
    findings: list[Finding] = []
    ask_next: list[str] = []
    usable = [(i, o) for i, o in enumerate(observations) if o.usable]

    # 1. Quality gate. Never guess from bad evidence.
    for i, o in enumerate(observations):
        if not o.usable:
            findings.append(Finding(kind="unclear", media_index=i,
                                    text=f"Upload {i + 1} can't be used. {o.quality_issue or 'Unclear image.'}"))
    if not usable:
        return _report(milestone, Verdict.not_proven, "No clear photo or video to check yet",
                       findings, ["A clear photo in daylight, taken close enough to see the work"] + milestone.ask_for,
                       amount_requested)

    # 2. Required elements, strongest sighting of each.
    for req in milestone.required:
        best = None
        for i, o in usable:
            for e in o.elements:
                if e.element == req and e.confidence >= ELEMENT_MIN_CONF and (best is None or e.confidence > best[1].confidence):
                    best = (i, e)
        label = req.value.replace("_", " ")
        if best:
            i, e = best
            count = f", {e.count} visible" if e.count else ""
            findings.append(Finding(kind="ok", media_index=i, box_2d=e.box_2d, timestamp_s=e.timestamp_s,
                                    text=f"{label.capitalize()} seen{count}"))
        else:
            findings.append(Finding(kind="missing", text=f"{label.capitalize()} not visible in any upload"))

    # Everything else that is clearly visible, so the owner sees what IS done (with boxes).
    best_other = {}
    for i, o in usable:
        for e in o.elements:
            if e.element in milestone.required or e.confidence < ELEMENT_MIN_CONF:
                continue
            if e.element not in best_other or e.confidence > best_other[e.element][1].confidence:
                best_other[e.element] = (i, e)
    for el, (i, e) in best_other.items():
        count = f", {e.count} visible" if e.count else ""
        findings.append(Finding(kind="seen", media_index=i, box_2d=e.box_2d, timestamp_s=e.timestamp_s,
                                text=f"{el.value.replace('_', ' ').capitalize()} seen{count}"))

    missing = any(f.kind == "missing" for f in findings)

    # 3. Is the site behind the claimed stage?
    confident = [(i, o) for i, o in usable if o.stage_confidence >= STAGE_MIN_CONF and o.stage is not Stage.unknown]
    if confident:
        i, top = max(confident, key=lambda io: _rank(io[1].stage))
        if _rank(top.stage) < _rank(milestone.stage):
            findings.append(Finding(kind="behind", media_index=i,
                                    text=f"Site looks like it is at {top.stage.value.replace('_', ' ')}, "
                                         f"before {milestone.stage.value.replace('_', ' ')}"))
            missing = True

    # 4. Visible defects.
    serious = False
    for i, o in usable:
        for d in o.defects:
            if d.confidence < DEFECT_MIN_CONF:
                continue
            findings.append(Finding(kind="defect", media_index=i, box_2d=d.box_2d, timestamp_s=d.timestamp_s,
                                    text=f"{d.defect.value.replace('_', ' ').capitalize()} ({d.severity.value}). {d.note}"))
            serious |= d.severity == Severity.high

    # 5. Amount check against the agreed plan.
    if amount_requested is not None and amount_requested > milestone.amount_inr * (1 + AMOUNT_TOLERANCE):
        extra = amount_requested - milestone.amount_inr
        findings.append(Finding(kind="amount", text=f"Requested ₹{amount_requested:,} but the plan says "
                                                     f"₹{milestone.amount_inr:,} for this stage (₹{extra:,} more)"))
        ask_next.append("Ask the contractor why the amount is higher than agreed")

    # 6. Verdict.
    if serious:
        verdict, headline = Verdict.needs_engineer, "A visible problem needs an engineer to look before paying"
        ask_next.insert(0, "Book an engineer visit for this stage")
    elif missing:
        verdict, headline = Verdict.not_proven, f'Claim "{milestone.name}" is not supported yet'
        ask_next = milestone.ask_for + ask_next
    elif milestone.engineer_gate:
        verdict, headline = Verdict.needs_engineer, "Work is visible. This stage needs an engineer sign-off"
        ask_next.insert(0, "Book the engineer visit before the next stage starts")
    else:
        verdict, headline = Verdict.proven, f"{milestone.name} is visible in the evidence"

    return _report(milestone, verdict, headline, findings, ask_next, amount_requested)


def _report(m: Milestone, verdict: Verdict, headline: str, findings, ask_next, amount,
            prompt_version: Optional[str] = None) -> VerdictReport:
    return VerdictReport(milestone_id=m.id, milestone_name=m.name, verdict=verdict, headline=headline,
                         findings=findings, ask_next=ask_next, amount_requested_inr=amount,
                         amount_planned_inr=m.amount_inr, engineer_gate=m.engineer_gate,
                         prompt_version=prompt_version or PROMPT_VERSION_HASH)
