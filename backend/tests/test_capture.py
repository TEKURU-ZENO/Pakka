"""Mestri capture links: camera-time and location checks in plain code (rules v1.5.0)."""
import io
import os
import time
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.perception as p
from app import main, store
from app.schemas import Verdict

SITE = (13.0827, 80.2707)  # Chennai


@pytest.fixture(autouse=True)
def _mock(monkeypatch):
    monkeypatch.setattr(p, "MOCK", True)


def photo(taken: datetime | None = None) -> bytes:
    img = Image.frombytes("L", (320, 240), os.urandom(320 * 240)).convert("RGB")
    b = io.BytesIO()
    if taken:
        exif = Image.Exif()
        exif.get_ifd(0x8769)[0x9003] = taken.strftime("%Y:%m:%d %H:%M:%S")
        img.save(b, "JPEG", exif=exif)
    else:
        img.save(b, "JPEG")
    return b.getvalue()


def make_link(c, **kw):
    r = c.post("/api/capture-links", json={"milestone_id": "m5", "site_lat": SITE[0], "site_lng": SITE[1], **kw})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def submit(c, token, data, name="slab.jpg", **gps):
    return c.post(f"/api/capture/{token}", files={"files": (name, data, "image/jpeg")},
                  data={"consent": "true", **{k: str(v) for k, v in gps.items()}})


def latest():
    return store.list_updates()[0]


def test_mestri_sees_only_the_shot_list():
    c = TestClient(main.app)
    token = make_link(c)
    info = c.get(f"/api/capture/{token}").json()
    assert info["milestone_name"] == "Roof slab cast"
    assert info["shots"] and info["wants_location"] is True
    assert "last_update_id" not in info and "site_lat" not in info  # the site pin is never shown to the mestri


def test_on_site_submission_is_checked_and_mestri_gets_a_receipt():
    c = TestClient(main.app)
    token = make_link(c)
    r = submit(c, token, photo(datetime.now()), lat=SITE[0] + 0.0005, lng=SITE[1], accuracy_m=15)  # ~55 m away
    body = r.json()
    assert body["ok"] and "Owner will see the result" in body["message"].replace("owner", "Owner")
    assert "report" not in body  # the verdict goes to the owner, not the mestri
    u = latest()
    assert u["source"] == "capture_link"
    assert u["report"]["verdict"] == Verdict.proven
    assert any("Sent from the site" in f["text"] for f in u["report"]["findings"])
    assert main.list_capture_links()[0]["submissions"] == 1


def test_off_site_submission_cannot_prove_the_milestone():
    c = TestClient(main.app)
    token = make_link(c)
    submit(c, token, photo(datetime.now()), lat=SITE[0] + 0.05, lng=SITE[1], accuracy_m=20)  # ~5.6 km away
    u = latest()
    assert u["report"]["verdict"] == Verdict.not_proven
    assert u["report"]["findings"][0]["kind"] == "location"
    assert "km away" in u["report"]["findings"][0]["text"]
    assert store.milestone_verified_at("m5") is None  # never marked verified


def test_poor_gps_accuracy_gives_benefit_of_the_doubt():
    c = TestClient(main.app)
    token = make_link(c)
    submit(c, token, photo(datetime.now()), lat=SITE[0] + 0.004, lng=SITE[1], accuracy_m=400)  # ~445 m, +-400 m
    assert latest()["report"]["verdict"] == Verdict.proven


def test_recycled_photo_from_days_ago_is_rejected_before_the_ai():
    c = TestClient(main.app)
    token = make_link(c)
    old = datetime.fromtimestamp(time.time() - 6 * 86400)
    submit(c, token, photo(old), lat=SITE[0], lng=SITE[1])
    u = latest()
    assert u["observations"][0]["usable"] is False
    assert "days ago" in u["observations"][0]["quality_issue"]
    assert u["report"]["verdict"] == Verdict.not_proven


def test_missing_location_is_noted_not_punished():
    c = TestClient(main.app)
    token = make_link(c)
    submit(c, token, photo(datetime.now()))
    u = latest()
    assert u["report"]["verdict"] == Verdict.proven
    assert any("Location was not shared" in f["text"] for f in u["report"]["findings"])


def test_bad_or_expired_tokens(monkeypatch):
    c = TestClient(main.app)
    assert c.get("/api/capture/not-a-real-token-xxxxxx").status_code == 404
    token = make_link(c)
    monkeypatch.setattr(main.time, "time", lambda: 10 ** 11)
    assert c.get(f"/api/capture/{token}").status_code == 410


def test_owner_endpoints_need_the_access_key_but_the_mestri_link_does_not(monkeypatch):
    c = TestClient(main.app)
    token = make_link(c)
    monkeypatch.setenv("PAKKA_ACCESS_KEY", "k")
    assert c.post("/api/capture-links", json={"milestone_id": "m5"}).status_code == 401
    assert c.get("/api/capture-links").status_code == 401
    assert c.get(f"/api/capture/{token}").status_code == 200  # the token is the mestri's only credential
    assert submit(c, token, photo(datetime.now())).status_code == 200


def test_invalid_site_pin_is_refused():
    c = TestClient(main.app)
    r = c.post("/api/capture-links", json={"milestone_id": "m5", "site_lat": 123, "site_lng": 80})
    assert r.status_code == 400
