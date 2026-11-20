from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import media as ingest_mod
from . import perception, rules, store
from .milestones import DEFAULT_PLAN, PLAN_BY_ID, milestone_for_claimed_stage
from .schemas import MediaObservation, Stage

MAX_FILES = 10
MAX_FILE_SIZE = 50 * 1024 * 1024        # 50 MB per file
MAX_TOTAL_SIZE = 80 * 1024 * 1024       # 80 MB per update
MAX_CLAIM_LENGTH = 300
READ_CHUNK = 1024 * 1024

# Rate limit for the only endpoint that costs money (Gemini calls).
RATE_LIMIT_COUNT = int(os.getenv("PAKKA_RATE_LIMIT", "20"))
RATE_LIMIT_WINDOW_S = 600

log = logging.getLogger("pakka.api")
app = FastAPI(title="PAKKA")
# No CORS middleware: the web app is served from the same origin (and via the Vite proxy in dev).

pool = ThreadPoolExecutor(max_workers=6)


# ---------------------------------------------------------------- access control

def _access_key() -> str:
    return os.getenv("PAKKA_ACCESS_KEY", "")


def require_access(request: Request):
    """If PAKKA_ACCESS_KEY is set (always on Cloud Run), every data endpoint needs it in X-Pakka-Key."""
    key = _access_key()
    if not key:
        return
    given = request.headers.get("x-pakka-key", "")
    if not hmac.compare_digest(given.encode(), key.encode()):
        raise HTTPException(401, "Access key required")


def _media_token(name: str) -> str:
    return hmac.new(_access_key().encode(), name.encode(), hashlib.sha256).hexdigest()[:32]


def _media_url(name: str) -> str:
    return f"/media/{name}?t={_media_token(name)}" if _access_key() else f"/media/{name}"


def _sign_body(body: dict) -> dict:
    """Stored bodies hold plain /media/<name> URLs; sign them on the way out."""
    body = dict(body)
    for key in ("media", "audio"):
        body[key] = [{**m, "url": _media_url(m["url"].split("/")[-1].split("?")[0])} for m in body.get(key) or []]
    return body


_rate_lock = threading.Lock()
_rate_hits: dict[str, deque] = defaultdict(deque)


def reset_rate_limits():
    with _rate_lock:
        _rate_hits.clear()


def rate_limit(request: Request):
    # Cloud Run's front end APPENDS the real client IP, so the rightmost entry is the trustworthy one.
    # The leftmost entries are whatever the client sent and would let a script rotate fake IPs.
    fwd = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    ip = fwd[-1] if fwd else (request.client.host if request.client else "unknown")
    now = time.monotonic()
    with _rate_lock:
        hits = _rate_hits[ip]
        while hits and now - hits[0] > RATE_LIMIT_WINDOW_S:
            hits.popleft()
        if len(hits) >= RATE_LIMIT_COUNT:
            raise HTTPException(429, "Too many checks from this connection. Wait a few minutes and try again")
        hits.append(now)


# ---------------------------------------------------------------- routes

def _reset_enabled() -> bool:
    return perception.is_mock() or os.getenv("PAKKA_DEMO_RESET") == "1"


@app.get("/api/health")
def health():
    return {"ok": True, "mock": perception.is_mock(), "model": perception.MODEL, "backend": perception.backend_name(),
            "access_key_required": bool(_access_key()), "demo_reset": _reset_enabled()}


@app.post("/api/demo/reset", dependencies=[Depends(require_access)])
def demo_reset():
    """Wipes records, photo fingerprints and the milestone ledger so the demo can be rehearsed.

    Only in mock mode or with PAKKA_DEMO_RESET=1: a real deployment must never forget what it has seen.
    """
    if not _reset_enabled():
        raise HTTPException(404)
    store.reset_all()
    reset_rate_limits()
    return {"ok": True}


@app.get("/api/plan")
def plan():
    return [m.model_dump() for m in DEFAULT_PLAN]


@app.get("/api/updates", dependencies=[Depends(require_access)])
def updates():
    return [_sign_body(b) for b in store.list_updates()]


