from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import perception, rules, store
from .milestones import DEFAULT_PLAN, PLAN_BY_ID, PLAN_BY_STAGE

app = FastAPI(title="PAKKA")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=store.MEDIA_DIR), name="media")

pool = ThreadPoolExecutor(max_workers=6)


@app.get("/api/health")
def health():
    return {"ok": True, "mock": perception.MOCK, "model": perception.MODEL}


@app.get("/api/plan")
def plan():
    return [m.model_dump() for m in DEFAULT_PLAN]


@app.get("/api/updates")
def updates():
    return store.list_updates()


@app.post("/api/updates")
async def create_update(
    files: list[UploadFile] = File(...),
    milestone_id: Optional[str] = Form(None),
    amount_inr: Optional[int] = Form(None),
    claim_text: Optional[str] = Form(None),
):
    visual, audio = [], []
    for f in files:
        ext = Path(f.filename or "").suffix.lower() or ".bin"
        dest = store.MEDIA_DIR / f"{uuid.uuid4().hex[:8]}_{Path(f.filename or 'file').stem}{ext}"
        dest.write_bytes(await f.read())
        mime = perception.guess_mime(dest)
        (audio if mime.startswith("audio") else visual).append((dest, mime))

    if not visual:
        raise HTTPException(400, "Add at least one photo or video")

    # Voice note first: it can tell us which milestone is being claimed and the amount.
    voice = perception.understand_voice(audio[0][0]) if audio else None
    milestone = PLAN_BY_ID.get(milestone_id or "")
    if milestone is None and voice and voice.claimed_stage in PLAN_BY_STAGE:
        milestone = PLAN_BY_STAGE[voice.claimed_stage]
    if milestone is None:
        raise HTTPException(400, "Pick the milestone being claimed, or add a voice note that names it")
    amount = amount_inr if amount_inr is not None else (voice.amount_requested_inr if voice else None)
    claim = claim_text or (voice.translation_en if voice else milestone.name + " done")

    # Photos and videos are observed in parallel.
    observations = list(pool.map(lambda pm: perception.observe_media(pm[0], claim), visual))
    report = rules.decide(milestone, observations, amount)

    body = {
        "milestone": milestone.model_dump(),
        "claim": claim,
        "media": [{"url": f"/media/{p.name}", "mime": m} for p, m in visual],
        "audio": [{"url": f"/media/{p.name}", "mime": m} for p, m in audio],
        "voice": voice.model_dump() if voice else None,
        "observations": [o.model_dump() for o in observations],
        "report": report.model_dump(),
        "prompt_version": report.prompt_version,
    }
    body["id"] = store.save_update(body)
    return body


# Serve the built React app (copied to ./static by the Dockerfile).
_static = Path(__file__).parent.parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="web")
