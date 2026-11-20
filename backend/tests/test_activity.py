"""Owner activity log: built only from stored records; each event carries the right role."""
import io
import os
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.perception as p
from app import main, store


@pytest.fixture(autouse=True)
def _mock(monkeypatch):
    monkeypatch.setattr(p, "MOCK", True)


def jpg(taken=None):
    img = Image.frombytes("L", (256, 256), os.urandom(65536)).convert("RGB")
    b = io.BytesIO()
    if taken:
        exif = Image.Exif()
        exif.get_ifd(0x8769)[0x9003] = taken.strftime("%Y:%m:%d %H:%M:%S")
        img.save(b, "JPEG", exif=exif)
    else:
        img.save(b, "JPEG")
    return b.getvalue()


def test_mestri_capture_and_engineer_signoff_appear_with_the_right_roles():
    c = TestClient(main.app)
    tok = c.post("/api/capture-links", json={"milestone_id": "m4"}).json()["token"]
    r = c.post(f"/api/capture/{tok}", files={"files": ("rebar.jpg", jpg(datetime.now()), "image/jpeg")}, data={"consent": "true"})
    assert r.status_code == 200
    check = store.list_updates()[0]
    assert check["source"] == "capture_link"  # stored at creation, not inferred later
    eng = c.post(f"/api/updates/{check['id']}/engineer-link").json()["token"]
    c.post(f"/api/engineer/{eng}/signoff", json={"engineer_name": "Er. K. Lakshmi", "registration_no": "TN-CE-1",
                                                 "decision": "approved"})
    ev = c.get("/api/activity").json()
    kinds = {e["kind"]: e for e in ev}
    assert kinds["check"]["role"] == "mestri" and "via capture link" in kinds["check"]["text"]
    assert kinds["signoff"]["role"] == "engineer" and "signed via engineer link" in kinds["signoff"]["text"]
    assert kinds["capture_link"]["role"] == "owner" and kinds["engineer_link"]["role"] == "owner"
    assert [e["at"] for e in ev] == sorted((e["at"] for e in ev), reverse=True)  # newest first


def test_owner_upload_and_owner_entered_signoff_roles():
    c = TestClient(main.app)
    body = c.post("/api/updates", files={"files": ("site_rebar.jpg", jpg(), "image/jpeg")},
                  data={"milestone_id": "m4", "consent": "true"}).json()
    assert body["source"] == "owner_upload"
    c.post(f"/api/updates/{body['id']}/signoff", json={"engineer_name": "Er. R", "decision": "approved"})
    ev = {e["kind"]: e for e in c.get("/api/activity").json()}
    assert ev["check"]["role"] == "owner"
    assert ev["signoff"]["role"] == "owner" and "entered by the owner" in ev["signoff"]["text"]


def test_share_revocation_is_recorded_and_still_blocks_access():
    c = TestClient(main.app)
    t = c.post("/api/share-links", json={"label": "Appa"}).json()["token"]
    c.delete(f"/api/share-links/{t}")
    assert c.get(f"/api/share/{t}").status_code == 404  # access check unchanged
    assert store.list_share_links() == []  # owner's list shows active links only
    revoked = [l for l in store.list_share_links(include_revoked=True) if l["token"] == t][0]
    assert revoked["revoked"]  # the field is written when the revocation happens
    kinds = [e["kind"] for e in c.get("/api/activity").json()]
    assert kinds[:2] == ["share_revoked", "share_link"]


def test_activity_needs_the_owner_key(monkeypatch):
    monkeypatch.setenv("PAKKA_ACCESS_KEY", "k")
    c = TestClient(main.app)
    assert c.get("/api/activity").status_code == 401
    assert c.get("/api/activity", headers={"X-Pakka-Key": "k"}).status_code == 200


def test_records_without_a_source_are_not_guessed():
    c = TestClient(main.app)
    body = c.post("/api/updates", files={"files": ("site_slab.jpg", jpg(), "image/jpeg")},
                  data={"milestone_id": "m5", "consent": "true"}).json()
    raw = store.get_update(body["id"])
    raw.pop("source")
    with store._lock:
        store._db.execute("UPDATE updates SET body = ? WHERE id = ?", (__import__("json").dumps(raw), body["id"]))
        store._db.commit()
    ev = [e for e in c.get("/api/activity").json() if e["kind"] == "check"][0]
    assert ev["role"] is None and "source not recorded" in ev["text"]
