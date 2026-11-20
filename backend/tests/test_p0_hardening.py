"""Regression tests for the P0 audit fixes (see AUDIT.md)."""
import io
import os

import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import app.perception as p
from app import main, store
from app.milestones import PLAN_BY_ID
from app.prompts import SITE_PROMPT
from app.rules import decide
from app.schemas import MediaObservation, Verdict


@pytest.fixture(autouse=True)
def _mock(monkeypatch):
    monkeypatch.setattr(p, "MOCK", True)


def _noise_jpeg(size=64, exif=None) -> bytes:
    img = Image.frombytes("L", (size, size), os.urandom(size * size)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", **({"exif": exif} if exif else {}))
    return buf.getvalue()


def _flat_canvas(color, label) -> bytes:
    img = Image.new("RGB", (400, 300), color)
    ImageDraw.Draw(img).text((30, 150), label, fill="white")
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()


def _up(data, name):
    return UploadFile(file=io.BytesIO(data), filename=name)


# ---- W1: flat images must not collide with each other
def test_different_flat_images_are_not_duplicates():
    r1 = main.create_update(files=[_up(_flat_canvas("#2d3748", "SLAB"), "site_slab.jpg")], milestone_id="m5")
    r2 = main.create_update(files=[_up(_flat_canvas("#742a2a", "HONEYCOMB"), "column_honeycomb.jpg")],
                            milestone_id="m3")
    assert r1["report"]["verdict"] == Verdict.proven
    assert r2["report"]["verdict"] == Verdict.needs_engineer
    assert store.compute_dhash(store.MEDIA_DIR / r1["media"][0]["url"].split("/")[-1]) is None


def test_exact_flat_resend_is_still_caught():
    img = _flat_canvas("#2d3748", "SLAB")
    main.create_update(files=[_up(img, "site_slab.jpg")], milestone_id="m5")
    r = main.create_update(files=[_up(img, "site_slab.jpg")], milestone_id="m6")
    assert r["report"]["verdict"] == Verdict.not_proven
    assert any("Already sent on" in f["text"] for f in r["report"]["findings"])


# ---- W2: duplicates inside one update, and repeat milestone claims
def test_same_photo_twice_in_one_update_counts_once():
    img = _noise_jpeg()
    r = main.create_update(files=[_up(img, "slab_1.jpg"), _up(img, "slab_2.jpg")], milestone_id="m5")
    assert [o["usable"] for o in r["observations"]] == [True, False]


def test_repeat_claim_for_verified_milestone_is_not_proven():
    first = main.create_update(files=[_up(_noise_jpeg(), "slab_a.jpg")], milestone_id="m5")
    second = main.create_update(files=[_up(_noise_jpeg(), "slab_b.jpg")], milestone_id="m5")
    assert first["report"]["verdict"] == Verdict.proven
    assert second["report"]["verdict"] == Verdict.not_proven
    assert second["report"]["findings"][0]["kind"] == "repeat"


def test_failed_claim_does_not_block_a_later_retake():
    main.create_update(files=[_up(_noise_jpeg(), "shuttering_a.jpg")], milestone_id="m5")  # not proven
    r = main.create_update(files=[_up(_noise_jpeg(), "slab_b.jpg")], milestone_id="m5")
    assert r["report"]["verdict"] == Verdict.proven


def test_rules_repeat_flag_is_pure():
    o = MediaObservation.model_validate_json((p.MOCK_DIR / "slab.json").read_text())
    assert decide(PLAN_BY_ID["m5"], [o], previously_verified_at=1.0).verdict == Verdict.not_proven
    assert decide(PLAN_BY_ID["m5"], [o]).verdict == Verdict.proven


# ---- S2 / M1: upload hardening
@pytest.mark.parametrize("name,data", [
    ("evil.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
    ("page.html", b"<html></html>"),
    ("fake.jpg", b"<svg><script>alert(1)</script></svg>"),
    ("fake.opus", b"not really audio"),
    ("fake.mp4", b"\x00" * 64),
])
def test_dangerous_or_fake_files_rejected(name, data):
    with pytest.raises(HTTPException) as e:
        main.create_update(files=[_up(data, name)], milestone_id="m5")
    assert e.value.status_code == 400


def test_images_are_reencoded_without_gps_and_capped():
    exif = Image.Exif()
    exif[0x8825] = {2: (12.0, 58.0, 0.0)}
    big = Image.frombytes("L", (3000, 2000), os.urandom(6_000_000)).convert("RGB")
    buf = io.BytesIO()
    big.save(buf, "PNG")
    r1 = main.create_update(files=[_up(_noise_jpeg(exif=exif), "slab_gps.jpg")], milestone_id="m5")
    r2 = main.create_update(files=[_up(buf.getvalue(), "plaster_big.png")], milestone_id="m7")
    with Image.open(store.MEDIA_DIR / r1["media"][0]["url"].split("/")[-1]) as im:
        assert not im.getexif().get_ifd(0x8825)
    stored = store.MEDIA_DIR / r2["media"][0]["url"].split("/")[-1]
    assert stored.suffix == ".jpg"
    with Image.open(stored) as im:
        assert max(im.size) <= 1600


# ---- S1: access key, signed media, rate limit
def test_access_key_and_signed_media(monkeypatch):
    client = TestClient(main.app)
    r = main.create_update(files=[_up(_noise_jpeg(), "slab.jpg")], milestone_id="m5")
    name = r["media"][0]["url"].split("/")[-1]

    monkeypatch.setenv("PAKKA_ACCESS_KEY", "s3cret")
    assert client.get("/api/updates").status_code == 401
    assert client.get("/api/updates", headers={"X-Pakka-Key": "wrong"}).status_code == 401
    listing = client.get("/api/updates", headers={"X-Pakka-Key": "s3cret"})
    assert listing.status_code == 200
    signed = listing.json()[0]["media"][0]["url"]
    assert "?t=" in signed
    assert client.get(f"/media/{name}").status_code == 403
    ok = client.get(signed)
    assert ok.status_code == 200
    assert ok.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in ok.headers["content-security-policy"]
    assert client.get("/media/..%2fpakka.db").status_code == 404


def test_rate_limit(monkeypatch):
    monkeypatch.setattr(main, "RATE_LIMIT_COUNT", 2)
    client = TestClient(main.app)
    codes = [client.post("/api/updates", files={"files": ("slab.jpg", _noise_jpeg(), "image/jpeg")},
                         data={"milestone_id": "m7"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


# ---- AI1: blind observation
def test_site_prompt_does_not_carry_the_claim():
    assert "{claim}" not in SITE_PROMPT
    SITE_PROMPT.format(kind="photo")  # only {kind} is templated


def test_demo_reset_only_when_enabled(monkeypatch):
    client = TestClient(main.app)
    main.create_update(files=[_up(_noise_jpeg(), "slab.jpg")], milestone_id="m5")
    monkeypatch.setattr(p, "MOCK", False)
    monkeypatch.delenv("PAKKA_MOCK", raising=False)
    monkeypatch.delenv("PAKKA_DEMO_RESET", raising=False)
    assert client.post("/api/demo/reset").status_code == 404
    assert store.milestone_verified_at("m5") is not None
    monkeypatch.setenv("PAKKA_DEMO_RESET", "1")
    assert client.post("/api/demo/reset").status_code == 200
    assert store.milestone_verified_at("m5") is None and store.list_updates() == []


def test_rate_limit_ignores_spoofed_forwarded_for(monkeypatch):
    monkeypatch.setattr(main, "RATE_LIMIT_COUNT", 1)
    client = TestClient(main.app)
    codes = [client.post("/api/updates", files={"files": ("plaster.jpg", _noise_jpeg(), "image/jpeg")},
                         data={"milestone_id": "m7"},
                         headers={"X-Forwarded-For": f"10.0.0.{i}, 203.0.113.7"}).status_code for i in range(2)]
    assert codes == [200, 429]
