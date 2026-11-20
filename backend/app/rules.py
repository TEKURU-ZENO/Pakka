"""Deterministic verdict engine. No AI here. Every rupee and every verdict comes from this file."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from .milestones import Milestone
from .prompts import PROMPT_VERSION_HASH
from .schemas import (STAGE_ORDER, AuditStamp, ElementType, Finding, MediaObservation, Severity, Stage,
                      Verdict, VerdictReport, VoiceClaim)

ELEMENT_MIN_CONF = 0.6
STAGE_MIN_CONF = 0.55
DEFECT_MIN_CONF = 0.6
POSSIBLE_DEFECT_MIN_CONF = 0.4   # below DEFECT_MIN_CONF: shown as "possible", never changes the verdict
VOICE_MIN_CONF = 0.6             # below this, an amount or stage heard in a voice note is not trusted
AMOUNT_TOLERANCE = 0.02  # 2% rounding slack
RULES_VERSION = "1.3.0"  # 1.1.0 repeat claims · 1.2.0 voice/ahead/possible defects · 1.3.0 formwork veto


# A member's concrete can't be seen through its own formwork (see the veto in decide()).
FORMWORK_OF = {
    ElementType.column_concrete: ElementType.column_formwork,
    ElementType.plinth_beam: ElementType.beam_formwork,
    ElementType.footing_concrete: ElementType.footing_formwork,
}

def _rank(stage: Stage) -> int:
    return STAGE_ORDER.index(stage) if stage in STAGE_ORDER else -1


def inr(n: int) -> str:
    """Indian digit grouping, as owners read it: 250000 -> ₹2,50,000."""
    sign, d = ("-" if n < 0 else ""), str(abs(int(n)))
    if len(d) > 3:
        head, tail = d[:-3], d[-3:]
        head = ",".join([head[max(i - 2, 0):i] for i in range(len(head), 0, -2)][::-1])
        d = f"{head},{tail}"
    return f"{sign}₹{d}"


def _label(enum_value) -> str:
    return enum_value.value.replace("_", " ")


def resolve_amount(owner_amount: Optional[int], voice: Optional[VoiceClaim]) -> tuple[Optional[int], list[Finding]]:
    """Which rupee figure to check. The owner's own entry always wins; a voice figure only if heard clearly."""
    notes: list[Finding] = []
    heard = voice.amount_requested_inr if voice else None
    if owner_amount is not None:
        if heard is not None and voice.confidence >= VOICE_MIN_CONF and heard != owner_amount:
            notes.append(Finding(kind="claim", text=f"Voice note asks for {inr(heard)}, but {inr(owner_amount)} was "
                                                    f"entered. Checking {inr(owner_amount)}"))
        return owner_amount, notes
    if heard is None:
        return None, notes
    if voice.confidence < VOICE_MIN_CONF:
        notes.append(Finding(kind="unclear", text=f"Voice note amount ({inr(heard)}) was not heard clearly. "
                                                  f"Type the amount to check it"))
        return None, notes
    return heard, notes


