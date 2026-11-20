import os
from pathlib import Path
import pytest

from app.perception import (
    guess_mime,
    observe_media,
    understand_voice,
    _mock_observation,
    _mock_voice,
)
from app.schemas import Stage, DefectType, Severity


def test_mimetypes_mapping():
    assert guess_mime(Path("audio.opus")) == "audio/ogg"
    assert guess_mime(Path("audio.ogg")) == "audio/ogg"
    assert guess_mime(Path("audio.m4a")) == "audio/mp4"
    assert guess_mime(Path("audio.aac")) == "audio/aac"
    assert guess_mime(Path("site.webm")) == "video/webm"
    assert guess_mime(Path("site.mov")) == "video/quicktime"
    assert guess_mime(Path("site.heic")) == "image/heic"


def test_mock_observation_by_keyword(monkeypatch):
    monkeypatch.setenv("PAKKA_MOCK", "1")
    # Force reload or test mock function directly
    obs_shuttering = _mock_observation(Path("my_shuttering_photo.jpg"))
    assert obs_shuttering.stage == Stage.slab_shuttering
    assert obs_shuttering.usable is True

    obs_slab = _mock_observation(Path("site_slab_cast.png"))
    assert obs_slab.stage == Stage.slab_cast

    obs_honeycomb = _mock_observation(Path("honeycomb_defect.jpg"))
    assert any(d.defect == DefectType.honeycombing for d in obs_honeycomb.defects)

    obs_blurry = _mock_observation(Path("blurry_image.jpg"))
    assert obs_blurry.usable is False
    assert obs_blurry.quality_issue is not None


def test_mock_voice(monkeypatch):
    monkeypatch.setenv("PAKKA_MOCK", "1")
    voice = _mock_voice(Path("contractor_voice.opus"))
    assert voice.language == "Tamil"
    assert voice.claimed_stage == Stage.slab_cast
    assert voice.amount_requested_inr == 250000


def test_observe_media_and_understand_voice_with_mock(monkeypatch):
    # Ensure PAKKA_MOCK in perception module reflects mock behavior
    import app.perception as p
    monkeypatch.setattr(p, "MOCK", True)

    obs = p.observe_media(Path("site_slab.jpg"))
    assert obs.stage == Stage.slab_cast

    voice = p.understand_voice(Path("mestri_voice.opus"))
    assert voice.amount_requested_inr == 250000
