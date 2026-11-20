import json
import pytest
from app.schemas import (
    Stage,
    ElementType,
    DefectType,
    Severity,
    Box,
    ElementSeen,
    DefectSeen,
    MediaObservation,
    VoiceClaim,
    Verdict,
    Finding,
    VerdictReport,
)


def test_schema_enums():
    # Verify Stage build order
    expected_stages = [
        "site_clearing",
        "excavation",
        "footing",
        "plinth",
        "columns",
        "slab_shuttering",
        "slab_reinforcement",
        "slab_cast",
        "brickwork",
        "plastering",
        "flooring",
        "finishing",
        "unknown",
    ]
    assert [s.value for s in Stage] == expected_stages

    # Verify ElementType contains all core elements
    core_elements = [
        "footing_concrete",
        "plinth_beam",
        "column_rebar",
        "column_concrete",
        "slab_shuttering",
        "slab_rebar_mesh",
        "slab_concrete_surface",
        "brick_wall",
        "plaster_finish",
        "flooring_tiles",
    ]
    for el in core_elements:
        assert el in [e.value for e in ElementType]

    # Verify DefectType & Severity
    core_defects = [
        "honeycombing",
        "exposed_rebar",
        "crack",
        "missing_cover_blocks",
        "water_ponding",
        "misaligned_member",
    ]
    for d in core_defects:
        assert d in [df.value for df in DefectType]

    assert [sev.value for sev in Severity] == ["low", "medium", "high"]


def test_media_observation_validation():
    sample_json = {
        "usable": True,
        "quality_issue": None,
        "stage": "slab_shuttering",
        "stage_confidence": 0.92,
        "elements": [
            {
                "element": "column_concrete",
                "count": 8,
                "confidence": 0.95,
                "box_2d": [120, 50, 850, 920],
                "timestamp_s": None,
            },
            {
                "element": "slab_shuttering",
                "count": None,
                "confidence": 0.88,
                "box_2d": [80, 100, 450, 900],
                "timestamp_s": None,
            },
        ],
        "defects": [
            {
                "defect": "honeycombing",
                "severity": "low",
                "confidence": 0.72,
                "note": "Minor surface honeycombing near column base",
                "box_2d": [700, 200, 800, 280],
                "timestamp_s": None,
            }
        ],
        "summary": "Reinforced columns are poured and slab shuttering is partially erected.",
    }

    obs = MediaObservation.model_validate_json(json.dumps(sample_json))
    assert obs.usable is True
    assert obs.stage == Stage.slab_shuttering
    assert len(obs.elements) == 2
    assert obs.elements[0].box_2d == [120, 50, 850, 920]
    assert len(obs.defects) == 1
    assert obs.defects[0].defect == DefectType.honeycombing
    # AI Governance assertion: ensure no pay/approve field exists
    assert not hasattr(obs, "pay")
    assert not hasattr(obs, "approve")


def test_voice_claim_validation():
    sample_json = {
        "language": "Tamil",
        "transcript": "Sir, slab centering mudinjiduchu, rendu latcham anuppunga.",
        "translation_en": "Sir, slab shuttering is completed, please send two lakhs.",
        "claimed_stage": "slab_shuttering",
        "amount_requested_inr": 200000,
        "confidence": 0.94,
    }

    claim = VoiceClaim.model_validate_json(json.dumps(sample_json))
    assert claim.language == "Tamil"
    assert claim.claimed_stage == Stage.slab_shuttering
    assert claim.amount_requested_inr == 200000


def test_verdict_report_validation():
    sample_json = {
        "milestone_id": "m4",
        "milestone_name": "Slab reinforcement ready",
        "verdict": "not_proven",
        "headline": "Claim 'Slab reinforcement ready' is not supported yet",
        "findings": [
            {
                "kind": "ok",
                "text": "Slab shuttering seen",
                "media_index": 0,
                "box_2d": [80, 100, 450, 900],
                "timestamp_s": None,
            },
            {
                "kind": "missing",
                "text": "Slab rebar mesh not visible in any upload",
                "media_index": None,
                "box_2d": None,
                "timestamp_s": None,
            },
        ],
        "ask_next": [
            "Top view of the full rebar mesh before the pour",
            "Close photo showing cover blocks under the mesh",
        ],
        "amount_requested_inr": 200000,
        "amount_planned_inr": 150000,
        "engineer_gate": True,
    }

    report = VerdictReport.model_validate_json(json.dumps(sample_json))
    assert report.verdict == Verdict.not_proven
    assert report.amount_requested_inr == 200000
    assert report.amount_planned_inr == 150000
    assert report.engineer_gate is True
