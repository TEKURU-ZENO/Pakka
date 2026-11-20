"""Capture-quality gate: dark or blurred photos never reach the model (rules v1.4.0)."""
import io
import os

from fastapi import UploadFile
from PIL import Image, ImageEnhance, ImageFilter

import app.perception as p
from app import main, media
from app.schemas import Verdict


def site_like(size=(800, 600)) -> Image.Image:
    # Detailed texture standing in for a real site photo (sharp edges everywhere)
    return Image.frombytes("L", size, os.urandom(size[0] * size[1])).convert("RGB")


def jpeg(img) -> bytes:
    b = io.BytesIO()
    img.save(b, "JPEG", quality=90)
    return b.getvalue()


def test_sharp_bright_photo_passes():
    assert media.quality_issue(jpeg(site_like())) is None


def test_dark_photo_is_rejected():
    assert "dark" in media.quality_issue(jpeg(ImageEnhance.Brightness(site_like()).enhance(0.08)))


def test_blurred_photo_is_rejected():
    assert "blurry" in media.quality_issue(jpeg(site_like().filter(ImageFilter.GaussianBlur(10))))


def test_bad_photo_never_reaches_gemini(monkeypatch):
    calls = []
    monkeypatch.setattr(p, "observe_media", lambda *a, **k: calls.append(1))
    dark = jpeg(ImageEnhance.Brightness(site_like()).enhance(0.08))
    r = main.create_update(files=[UploadFile(file=io.BytesIO(dark), filename="slab_night.jpg")], milestone_id="m5")
    assert calls == []
    assert r["report"]["verdict"] == Verdict.not_proven
    assert r["observations"][0]["usable"] is False
    assert any("daylight" in a for a in r["report"]["ask_next"])
