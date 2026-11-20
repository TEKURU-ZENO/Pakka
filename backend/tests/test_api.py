import io
import time
from pathlib import Path
from PIL import Image
import pytest
from fastapi import HTTPException, UploadFile

from app.main import plan, updates, create_update
from app.schemas import Verdict
import app.perception as p


def test_get_plan():
    res = plan()
    assert len(res) == 8
    assert res[0]["id"] == "m1"
    assert res[4]["id"] == "m5"


def test_get_updates():
    res = updates()
    assert isinstance(res, list)


def test_upload_hygiene_validation():
    # 1. Reject unsupported file extension
    bad_upload = UploadFile(file=io.BytesIO(b"binary content"), filename="malicious.exe")
    with pytest.raises(HTTPException) as excinfo:
        create_update(files=[bad_upload], milestone_id="m5")
    assert excinfo.value.status_code == 400
    assert "Unsupported file type" in excinfo.value.detail

    # 2. Reject missing visual files (only audio uploaded)
    audio_upload = UploadFile(file=io.BytesIO(b"audio content"), filename="mestri_voice.opus")
    with pytest.raises(HTTPException) as excinfo2:
        create_update(files=[audio_upload], milestone_id="m5")
    assert excinfo2.value.status_code == 400
    assert "Add at least one photo or video" in excinfo2.value.detail

    # 3. Reject more than 10 files
    too_many = [UploadFile(file=io.BytesIO(b"data"), filename=f"photo_{i}.jpg") for i in range(11)]
    with pytest.raises(HTTPException) as excinfo3:
        create_update(files=too_many, milestone_id="m5")
    assert excinfo3.value.status_code == 400
    assert "Maximum 10 files allowed" in excinfo3.value.detail


def test_duplicate_photo_integrity_check(monkeypatch):
    """Exit check: you upload the same photo twice, and the second time it doesn't count as evidence."""
    monkeypatch.setattr(p, "MOCK", True)
    monkeypatch.setenv("PAKKA_MOCK", "1")

    # Generate unique in-memory patterned image based on current timestamp
    t = int(time.time() * 1000) % 256
    img = Image.new("RGB", (100, 100))
    for x in range(100):
        for y in range(100):
            img.putpixel((x, y), ((x * 3 + t) % 256, (y * 5 + t) % 256, (x + y + t) % 256))

    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    img_bytes = buf.getvalue()

    # 1. First upload: evidence accepted
    upload_1 = UploadFile(file=io.BytesIO(img_bytes), filename="photo_slab_first.jpg")
    res_1 = create_update(files=[upload_1], milestone_id="m5", amount_inr=250000)
    assert res_1["report"]["verdict"] == Verdict.proven
    assert any(f["kind"] == "ok" for f in res_1["report"]["findings"])

    # Audit stamp verified
    assert "audit_stamp" in res_1
    assert res_1["audit_stamp"]["human_decides_payment"] is True
    assert "thresholds" in res_1["audit_stamp"]
    assert res_1["audit_stamp"]["rules_version"] == "1.0.0"

    # 2. Second upload with SAME photo pattern (different filename)
    upload_2 = UploadFile(file=io.BytesIO(img_bytes), filename="photo_slab_reuploaded.jpg")
    res_2 = create_update(files=[upload_2], milestone_id="m5", amount_inr=250000)

    # It MUST NOT count as evidence; verdict becomes not_proven
    assert res_2["report"]["verdict"] == Verdict.not_proven
    # Finding must flag duplicate rejection
    assert any("Already sent on" in f["text"] for f in res_2["report"]["findings"])
    assert any(f["kind"] == "unclear" for f in res_2["report"]["findings"])
