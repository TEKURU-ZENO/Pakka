"""Recorded payments (PAKKA never moves money), mestri receipt confirmation, ledger, release note (rules v1.6.0)."""
import io
import os
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.perception as p
from app import main, store


@pytest.fixture(autouse=True)
def _mock(monkeypatch):
    monkeypatch.setattr(p, "MOCK", True)


def jpg():
    b = io.BytesIO()
    Image.frombytes("L", (256, 256), os.urandom(65536)).convert("RGB").save(b, "JPEG")
    return b.getvalue()


def check(c, name, milestone):
    return c.post("/api/updates", files={"files": (name, jpg(), "image/jpeg")},
                  data={"milestone_id": milestone, "consent": "true"}).json()


def pay(c, milestone="m5", amount=250000, **kw):
    body = {"milestone_id": milestone, "amount_inr": amount, "method": "upi", "paid_on": date.today().isoformat(),
            "reference": "UPI-412345678901", **kw}
    return c.post("/api/payments", json=body)


def test_record_payment_after_verification_links_the_evidence():
    c = TestClient(main.app)
    slab = check(c, "site_slab.jpg", "m5")
    r = pay(c)
    assert r.status_code == 200
    body = r.json()
    assert body["flags"] == [] and body["update_id"] == slab["id"]
    assert body["receipt_path"].startswith("/#/receipt/")
    led = c.get("/api/ledger").json()
    row = next(m for m in led["milestones"] if m["milestone_id"] == "m5")
    assert row["paid_inr"] == 250000 and led["totals"]["paid"] == 250000
    assert sum(led["totals"][k] for k in ("verified", "awaiting_engineer", "not_verified")) == led["plan_total"]


def test_flags_warn_but_never_block():
    c = TestClient(main.app)
    early = pay(c, milestone="m6", amount=100000).json()  # nothing verified for brickwork
    assert early["flags"] == ["before_verification"]
    over = pay(c, milestone="m6", amount=150000).json()  # 1,00,000 + 1,50,000 > 2,00,000 planned
    assert "over_plan" in over["flags"]


def test_bad_payments_are_refused():
    c = TestClient(main.app)
    assert pay(c, milestone="m99").status_code == 400
    assert pay(c, amount=0).status_code == 422
    assert pay(c, method="crypto").status_code == 422
    assert pay(c, paid_on=(date.today() + timedelta(days=2)).isoformat()).status_code == 400
    assert pay(c, paid_on="2026-02-31").status_code == 400


def test_a_paid_stage_cannot_look_payable_again():
    c = TestClient(main.app)
    check(c, "site_slab.jpg", "m5")
    pay(c)
    again = check(c, "site_slab_again.jpg", "m5")
    assert again["report"]["verdict"] == "not_proven"
    assert "already paid" in again["report"]["findings"][0]["text"]


def test_mestri_confirms_receipt_once_and_cannot_change_the_amount(monkeypatch):
    c = TestClient(main.app)
    check(c, "site_slab.jpg", "m5")
    tok = pay(c).json()["receipt_path"].split("/")[-1]
    monkeypatch.setenv("PAKKA_ACCESS_KEY", "k")  # the mestri has no key; the receipt link is the credential
    info = c.get(f"/api/receipt/{tok}").json()
    assert info["amount_inr"] == 250000 and info["reference"] == "••8901"  # reference masked for the mestri
    assert "note" not in info and "id" not in info
    r = c.post(f"/api/receipt/{tok}", json={"response": "confirmed", "amount_inr": 999})  # extra fields are ignored
    assert r.status_code == 200
    assert store.list_payments()[0]["amount_inr"] == 250000
    assert c.post(f"/api/receipt/{tok}", json={"response": "disputed", "note": "x"}).status_code == 409


def test_dispute_needs_a_reason_and_shows_in_activity():
    c = TestClient(main.app)
    tok = pay(c, milestone="m2", amount=200000).json()["receipt_path"].split("/")[-1]
    assert c.post(f"/api/receipt/{tok}", json={"response": "disputed"}).status_code == 400
    c.post(f"/api/receipt/{tok}", json={"response": "disputed", "note": "Received only 1,50,000"})
    ev = c.get("/api/activity").json()
    rec = next(e for e in ev if e["kind"] == "receipt")
    assert rec["role"] == "mestri" and "disputed" in rec["text"] and "1,50,000" in rec["text"]
    payment = next(e for e in ev if e["kind"] == "payment")
    assert payment["role"] == "owner" and "before the work was verified" in payment["text"]


def test_release_note_bundles_payment_evidence_and_signoff():
    c = TestClient(main.app)
    chk = check(c, "site_rebar.jpg", "m4")
    eng = c.post(f"/api/updates/{chk['id']}/engineer-link").json()["token"]
    c.post(f"/api/engineer/{eng}/signoff", json={"engineer_name": "Er. K. Lakshmi", "registration_no": "TN-CE-1",
                                                 "decision": "approved"})
    pid = pay(c, milestone="m4", amount=150000).json()["id"]
    note = c.get(f"/api/payments/{pid}").json()
    assert note["payment"]["amount_inr"] == 150000 and note["payment"]["flags"] == []
    assert note["evidence"]["id"] == chk["id"]
    assert note["evidence"]["signoffs"][0]["channel"] == "engineer_link"
    assert note["rules_version"] and note["plan_version"]


def test_payment_endpoints_need_the_owner_key(monkeypatch):
    c = TestClient(main.app)
    pid = pay(c, milestone="m2", amount=1000).json()["id"]
    monkeypatch.setenv("PAKKA_ACCESS_KEY", "k")
    assert pay(c).status_code == 401
    assert c.get("/api/payments").status_code == 401
    assert c.get(f"/api/payments/{pid}").status_code == 401
    assert c.get("/api/receipt/not-a-real-token-xxxxx").status_code == 404