def decide(milestone: Milestone, observations: list[MediaObservation],
           amount_requested: Optional[int] = None,
           model_name: str = "gemini-3.8-flash",
           previously_verified_at: Optional[float] = None,
           voice: Optional[VoiceClaim] = None,
           voice_failed: bool = False) -> VerdictReport:
    """amount_requested is what the OWNER typed. A voice-note amount is only used via resolve_amount()."""
    findings: list[Finding] = []
    ask_next: list[str] = []
    usable = [(i, o) for i, o in enumerate(observations) if o.usable]

    # 0. What the contractor claims (voice), checked against what the owner selected.
    amount, amount_notes = resolve_amount(amount_requested, voice)
    findings += amount_notes
    if voice_failed:
        findings.append(Finding(kind="unclear", text="The voice note could not be understood. Checked the photos only"))
    if (voice and voice.claimed_stage is not Stage.unknown and voice.claimed_stage != milestone.stage
            and voice.confidence >= VOICE_MIN_CONF):
        findings.append(Finding(kind="claim", text=f"Voice note claims {_label(voice.claimed_stage)}, "
                                                   f"but this check is for {milestone.name}"))
        ask_next.append("Confirm with the contractor which stage the payment is for")

    # 1. Quality gate. Never guess from bad evidence.
    for i, o in enumerate(observations):
        if not o.usable:
            findings.append(Finding(kind="unclear", media_index=i,
                                    text=f"Upload {i + 1} can't be used. {o.quality_issue or 'Unclear image.'}"))
    if not usable:
        return _report(milestone, Verdict.not_proven, "No clear photo or video to check yet", findings,
                       ["A clear photo in daylight, taken close enough to see the work"] + milestone.ask_for + ask_next,
                       amount, model_name=model_name)

    # 2. Required elements, strongest sighting of each.
    #    Formwork veto: in a photo where a member's formwork is clearly visible, a "concrete" sighting of that
    #    member doesn't count. The concrete is hidden behind the formwork, and the eval showed the model
    #    reporting cast concrete for columns still in their shutters. Another photo can still prove it.
    def vetoed(o: MediaObservation, element: ElementType) -> Optional[object]:
        fw = FORMWORK_OF.get(element)
        if fw is None:
            return None
        return next((e for e in o.elements if e.element == fw and e.confidence >= ELEMENT_MIN_CONF), None)

    for req in milestone.required:
        best, blocked = None, None
        for i, o in usable:
            for e in o.elements:
                if e.element != req or e.confidence < ELEMENT_MIN_CONF:
                    continue
                fw = vetoed(o, req)
                if fw is not None:
                    blocked = blocked or (i, fw)
                    continue
                if best is None or e.confidence > best[1].confidence:
                    best = (i, e)
        if best:
            i, e = best
            count = f", {e.count} visible" if e.count else ""
            findings.append(Finding(kind="ok", media_index=i, box_2d=e.box_2d, timestamp_s=e.timestamp_s,
                                    text=f"{_label(req).capitalize()} seen{count}"))
        elif blocked:
            i, fw = blocked
            findings.append(Finding(kind="missing", media_index=i, box_2d=fw.box_2d, timestamp_s=fw.timestamp_s,
                                    text=f"{_label(req).capitalize()} not visible: still inside {_label(fw.element)}. "
                                         f"Formwork is not proof of concrete"))
        else:
            findings.append(Finding(kind="missing", text=f"{_label(req).capitalize()} not visible in any upload"))

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
                                text=f"{_label(el).capitalize()} seen{count}"))

    missing = any(f.kind == "missing" for f in findings)

    # 3. Is the site behind (or ahead of) the claimed stage?
    confident = [(i, o) for i, o in usable if o.stage_confidence >= STAGE_MIN_CONF and o.stage is not Stage.unknown]
    if confident:
        i, top = max(confident, key=lambda io: _rank(io[1].stage))
        if _rank(top.stage) < _rank(milestone.stage):
            findings.append(Finding(kind="behind", media_index=i,
                                    text=f"Site looks like it is at {_label(top.stage)}, before {_label(milestone.stage)}"))
            missing = True
        elif _rank(top.stage) > _rank(milestone.stage):
            findings.append(Finding(kind="note", media_index=i,
                                    text=f"Site looks further along ({_label(top.stage)}) than this milestone. "
                                         f"Check earlier milestones were paid as agreed"))

    # 4. Visible defects. High escalates; medium asks for a fix; low-confidence ones are only "possible".
    serious = False
    for i, o in usable:
        for d in o.defects:
            name = _label(d.defect)
            if d.confidence < POSSIBLE_DEFECT_MIN_CONF:
                continue
            if d.confidence < DEFECT_MIN_CONF:
                findings.append(Finding(kind="possible", media_index=i, box_2d=d.box_2d, timestamp_s=d.timestamp_s,
                                        text=f"Possible {name}, not clear from this photo. {d.note}"))
                ask_next.append(f"A close-up photo of the possible {name} (upload {i + 1})")
                continue
            findings.append(Finding(kind="defect", media_index=i, box_2d=d.box_2d, timestamp_s=d.timestamp_s,
                                    text=f"{name.capitalize()} ({d.severity.value}). {d.note}"))
            if d.severity == Severity.high:
                serious = True
            elif d.severity == Severity.medium:
                ask_next.append(f"Ask how the {name} will be fixed, and for a photo after the fix")

    # 5. Amount check against the agreed plan.
    if amount is not None and amount > milestone.amount_inr * (1 + AMOUNT_TOLERANCE):
        extra = amount - milestone.amount_inr
        findings.append(Finding(kind="amount", text=f"Requested {inr(amount)} but the plan says "
                                                     f"{inr(milestone.amount_inr)} for this stage ({inr(extra)} more)"))
        ask_next.append("Ask the contractor why the amount is higher than agreed")
    elif amount is not None and amount < milestone.amount_inr * (1 - AMOUNT_TOLERANCE):
        findings.append(Finding(kind="note", text=f"Requested {inr(amount)}, less than the {inr(milestone.amount_inr)} "
                                                   f"planned. Ask if this is a part payment"))

    work_visible = not serious and not missing

    # 6. Repeat claim: this milestone was already verified once. Never let it look payable twice.
    repeat = work_visible and previously_verified_at is not None
    if repeat:
        when = datetime.fromtimestamp(previously_verified_at).strftime("%Y-%m-%d")
        findings.insert(0, Finding(kind="repeat", text=f"{milestone.name} was already verified on {when}. "
                                                       f"Check it has not been paid already"))
        ask_next.insert(0, "Check your payment records for this milestone before paying again")

    # 7. Verdict.
    if repeat:
        verdict, headline = Verdict.not_proven, f"{milestone.name} was already verified before. Possible repeat claim"
    elif serious:
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

    return _report(milestone, verdict, headline, findings, ask_next, amount, model_name=model_name,
                   work_visible=work_visible)


def _report(m: Milestone, verdict: Verdict, headline: str, findings, ask_next, amount,
            prompt_version: Optional[str] = None, model_name: str = "gemini-3.8-flash",
            work_visible: bool = False) -> VerdictReport:
    p_ver = prompt_version or PROMPT_VERSION_HASH
    audit = AuditStamp(
        model=model_name,
        prompt_version=p_ver,
        rules_version=RULES_VERSION,
        thresholds={
            "element_min_conf": ELEMENT_MIN_CONF,
            "stage_min_conf": STAGE_MIN_CONF,
            "defect_min_conf": DEFECT_MIN_CONF,
            "possible_defect_min_conf": POSSIBLE_DEFECT_MIN_CONF,
            "voice_min_conf": VOICE_MIN_CONF,
            "amount_tolerance": AMOUNT_TOLERANCE,
        },
        human_decides_payment=True,
    )
    return VerdictReport(
        milestone_id=m.id,
        milestone_name=m.name,
        verdict=verdict,
        headline=headline,
        findings=findings,
        ask_next=ask_next,
        amount_requested_inr=amount,
        amount_planned_inr=m.amount_inr,
        engineer_gate=m.engineer_gate,
        work_visible=work_visible,
        prompt_version=p_ver,
        audit_stamp=audit,
    )