_MEDIA_NAME = re.compile(r"^[a-f0-9]{8}_[A-Za-z0-9_]{1,32}\.[a-z0-9]{2,5}$")
_MEDIA_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    "Cache-Control": "private, max-age=3600",
}


@app.get("/media/{name}")
def get_media(name: str, t: str = Query("")):
    if not _MEDIA_NAME.match(name):
        raise HTTPException(404)
    if _access_key() and not hmac.compare_digest(t.encode(), _media_token(name).encode()):
        raise HTTPException(403)
    path = (store.MEDIA_DIR / name).resolve()
    if path.parent != store.MEDIA_DIR.resolve() or not path.is_file():
        raise HTTPException(404)
    ext = path.suffix.lower()
    mime = ingest_mod.VIDEO_MIME.get(ext) or ingest_mod.AUDIO_MIME.get(ext) or "image/jpeg"
    return FileResponse(path, media_type=mime, headers=_MEDIA_HEADERS)


def _read_limited(f: UploadFile, budget: int) -> bytes:
    """Reads in chunks so an oversized file is rejected before it's fully in memory."""
    limit = min(MAX_FILE_SIZE, budget)
    chunks, size = [], 0
    while chunk := f.file.read(READ_CHUNK):
        size += len(chunk)
        if size > MAX_FILE_SIZE:
            raise HTTPException(400, f"File {f.filename} exceeds {MAX_FILE_SIZE // (1024 * 1024)} MB limit")
        if size > limit:
            raise HTTPException(400, f"This update is larger than {MAX_TOTAL_SIZE // (1024 * 1024)} MB in total")
        chunks.append(chunk)
    return b"".join(chunks)


