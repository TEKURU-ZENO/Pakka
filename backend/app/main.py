from __future__ import annotations

import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import perception, rules, store
from .milestones import DEFAULT_PLAN, PLAN_BY_ID, PLAN_BY_STAGE
from .schemas import MediaObservation, Stage

MAX_FILES = 10
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_CLAIM_LENGTH = 300

app = FastAPI(title="PAKKA")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=store.MEDIA_DIR), name="media")

pool = ThreadPoolExecutor(max_workers=6)


@app.get("/api/health")
def health():
    return {"ok": True, "mock": perception.is_mock(), "model": perception.MODEL}


@app.get("/api/plan")
def plan():
    return [m.model_dump() for m in DEFAULT_PLAN]


@app.get("/api/updates")
def updates():
    return store.list_updates()


@app.post("/api/updates")
def create_update(
    files: list[UploadFile] = File(...),
    milestone_id: Optional[str] = Form(None),
    amount_inr: Optional[int] = Form(None),
    claim_text: Optional[str] = Form(None),
):
    # 1. Validate upload hygiene
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Maximum {MAX_FILES} files allowed per update")

    claim_text = claim_text[:MAX_CLAIM_LENGTH].strip() if isinstance(claim_text, str) else None
    milestone_id = milestone_id if isinstance(milestone_id, str) else None
    amount_inr = amount_inr if isinstance(amount_inr, int) else None

    visual: list[tuple[Path, str]] = []
    audio: list[tuple[Path, str]] = []

    # 2. Save with sanitized paths (never serve user-controlled paths)
    for f in files:
        raw_ext = Path(f.filename or "").suffix.lower() or ".bin"
        # Validate mime type
        mime = perception.guess_mime(Path(f"test{raw_ext}"))
        if not (mime.startswith("image/") or mime.startswith("video/") or mime.startswith("audio/")):
            raise HTTPException(400, f"Unsupported file type: {raw_ext}. Upload photos, videos or voice notes only.")

        content = f.file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, f"File {f.filename} exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit")

        safe_stem = re.sub(r"[^a-zA-Z0-9_]", "", Path(f.filename or "file").stem)[:32] or "media"
        dest = store.MEDIA_DIR / f"{uuid.uuid4().hex[:8]}_{safe_stem}{raw_ext}"
        dest.write_bytes(content)

        # 3. Split voice note from photos/videos
        if mime.startswith("audio/"):
            audio.append((dest, mime))
        else:
            visual.append((dest, mime))

    if not visual:
        raise HTTPException(400, "Add at least one photo or video")

    # 4. Understand voice note
    voice = perception.understand_voice(audio[0][0]) if audio else None

    # 5. Resolve milestone and amount
    milestone = PLAN_BY_ID.get(milestone_id or "")
    if milestone is None and voice and voice.claimed_stage in PLAN_BY_STAGE:
        milestone = PLAN_BY_STAGE[voice.claimed_stage]
    if milestone is None:
        raise HTTPException(400, "Pick the milestone being claimed, or add a voice note that names it")

    amount = amount_inr if amount_inr is not None else (voice.amount_requested_inr if voice else None)
    claim = claim_text or (voice.translation_en if voice else milestone.name + " done")

    # 6. Integrity check: Fraud detection via perceptual hash (dHash)
    hashes_to_store: list[tuple[str, str]] = []
    precomputed_observations: dict[int, MediaObservation] = {}

    for idx, (path, mime) in enumerate(visual):
        if mime.startswith("image/"):
            h = store.compute_dhash(path)
            if h:
                dup = store.find_duplicate_image(h, max_distance=6)
                if dup:
                    _, prev_time = dup
                    prev_date = datetime.fromtimestamp(prev_time).strftime("%Y-%m-%d %H:%M")
                    # Duplicate fraud: mark unusable, do NOT invoke Gemini
                    precomputed_observations[idx] = MediaObservation(
                        usable=False,
                        quality_issue=f"Already sent on {prev_date}",
                        stage=Stage.unknown,
                        stage_confidence=0.0,
                        elements=[],
                        defects=[],
                        summary=f"Duplicate photo detected: already submitted on {prev_date}.",
                    )
                else:
                    hashes_to_store.append((h, path.name))

    # 7. Observe media in parallel (only non-duplicate media)
    items_to_observe = [(idx, visual[idx]) for idx in range(len(visual)) if idx not in precomputed_observations]
    if items_to_observe:
        observed = list(pool.map(lambda item: (item[0], perception.observe_media(item[1][0], claim)), items_to_observe))
        for idx, obs in observed:
            precomputed_observations[idx] = obs

    observations = [precomputed_observations[i] for i in range(len(visual))]

    # 8. Run rules engine with Audit Stamp
    report = rules.decide(milestone, observations, amount, model_name=perception.MODEL)

    # Store image hashes for approved new images
    for h, fname in hashes_to_store:
        store.store_image_hash(h, fname)

    # 9. Store result with audit stamp
    body = {
        "milestone": milestone.model_dump(),
        "claim": claim,
        "media": [{"url": f"/media/{p.name}", "mime": m} for p, m in visual],
        "audio": [{"url": f"/media/{p.name}", "mime": m} for p, m in audio],
        "voice": voice.model_dump() if voice else None,
        "observations": [o.model_dump() for o in observations],
        "report": report.model_dump(),
        "audit_stamp": report.audit_stamp.model_dump() if report.audit_stamp else None,
        "prompt_version": report.prompt_version,
    }
    body["id"] = store.save_update(body)
    return body


# Serve the built React app (copied to ./static by Dockerfile).
_static = Path(__file__).parent.parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="web")
