"""Owner flows from the stakeholder review: editable plan, engineer sign-off, ledger, erasure, retention,
read-only share link, consent, Tamil text, and the model fallback chain."""
import io
import os
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.perception as p
from app import main, store
from app.milestones import LOCKED_GATES, current_by_id


@pytest.fixture(autouse=True)
def _mock(monkeypatch):
    monkeypatch.setattr(p, "MOCK", True)


def jpg():
    b = io.BytesIO()
    Image.frombytes("L", (256, 256), os.urandom(65536)).convert("RGB").save(b, "JPEG")
    return b.getvalue()


def check(c, name, milestone, consent=True):
    data = {"milestone_id": milestone, **({"consent": "true"} if consent else {})}
    r = c.post("/api/updates", files={"files": (name, jpg(), "image/jpeg")}, data=data)
    assert r.status_code == 200, r.text
    return r.json()


# ---- editable plan
def test_owner_can_edit_amounts_and_add_but_not_remove_gates():
    c = TestClient(main.app)
    r = c.put("/api/plan/m5", json={"amount_inr": 275000, "engineer_gate": True})
    assert r.status_code == 200
    m5 = next(m for m in r.json() if m["id"] == "m5")
    assert m5["amount_inr"] == 275000 and m5["engineer_gate"] is True
    assert "m1" in LOCKED_GATES
    assert c.put("/api/plan/m1", json={"engineer_gate": False}).status_code == 400
    assert current_by_id()["m1"].engineer_gate is True


def test_verdict_uses_edited_amount_and_records_plan_version():
    c = TestClient(main.app)
    c.put("/api/plan/m5", json={"amount_inr": 300000})
    body = check(c, "site_slab.jpg", "m5")
    assert body["report"]["amount_planned_inr"] == 300000
    assert len(body["audit_stamp"]["plan_version"]) == 12


# ---- engineer sign-off and ledger
def test_engineer_approval_verifies_a_gated_stage():
    c = TestClient(main.app)
    body = check(c, "site_rebar.jpg", "m4")
    assert body["report"]["verdict"] == "needs_engineer"
    led = c.get("/api/ledger").json()
    row = next(m for m in led["milestones"] if m["milestone_id"] == "m4")
    assert row["status"] == "awaiting_engineer"  # NOT verified before the engineer signs
    r = c.post(f"/api/updates/{body['id']}/signoff",
               json={"engineer_name": "Er. K. Lakshmi", "registration_no": "TN-CE-1234", "decision": "approved",
                     "note": "Cover blocks adequate, spacing as per drawing"})
    assert r.status_code == 200
    assert r.json()["signoffs"][0]["engineer_name"] == "Er. K. Lakshmi"
    led = c.get("/api/ledger").json()
    assert next(m for m in led["milestones"] if m["milestone_id"] == "m4")["status"] == "verified"
    assert led["totals"]["verified"] == current_by_id()["m4"].amount_inr


def test_rework_does_not_verify_and_signoff_only_on_engineer_checks():
    c = TestClient(main.app)
    body = check(c, "site_rebar.jpg", "m4")
    c.post(f"/api/updates/{body['id']}/signoff", json={"engineer_name": "Er. R", "decision": "rework", "note": "Add cover blocks"})
    assert store.milestone_verified_at("m4") is None
    slab = check(c, "site_slab.jpg", "m5")
    assert c.post(f"/api/updates/{slab['id']}/signoff", json={"engineer_name": "Er. R", "decision": "approved"}).status_code == 400


def test_ledger_totals_add_up():
    c = TestClient(main.app)
    check(c, "site_slab.jpg", "m5")
    led = c.get("/api/ledger").json()
    assert sum(led["totals"].values()) == led["plan_total"]
    assert led["totals"]["verified"] == current_by_id()["m5"].amount_inr


# ---- DPDP: consent, erasure, retention
def test_consent_is_recorded_for_owner_uploads():
    c = TestClient(main.app)
    body = check(c, "site_slab.jpg", "m5")
    assert body["consent"]["given"] is True and body["consent"]["by"] == "owner"


def test_erasure_removes_record_media_and_verification():
    c = TestClient(main.app)
    body = check(c, "site_slab.jpg", "m5")
    media = store.MEDIA_DIR / body["media"][0]["url"].split("/")[-1].split("?")[0]
    assert media.exists() and store.milestone_verified_at("m5")
    assert c.delete(f"/api/updates/{body['id']}").status_code == 200
    assert not media.exists()
    assert store.get_update(body["id"]) is None
    assert store.milestone_verified_at("m5") is None
    assert c.delete(f"/api/updates/{body['id']}").status_code == 404


def test_retention_purges_old_checks(monkeypatch):
    c = TestClient(main.app)
    body = check(c, "site_slab.jpg", "m5")
    real = time.time
    monkeypatch.setattr(store.time, "time", lambda: real() + 181 * 86400)
    assert store.purge_older_than(180) == 1
    assert store.get_update(body["id"]) is None