@app.post("/api/updates", dependencies=[Depends(require_access), Depends(rate_limit)])
def create_update(
    files: list[UploadFile] = File(...),
    milestone_id: Optional[str] = Form(None),
    amount_inr: Optional[int] = Form(None),
    claim_text: Optional[str] = Form(None),
):
    # 1. Upload hygiene
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Maximum {MAX_FILES} files allowed per update")

    claim_text = claim_text[:MAX_CLAIM_LENGTH].strip() if isinstance(claim_text, str) else None
    milestone_id = milestone_id if isinstance(milestone_id, str) else None
    amount_inr = amount_inr if isinstance(amount_inr, int) and amount_inr >= 0 else None

    # 2. Read, verify and normalise everything BEFORE writing anything to disk.
    budget = MAX_TOTAL_SIZE
    accepted: list[tuple[ingest_mod.Ingested, str]] = []
    for f in files:
        raw = _read_limited(f, budget)
        budget -= len(raw)
        try:
            item = ingest_mod.ingest(f.filename or "", raw, store.sha256_bytes(raw))
        except ingest_mod.RejectedUpload as e:
            raise HTTPException(400, str(e))
        safe_stem = re.sub(r"[^a-zA-Z0-9_]", "", Path(f.filename or "file").stem)[:32] or "media"
        accepted.append((item, safe_stem))

    if not any(i.kind != "audio" for i, _ in accepted):
        raise HTTPException(400, "Add at least one photo or video")

    visual: list[tuple[Path, str, ingest_mod.Ingested]] = []
    audio: list[tuple[Path, str]] = []
    for item, stem in accepted:
        dest = store.MEDIA_DIR / f"{uuid.uuid4().hex[:8]}_{stem}{item.ext}"
        dest.write_bytes(item.data)
        if item.kind == "audio":
            audio.append((dest, item.mime))
        else:
            visual.append((dest, item.mime, item))

    # 3. Understand the voice note. If the AI can't, the photos can still be checked.
    voice, voice_failed = None, False
    if audio:
        try:
            voice = perception.understand_voice(audio[0][0], audio[0][1])
        except perception.PerceptionError as e:
            log.warning("voice note failed: %s", e)
            voice_failed = True

    # 4. Resolve milestone (the amount is resolved by the rules engine)
    milestone = PLAN_BY_ID.get(milestone_id or "")
    if milestone is None and voice and voice.confidence >= rules.VOICE_MIN_CONF:
        milestone = milestone_for_claimed_stage(voice.claimed_stage)
    if milestone is None:
        msg = ("The voice note could not be understood. Pick the milestone being claimed" if voice_failed
               else "Pick the milestone being claimed, or add a voice note that names it")
        raise HTTPException(400, msg)

    claim = claim_text or (voice.translation_en if voice else milestone.name + " done")

    # 5. Integrity: a re-sent photo (earlier update OR twice in this one) is not new evidence.
    fingerprints: list[tuple[str, Optional[str], str]] = []
    precomputed: dict[int, MediaObservation] = {}

    def _duplicate(sent_at: str) -> MediaObservation:
        return MediaObservation(usable=False, quality_issue=f"Already sent on {sent_at}", stage=Stage.unknown,
                                stage_confidence=0.0, elements=[], defects=[],
                                summary=f"This photo looks the same as one already sent on {sent_at}.")

    for idx, (path, mime, item) in enumerate(visual):
        if item.kind != "image":
            continue
        dhash = store.compute_dhash(path)
        prev = store.find_duplicate_image(item.original_sha256, dhash)
        if prev is not None:
            precomputed[idx] = _duplicate(datetime.fromtimestamp(prev).strftime("%Y-%m-%d %H:%M"))
            continue
        in_batch = any(sha == item.original_sha256 or
                       (dhash and h and store.hamming_distance(dhash, h) <= store.DHASH_MAX_DISTANCE)
                       for sha, h, _ in fingerprints)
        if in_batch:
            precomputed[idx] = _duplicate("this same update")
            continue
        fingerprints.append((item.original_sha256, dhash, path.name))

    # 6. Observe media in parallel. Blind: the model is never told what the contractor claims.
    #    One failed photo becomes "can't be used"; only if every photo fails is the whole check a 502.
    def _observe(i: int):
        try:
            return i, perception.observe_media(visual[i][0], visual[i][1])
        except perception.PerceptionError as e:
            log.warning("observation %d failed: %s", i, e)
            return i, MediaObservation(usable=False, quality_issue="The AI couldn't analyse it. Try again in a minute",
                                       stage=Stage.unknown, stage_confidence=0.0, elements=[], defects=[],
                                       summary="Not analysed: the AI service did not answer.")

    todo = [idx for idx in range(len(visual)) if idx not in precomputed]
    failed = 0
    for idx, obs in pool.map(_observe, todo):
        precomputed[idx] = obs
        failed += obs.summary.startswith("Not analysed")
    if todo and failed == len(todo):
        raise HTTPException(502, "Couldn't reach the AI service. Nothing was decided. Try again in a minute")
    observations = [precomputed[i] for i in range(len(visual))]

    # 7. Rules engine decides (including whether this milestone was already verified before)
    report = rules.decide(milestone, observations, amount_inr, model_name=perception.MODEL,
                          previously_verified_at=store.milestone_verified_at(milestone.id),
                          voice=voice, voice_failed=voice_failed)

    for sha, dhash, fname in fingerprints:
        store.store_image_fingerprint(sha, dhash, fname)

    # 8. Store result with audit stamp
    body = {
        "milestone": milestone.model_dump(),
        "claim": claim,
        "media": [{"url": f"/media/{p.name}", "mime": m, "sha256": i.original_sha256} for p, m, i in visual],
        "audio": [{"url": f"/media/{p.name}", "mime": m} for p, m in audio],
        "voice": voice.model_dump() if voice else None,
        "observations": [o.model_dump() for o in observations],
        "report": report.model_dump(),
        "audit_stamp": report.audit_stamp.model_dump() if report.audit_stamp else None,
        "prompt_version": report.prompt_version,
    }
    body["id"] = store.save_update(body)
    if report.work_visible and report.verdict.value != "not_proven":
        store.mark_milestone_verified(milestone.id, body["id"])
    return _sign_body(body)


# Serve the built React app (copied to ./static by Dockerfile).
_static = Path(__file__).parent.parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="web")