def test_privacy_endpoint_states_retention():
    assert TestClient(main.app).get("/api/privacy").json()["retention_days"] == 180


# ---- read-only share link
def test_share_link_is_read_only_and_hides_location(monkeypatch):
    c = TestClient(main.app)
    check(c, "site_slab.jpg", "m5")
    link = c.post("/api/share-links", json={"label": "Amma in Dubai"}).json()
    view = c.get(f"/api/share/{link['token']}").json()
    assert view["label"] == "Amma in Dubai"
    assert view["checks"][0]["report"]["verdict"] == "proven"
    assert "capture" not in view["checks"][0] and "consent" not in view["checks"][0]
    monkeypatch.setenv("PAKKA_ACCESS_KEY", "k")
    assert c.get(f"/api/share/{link['token']}").status_code == 200  # the token is the credential
    assert c.post("/api/share-links", json={"label": "x"}).status_code == 401
    c.delete(f"/api/share-links/{link['token']}", headers={"X-Pakka-Key": "k"})
    assert c.get(f"/api/share/{link['token']}").status_code == 404


# ---- Tamil
def test_tamil_headline_and_capture_shots():
    c = TestClient(main.app)
    body = check(c, "site_shuttering.jpg", "m5")
    assert "நிரூபிக்கப்படவில்லை" in body["report"]["headline_ta"]
    tok = c.post("/api/capture-links", json={"milestone_id": "m5"}).json()["token"]
    info = c.get(f"/api/capture/{tok}").json()
    assert info["milestone_name_ta"] and len(info["shots_ta"]) == len(info["shots"])


# ---- model fallback chain
def test_fallback_to_next_model_on_quota(monkeypatch, tmp_path):
    from google.genai import errors

    monkeypatch.setattr(p, "MOCK", False)
    monkeypatch.setenv("PAKKA_MOCK", "0")
    monkeypatch.setattr(p, "FALLBACK_MODELS", ["backup-model"])
    monkeypatch.setattr(p.time, "sleep", lambda s: None)
    monkeypatch.setenv("GEMINI_MAX_ATTEMPTS", "1")
    seen = []

    class Models:
        def generate_content(self, model, contents, config):
            seen.append(model)
            if model == p.MODEL:
                raise errors.APIError(429, {"error": {"message": "quota PerDay", "status": "RESOURCE_EXHAUSTED"}})

            class R:
                parsed = p.MediaObservation(usable=True, stage="slab_cast", stage_confidence=0.9, elements=[],
                                            defects=[], summary="ok")
                usage_metadata = None
                text = ""
            return R()

    class Client:
        models = Models()

    monkeypatch.setattr(p, "_gemini", lambda: Client())
    img = tmp_path / "a.jpg"
    img.write_bytes(jpg())
    obs = p.observe_media(img, "image/jpeg")
    assert obs.stage.value == "slab_cast"
    assert seen == [p.MODEL, "backup-model"]
    assert p.last_model() == "backup-model"


# ---- engineer link: the engineer signs, not the owner
def test_engineer_link_records_who_signed(monkeypatch):
    c = TestClient(main.app)
    body = check(c, "site_rebar.jpg", "m4")
    link = c.post(f"/api/updates/{body['id']}/engineer-link").json()
    monkeypatch.setenv("PAKKA_ACCESS_KEY", "k")  # the engineer has no access key; the link is the credential
    view = c.get(f"/api/engineer/{link['token']}").json()
    assert view["report"]["verdict"] == "needs_engineer" and view["media"]
    assert "voice" not in view and "consent" not in view and "capture" not in view
    assert c.post(f"/api/engineer/{link['token']}/signoff",
                  json={"engineer_name": "Er. K. Lakshmi", "decision": "approved"}).status_code == 422  # reg. no. required
    r = c.post(f"/api/engineer/{link['token']}/signoff",
               json={"engineer_name": "Er. K. Lakshmi", "registration_no": "TN-CE-20418", "decision": "approved",
                     "note": "OK to pour"})
    assert r.status_code == 200
    s = store.list_signoffs(update_id=body["id"])[0]
    assert s["channel"] == "engineer_link"
    assert store.milestone_verified_at("m4") is not None
    again = c.post(f"/api/engineer/{link['token']}/signoff",
                   json={"engineer_name": "Someone", "registration_no": "X-1", "decision": "rework"})
    assert again.status_code == 409  # one decision per link


def test_owner_entered_signoff_is_labelled():
    c = TestClient(main.app)
    body = check(c, "site_rebar.jpg", "m4")
    c.post(f"/api/updates/{body['id']}/signoff", json={"engineer_name": "Er. R", "decision": "approved"})
    assert store.list_signoffs(update_id=body["id"])[0]["channel"] == "owner_entered"


def test_no_engineer_link_for_checks_that_dont_need_one():
    c = TestClient(main.app)
    slab = check(c, "site_slab.jpg", "m5")
    assert c.post(f"/api/updates/{slab['id']}/engineer-link").status_code == 400
