from __future__ import annotations

import hashlib
import hmac
import logging
import math
import os
import secrets
import re
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import media as ingest_mod
from . import live, perception, rules, store
from .milestones import DEFAULT_PLAN, LOCKED_GATES, claimed_stage_milestone, current_by_id, current_plan, plan_version
from .schemas import CaptureCheck, MediaObservation, Stage

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
    if body.get("id"):
        body["signoffs"] = store.list_signoffs(update_id=body["id"])
    for key in ("media", "audio"):
        body[key] = [{**m, "url": _media_url(m["url"].split("/")[-1].split("?")[0])} for m in body.get(key) or []]
    return body


_rate_lock = threading.Lock()
_rate_hits: dict[str, deque] = defaultdict(deque)


def reset_rate_limits():
    with _rate_lock:
        _rate_hits.clear()


def _client_ip(headers, client) -> str:
    # Cloud Run's front end APPENDS the real client IP, so the rightmost entry is the trustworthy one.
    # The leftmost entries are whatever the client sent and would let a script rotate fake IPs.
    fwd = [h.strip() for h in headers.get("x-forwarded-for", "").split(",") if h.strip()]
    return fwd[-1] if fwd else (client.host if client else "unknown")


def rate_limit(request: Request):
    _count_hit(_client_ip(request.headers, request.client))


def _count_hit(ip: str):
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
    return [{**m.model_dump(), "gate_locked": m.id in LOCKED_GATES} for m in current_plan()]


@app.put("/api/plan/{milestone_id}", dependencies=[Depends(require_access)])
def edit_plan(milestone_id: str, amount_inr: Optional[int] = Body(None, ge=1000, le=100_000_000),
              engineer_gate: Optional[bool] = Body(None)):
    """Owner edits the agreed amounts, and may add (never remove) engineer gates."""
    if milestone_id not in current_by_id():
        raise HTTPException(404, "Unknown milestone")
    if engineer_gate is False and milestone_id in LOCKED_GATES:
        raise HTTPException(400, "This stage always needs an engineer sign-off. The gate can't be removed")
    store.set_plan_override(milestone_id, amount_inr, engineer_gate)
    return plan()


def _ledger() -> dict:
    """Money view of the plan. Purely factual: PAKKA reports what is verified; the owner decides what to pay."""
    verified = store.verified_milestones()
    updates = store.list_updates()
    latest = {}
    for u in updates:  # newest first
        latest.setdefault(u["report"]["milestone_id"], u)
    rows, totals = [], {"verified": 0, "awaiting_engineer": 0, "not_verified": 0}
    paid_by = {}
    for p in store.list_payments():
        paid_by.setdefault(p["milestone_id"], []).append(p)
    for m in current_plan():
        u = latest.get(m.id)
        if m.id in verified:
            status = "verified"
        elif u and u["report"]["verdict"] == "needs_engineer":
            status = "awaiting_engineer"
        else:
            status = "not_verified"
        totals[status] += m.amount_inr
        pays = paid_by.get(m.id, [])
        rows.append({"milestone_id": m.id, "name": m.name, "amount_inr": m.amount_inr, "engineer_gate": m.engineer_gate,
                     "status": status, "verified_at": verified.get(m.id),
                     "paid_inr": sum(p["amount_inr"] for p in pays),
                     "payments": [{"id": p["id"], "amount_inr": p["amount_inr"], "paid_on": p["paid_on"],
                                   "receipt_status": p["receipt_status"], "flags": p["flags"]} for p in pays],
                     "last_check": {"id": u["id"], "verdict": u["report"]["verdict"], "created": u["created"]} if u else None})
    totals["paid"] = sum(r["paid_inr"] for r in rows)  # recorded by the owner; not part of the status split
    return {"milestones": rows, "totals": totals, "plan_total": sum(r["amount_inr"] for r in rows),
            "plan_version": plan_version()}


@app.get("/api/ledger", dependencies=[Depends(require_access)])
def ledger():
    return _ledger()


@app.get("/api/updates", dependencies=[Depends(require_access)])
def updates():
    return [_sign_body(b) for b in store.list_updates()]


_MEDIA_NAME = re.compile(r"^[a-f0-9]{8}_[A-Za-z0-9_]{1,32}\.[a-z0-9]{2,5}$")
_MEDIA_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    "Cache-Control": "private, max-age=3600",
}


@app.get("/api/brief", dependencies=[Depends(require_access)])
def brief():
    """Exactly what the voice assistant is allowed to know: built from verified records, in plain code."""
    return {"brief": live.site_brief(), "live_model": live.LIVE_MODEL}


@app.post("/api/ask", dependencies=[Depends(require_access), Depends(rate_limit)])
def ask(question: str = Body(..., embed=True, max_length=500)):
    """Text fallback for 'Ask your site' when voice isn't available."""
    return live.ask_text(question)


# Browsers can't set headers on a WebSocket. Instead of putting the access key in the URL (and so in request
# logs), the app first asks for a ticket over a normal authenticated request, then opens the socket with it.
# Tickets live 60 s and work once.
LIVE_TICKET_TTL_S = 60
_tickets: dict[str, float] = {}
_tickets_lock = threading.Lock()


@app.post("/api/live-ticket", dependencies=[Depends(require_access)])
def live_ticket():
    t = secrets.token_urlsafe(24)
    now = time.time()
    with _tickets_lock:
        for k in [k for k, exp in _tickets.items() if exp < now]:
            _tickets.pop(k, None)
        _tickets[t] = now + LIVE_TICKET_TTL_S
    return {"ticket": t, "expires_in": LIVE_TICKET_TTL_S}


def _redeem_ticket(t: str) -> bool:
    with _tickets_lock:
        exp = _tickets.pop(t or "", None)
    return exp is not None and exp >= time.time()


@app.websocket("/api/live")
async def live_socket(ws: WebSocket, ticket: str = Query("")):
    """Owner voice Q&A over Gemini Live. Authorised by a single-use ticket from /api/live-ticket."""
    if _access_key() and not _redeem_ticket(ticket):
        await ws.close(code=4401)
        return
    try:
        _count_hit(_client_ip(ws.headers, ws.client))
    except HTTPException:
        await ws.close(code=4429)
        return
    await ws.accept()
    try:
        await live.bridge(ws)
    except WebSocketDisconnect:
        pass


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
    consent: Optional[bool] = Form(None),
):
    c = {"given": True, "by": "owner", "at": time.time(), "text": CONSENT_VERSION} if consent else None
    return _sign_body(run_check(files, milestone_id, amount_inr, claim_text, consent=c))


MAX_PHOTO_AGE_S = 48 * 3600  # through a capture link, a camera photo older than this is a recycled photo


def run_check(files, milestone_id, amount_inr, claim_text, capture: Optional[dict] = None,
              consent: Optional[dict] = None) -> dict:
    """The one check pipeline, shared by owner uploads and mestri capture links.
    `capture` = {"token", "received_at", "lat", "lng", "accuracy_m", "link"} for capture-link submissions."""
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
    milestone = current_by_id().get(milestone_id or "")
    if milestone is None and voice and voice.confidence >= rules.VOICE_MIN_CONF:
        milestone = claimed_stage_milestone(voice.claimed_stage)
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
        # Capture links promise "taken now": a camera photo from days ago is recycled evidence.
        if capture and item.taken_at and capture["received_at"] - item.taken_at > MAX_PHOTO_AGE_S:
            days = (capture["received_at"] - item.taken_at) / 86400
            precomputed[idx] = MediaObservation(
                usable=False, quality_issue=f"This photo was taken about {days:.0f} days ago. Send a photo taken today",
                stage=Stage.unknown, stage_confidence=0.0, elements=[], defects=[],
                summary="Not sent to the AI: the camera time shows an old photo.")
            continue
        # Capture-quality gate in plain code: a dark or blurred photo is never sent to the model to guess from.
        issue = ingest_mod.quality_issue(item.data)
        if issue:
            precomputed[idx] = MediaObservation(usable=False, quality_issue=issue, stage=Stage.unknown,
                                                stage_confidence=0.0, elements=[], defects=[],
                                                summary="Not sent to the AI: the photo failed the capture-quality check.")
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
    _models_used: list[str] = []

    def _observe(i: int):
        try:
            obs = perception.observe_media(visual[i][0], visual[i][1])
            _models_used.append(perception.last_model())
            return i, obs
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
    check = None
    if capture:
        link = capture["link"]
        pinned = link.get("site_lat") is not None and link.get("site_lng") is not None
        dist = (_haversine_m(link["site_lat"], link["site_lng"], capture["lat"], capture["lng"])
                if pinned and capture.get("lat") is not None and capture.get("lng") is not None else None)
        check = CaptureCheck(distance_m=dist, accuracy_m=capture.get("accuracy_m"), radius_m=link.get("radius_m") or 200.0,
                             site_pinned=pinned)
    report = rules.decide(milestone, observations, amount_inr, model_name=perception.MODEL,
                          previously_verified_at=store.milestone_verified_at(milestone.id),
                          previously_paid=_paid_summary(milestone.id),
                          voice=voice, voice_failed=voice_failed, capture=check)
    if report.audit_stamp:
        report.audit_stamp.plan_version = plan_version()
        used = sorted({m for m in _models_used if m})
        if used:
            report.audit_stamp.model = " + ".join(used)
        elif perception.is_mock():
            report.audit_stamp.model = "mock (canned answers, no AI call)"

    for sha, dhash, fname in fingerprints:
        store.store_image_fingerprint(sha, dhash, fname)

    # 8. Store result with audit stamp
    body = {
        "milestone": milestone.model_dump(),
        "claim": claim,
        "media": [{"url": f"/media/{p.name}", "mime": m, "sha256": i.original_sha256, "taken_at": i.taken_at}
                  for p, m, i in visual],
        "audio": [{"url": f"/media/{p.name}", "mime": m} for p, m in audio],
        "voice": voice.model_dump() if voice else None,
        "observations": [o.model_dump() for o in observations],
        "report": report.model_dump(),
        "audit_stamp": report.audit_stamp.model_dump() if report.audit_stamp else None,
        "prompt_version": report.prompt_version,
        "source": "capture_link" if capture else "owner_upload",
    }
    if capture:
        body["capture"] = {"token": capture["token"], "received_at": capture["received_at"],
                           "lat": capture.get("lat"), "lng": capture.get("lng"), "accuracy_m": capture.get("accuracy_m"),
                           "distance_m": check.distance_m if check else None}
    body["consent"] = consent or {"given": None, "by": "owner"}
    body["id"] = store.save_update(body)
    if report.work_visible and report.verdict.value == "proven":
        store.mark_milestone_verified(milestone.id, body["id"])
    _maybe_purge()
    return body


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- mestri capture links
CAPTURE_TTL_S = 7 * 24 * 3600


def _valid_coord(lat, lng) -> bool:
    return lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180


@app.post("/api/capture-links", dependencies=[Depends(require_access)])
def create_capture_link(
    milestone_id: str = Body(...),
    amount_inr: Optional[int] = Body(None),
    site_lat: Optional[float] = Body(None),
    site_lng: Optional[float] = Body(None),
    radius_m: float = Body(200.0, ge=50, le=2000),
):
    """Owner creates a one-milestone link to send the mestri (e.g. on WhatsApp). The token is the only credential."""
    if milestone_id not in current_by_id():
        raise HTTPException(400, "Unknown milestone")
    if (site_lat is None) != (site_lng is None) or (site_lat is not None and not _valid_coord(site_lat, site_lng)):
        raise HTTPException(400, "Site pin must be a valid latitude and longitude")
    token = secrets.token_urlsafe(16)
    link = store.create_capture_link(token, milestone_id, amount_inr if (amount_inr or 0) > 0 else None,
                                     site_lat, site_lng, radius_m, CAPTURE_TTL_S)
    return {**_public_link(link), "token": token, "path": f"/#/capture/{token}"}


@app.get("/api/capture-links", dependencies=[Depends(require_access)])
def list_capture_links():
    return [{**_public_link(l), "token": l["token"], "path": f"/#/capture/{l['token']}"} for l in store.list_capture_links()]


def _public_link(link: dict) -> dict:
    m = current_by_id()[link["milestone_id"]]
    return {"milestone_id": m.id, "milestone_name": m.name, "milestone_name_ta": m.name_ta, "shots": m.ask_for,
            "shots_ta": m.ask_for_ta,
            "amount_inr": link["amount_inr"] or m.amount_inr, "wants_location": link["site_lat"] is not None,
            "expires": link["expires"], "submissions": link["submissions"], "last_update_id": link["last_update_id"]}


def _open_link(token: str) -> dict:
    link = store.get_capture_link(token) if re.fullmatch(r"[A-Za-z0-9_-]{16,64}", token or "") else None
    if not link:
        raise HTTPException(404, "This link is not valid. Ask the owner to send a new one")
    if time.time() > link["expires"]:
        raise HTTPException(410, "This link has expired. Ask the owner to send a new one")
    return link


@app.get("/api/capture/{token}")
def capture_info(token: str):
    """What the mestri sees: the milestone and the shots needed. Nothing else about the owner or the site."""
    link = _open_link(token)
    info = _public_link(link)
    info.pop("last_update_id", None)
    return info


@app.post("/api/capture/{token}", dependencies=[Depends(rate_limit)])
def capture_submit(
    token: str,
    files: list[UploadFile] = File(...),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    accuracy_m: Optional[float] = Form(None),
    consent: bool = Form(False),
):
    link = _open_link(token)
    if not consent:
        raise HTTPException(400, "Please confirm you agree to send these photos (and location, if shared) to the owner")
    if not _valid_coord(lat, lng):
        lat = lng = accuracy_m = None
    received = time.time()
    body = run_check(files, link["milestone_id"], link["amount_inr"], None,
                     capture={"token": token, "received_at": received, "lat": lat, "lng": lng,
                              "accuracy_m": accuracy_m, "link": link},
                     consent={"given": True, "by": "mestri", "at": received, "text": CONSENT_VERSION})
    store.record_capture_submission(token, body["id"])
    # The mestri gets a receipt, not the verdict: the owner reviews and decides.
    return {"ok": True, "received_at": received, "photos": len(body["media"]),
            "message": "Proof sent. The owner will see the result."}


# ---------------------------------------------------------------- engineer sign-off
@app.post("/api/updates/{uid}/signoff", dependencies=[Depends(require_access)])
def signoff(uid: str, engineer_name: str = Body(..., min_length=2, max_length=80),
            registration_no: str = Body("", max_length=40), decision: str = Body(..., pattern="^(approved|rework)$"),
            note: str = Body("", max_length=500)):
    """A licensed engineer's decision on a 'needs an engineer' check. Approval marks the milestone verified.
    PAKKA records the engineer's call; it never makes it."""
    body = store.get_update(uid)
    _signoff_allowed(body)
    _record_signoff(body, uid, engineer_name, registration_no, decision, note, channel="owner_entered")
    return _sign_body(store.get_update(uid))


def _signoff_allowed(body: Optional[dict]):
    if not body:
        raise HTTPException(404, "Check not found")
    if body["report"]["verdict"] != "needs_engineer":
        raise HTTPException(400, "Only checks marked 'needs an engineer' take an engineer sign-off")
    if any(f["kind"] == "location" for f in body["report"].get("findings") or []):
        raise HTTPException(400, "This proof was sent from away from the site; ask for new photos first")


def _record_signoff(body, uid, engineer_name, registration_no, decision, note, channel):
    store.add_signoff(uid, body["report"]["milestone_id"], engineer_name.strip(), registration_no.strip(), decision,
                      note.strip(), channel=channel)
    if decision == "approved":
        store.mark_milestone_verified(body["report"]["milestone_id"], uid)


# ---------------------------------------------------------------- engineer link: the engineer signs, not the owner
ENGINEER_TTL_S = 14 * 24 * 3600


@app.post("/api/updates/{uid}/engineer-link", dependencies=[Depends(require_access)])
def create_engineer_link(uid: str):
    """A link the owner sends to the engineer. Sign-offs made through it are recorded as 'signed via engineer link'."""
    _signoff_allowed(store.get_update(uid))
    token = secrets.token_urlsafe(16)
    store.create_engineer_link(token, uid, ENGINEER_TTL_S)
    return {"token": token, "path": f"/#/engineer/{token}", "expires": time.time() + ENGINEER_TTL_S}


def _open_engineer_link(token: str) -> tuple[dict, dict]:
    link = store.get_engineer_link(token) if re.fullmatch(r"[A-Za-z0-9_-]{16,64}", token or "") else None
    if not link or time.time() > link["expires"]:
        raise HTTPException(404, "This link is not valid or has expired. Ask the owner for a new one")
    body = store.get_update(link["update_id"])
    if not body:
        raise HTTPException(404, "This check has been deleted")
    return link, body


@app.get("/api/engineer/{token}")
def engineer_view(token: str):
    """What the engineer sees: the evidence and PAKKA's findings for one check. No voice notes, consent or location."""
    link, body = _open_engineer_link(token)
    b = _sign_body(body)
    return {"id": b["id"], "created": b["created"], "milestone": b["milestone"], "media": b["media"],
            "observations": b["observations"], "report": b["report"], "signoffs": b["signoffs"],
            "used": link["used"]}


@app.post("/api/engineer/{token}/signoff", dependencies=[Depends(rate_limit)])
def engineer_signoff(token: str, engineer_name: str = Body(..., min_length=2, max_length=80),
                     registration_no: str = Body(..., min_length=3, max_length=40),
                     decision: str = Body(..., pattern="^(approved|rework)$"), note: str = Body("", max_length=500)):
    link, body = _open_engineer_link(token)
    if link["used"]:
        raise HTTPException(409, "A decision was already recorded with this link")
    _signoff_allowed(body)
    _record_signoff(body, body["id"], engineer_name, registration_no, decision, note, channel="engineer_link")
    store.use_engineer_link(token)
    return {"ok": True, "message": "Decision recorded. The owner will see it with your name and registration number."}


# ---------------------------------------------------------------- erasure and retention (DPDP Act 2023)
RETENTION_DAYS = float(os.getenv("PAKKA_RETENTION_DAYS", "180"))
CONSENT_VERSION = "consent-v1"
_last_purge = [0.0]


def _maybe_purge():
    if time.time() - _last_purge[0] > 3600:
        _last_purge[0] = time.time()
        n = store.purge_older_than(RETENTION_DAYS)
        if n:
            log.info("retention: removed %d checks older than %d days", n, RETENTION_DAYS)


@app.on_event("startup")
def _startup_purge():
    _maybe_purge()


@app.delete("/api/updates/{uid}", dependencies=[Depends(require_access)])
def delete_check(uid: str):
    """Erase a check with its photos and voice notes (right to erasure)."""
    if not store.delete_update(uid):
        raise HTTPException(404, "Check not found")
    return {"ok": True}


@app.get("/api/privacy")
def privacy():
    return {"retention_days": RETENTION_DAYS, "consent_version": CONSENT_VERSION,
            "processor": "Google Gemini API" + (" (Vertex AI)" if perception.use_vertex() else ""),
            "region": "asia-south1 (Mumbai) when deployed with deploy.sh"}


# ---------------------------------------------------------------- read-only share link (relative / NRI owner)
SHARE_TTL_S = 30 * 24 * 3600


@app.post("/api/share-links", dependencies=[Depends(require_access)])
def create_share_link(label: str = Body("Family", embed=True, max_length=60)):
    token = secrets.token_urlsafe(16)
    store.create_share_link(token, label.strip() or "Family", SHARE_TTL_S)
    return {"token": token, "path": f"/#/share/{token}", "label": label, "expires": time.time() + SHARE_TTL_S}


@app.get("/api/share-links", dependencies=[Depends(require_access)])
def list_share_links():
    return [{**l, "path": f"/#/share/{l['token']}"} for l in store.list_share_links()]


@app.delete("/api/share-links/{token}", dependencies=[Depends(require_access)])
def revoke_share_link(token: str):
    store.revoke_share_link(token)
    return {"ok": True}


@app.get("/api/share/{token}")
def shared_view(token: str):
    """Read-only view for family: the plan, what is verified, and each check's verdict and photos.
    No mestri location, no capture tokens, no editing."""
    link = store.get_share_link(token) if re.fullmatch(r"[A-Za-z0-9_-]{16,64}", token or "") else None
    if not link or time.time() > link["expires"]:
        raise HTTPException(404, "This link is not valid or has been revoked")
    checks = []
    for u in store.list_updates()[:30]:
        b = _sign_body(u)
        b.pop("capture", None)
        b.pop("consent", None)
        checks.append({k: b.get(k) for k in ("id", "created", "media", "report", "signoffs", "source")})
    return {"label": link["label"], "ledger": _ledger(), "checks": checks}


# ---------------------------------------------------------------- recorded payments (PAKKA never moves money)
# Owners are in India; Cloud Run's clock is UTC. Between 00:00 and 05:30 IST the UTC date is still "yesterday",
# so "today" must be India's date or a payment made after midnight is refused as future-dated. (No DST in India.)
IST = timezone(timedelta(hours=5, minutes=30))


def _india_today():
    return datetime.now(IST).date()


PAY_METHODS = {"upi": "UPI", "bank": "Bank transfer", "cash": "Cash", "cheque": "Cheque", "other": "Other"}
RECEIPT_TTL_S = 14 * 24 * 3600


def _paid_summary(milestone_id: str) -> Optional[tuple[int, str]]:
    pays = store.list_payments(milestone_id)
    return (sum(p["amount_inr"] for p in pays), pays[0]["paid_on"]) if pays else None


def _mask(ref: str) -> str:
    ref = (ref or "").strip()
    return ("••" + ref[-4:]) if len(ref) > 4 else ref


@app.post("/api/payments", dependencies=[Depends(require_access)])
def record_payment(
    milestone_id: str = Body(...),
    amount_inr: int = Body(..., ge=1, le=100_000_000),
    method: str = Body(..., pattern="^(upi|bank|cash|cheque|other)$"),
    paid_on: str = Body(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    reference: str = Body("", max_length=40),
    note: str = Body("", max_length=300),
):
    """The owner records a payment they made outside PAKKA. PAKKA flags, never blocks: it's the owner's money."""
    plan_by_id = current_by_id()
    if milestone_id not in plan_by_id:
        raise HTTPException(400, "Unknown milestone")
    try:
        day = datetime.strptime(paid_on, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "Payment date must be a real date")
    if day.date() > _india_today():
        raise HTTPException(400, "Payment date can't be in the future")
    m = plan_by_id[milestone_id]
    flags = []
    if store.milestone_verified_at(milestone_id) is None:
        flags.append("before_verification")
    already = sum(p["amount_inr"] for p in store.list_payments(milestone_id))
    if already + amount_inr > m.amount_inr * (1 + rules.AMOUNT_TOLERANCE):
        flags.append("over_plan")
    token = secrets.token_urlsafe(16)
    p = store.add_payment(milestone_id, store.milestone_verified_update(milestone_id), amount_inr, method, paid_on,
                          reference.strip(), note.strip(), flags, token, RECEIPT_TTL_S)
    return {**_payment_view(p), "receipt_path": f"/#/receipt/{token}"}


def _payment_view(p: dict) -> dict:
    m = current_by_id().get(p["milestone_id"])
    return {k: p[k] for k in ("id", "created", "milestone_id", "update_id", "amount_inr", "method", "paid_on", "reference",
                              "note", "flags", "receipt_status", "receipt_at", "receipt_note", "receipt_expires")} | {
        "milestone_name": m.name if m else p["milestone_id"], "milestone_name_ta": m.name_ta if m else "",
        "planned_inr": m.amount_inr if m else None, "method_label": PAY_METHODS.get(p["method"], p["method"])}


@app.get("/api/payments", dependencies=[Depends(require_access)])
def list_payments():
    return [{**_payment_view(p), "receipt_path": f"/#/receipt/{p['receipt_token']}"} for p in store.list_payments()]


@app.get("/api/payments/{pid}", dependencies=[Depends(require_access)])
def release_note(pid: str):
    """Everything for the printable milestone release record: payment, evidence, engineer sign-offs, audit stamp."""
    p = store.get_payment(pid)
    if not p:
        raise HTTPException(404, "Payment not found")
    evidence = store.get_update(p["update_id"]) if p["update_id"] else None
    return {"payment": {**_payment_view(p), "receipt_path": f"/#/receipt/{p['receipt_token']}"},
            "evidence": _sign_body(evidence) if evidence else None,
            "plan_version": plan_version(), "rules_version": rules.RULES_VERSION,
            "generated_at": time.time()}


def _open_receipt(token: str) -> dict:
    p = store.payment_by_receipt_token(token) if re.fullmatch(r"[A-Za-z0-9_-]{16,64}", token or "") else None
    if not p or time.time() > p["receipt_expires"]:
        raise HTTPException(404, "This link is not valid or has expired. Ask the owner for a new one")
    return p


@app.get("/api/receipt/{token}")
def receipt_info(token: str):
    """What the mestri sees: the payment the owner says they made. Not the owner's note, not other payments."""
    p = _open_receipt(token)
    v = _payment_view(p)
    return {k: v[k] for k in ("milestone_name", "milestone_name_ta", "amount_inr", "method_label", "paid_on",
                              "receipt_status", "receipt_at")} | {"reference": _mask(p["reference"])}


@app.post("/api/receipt/{token}", dependencies=[Depends(rate_limit)])
def receipt_confirm(token: str, response: str = Body(..., pattern="^(confirmed|disputed)$"),
                    note: str = Body("", max_length=300)):
    """The mestri confirms receiving the money, or disputes it. One answer per link; the amount can't be changed."""
    p = _open_receipt(token)
    if p["receipt_status"]:
        raise HTTPException(409, "You have already answered for this payment")
    if response == "disputed" and not note.strip():
        raise HTTPException(400, "Please say what is wrong (for example, the amount you received)")
    store.set_receipt(p["id"], response, note.strip())
    return {"ok": True, "message": "Thank you. The owner will see your answer."}


# ---------------------------------------------------------------- activity log (owner only)
VERDICT_WORDS = {"proven": "work visible", "not_proven": "not proven yet", "needs_engineer": "needs an engineer"}


@app.get("/api/activity", dependencies=[Depends(require_access)])
def activity(limit: int = Query(60, ge=1, le=300)):
    """Who did what, newest first. Built only from stored records: nothing is inferred."""
    plan_by_id = current_by_id()
    name = lambda mid: plan_by_id[mid].name if mid in plan_by_id else mid  # noqa: E731
    events = []
    for u in store.list_updates():
        r = u["report"]
        n = len(u.get("media") or [])
        source = u.get("source")
        verdict = VERDICT_WORDS.get(r["verdict"], r["verdict"])
        if source == "capture_link":
            role, text = "mestri", f"Mestri sent {n} photo{'s' * (n != 1)} via capture link for {r['milestone_name']}: {verdict}"
        elif source == "owner_upload":
            role, text = "owner", f"Owner uploaded {n} photo{'s' * (n != 1)} for {r['milestone_name']}: {verdict}"
        else:  # records made before the source field existed: say so rather than guess
            role, text = None, f"Check for {r['milestone_name']}: {verdict} (source not recorded)"
        events.append({"at": u["created"], "role": role, "kind": "check", "text": text, "update_id": u["id"]})
    for s_ in store.list_signoffs():
        decision = "approved" if s_["decision"] == "approved" else "asked for rework on"
        if s_.get("channel") == "engineer_link":
            role, how = "engineer", "signed via engineer link"
        elif s_.get("channel") == "owner_entered":
            role, how = "owner", "entered by the owner on the engineer's behalf"
        else:
            role, how = None, "channel not recorded"
        events.append({"at": s_["created"], "role": role, "kind": "signoff", "update_id": s_["update_id"],
                       "text": f"{s_['engineer_name']} {decision} {name(s_['milestone_id'])} ({how})"})
    for l in store.list_capture_links():
        events.append({"at": l["created"], "role": "owner", "kind": "capture_link",
                       "text": f"Owner created a capture link for {name(l['milestone_id'])}"})
    for l in store.list_engineer_links():
        b = store.get_update(l["update_id"])
        events.append({"at": l["created"], "role": "owner", "kind": "engineer_link",
                       "text": f"Owner sent an engineer link for {b['report']['milestone_name'] if b else 'a deleted check'}"})
    for l in store.list_share_links(include_revoked=True):
        events.append({"at": l["created"], "role": "owner", "kind": "share_link",
                       "text": f"Owner shared read-only access with \"{l['label']}\""})
        if l.get("revoked"):
            events.append({"at": l["revoked"], "role": "owner", "kind": "share_revoked",
                           "text": f"Owner revoked \"{l['label']}\"'s access"})
    for p in store.list_payments():
        v = _payment_view(p)
        warn = []
        if "before_verification" in p["flags"]:
            warn.append("before the work was verified")
        if "over_plan" in p["flags"]:
            warn.append("more than the plan")
        events.append({"at": p["created"], "role": "owner", "kind": "payment",
                       "text": f"Owner recorded paying {rules.inr(p['amount_inr'])} for {v['milestone_name']} "
                               f"by {v['method_label']} on {p['paid_on']}" + (f" ({', '.join(warn)})" if warn else "")})
        if p["receipt_status"]:
            said = "confirmed receiving" if p["receipt_status"] == "confirmed" else "disputed"
            events.append({"at": p["receipt_at"], "role": "mestri", "kind": "receipt",
                           "text": f"Mestri {said} {rules.inr(p['amount_inr'])} for {v['milestone_name']}"
                                   + (f": {p['receipt_note']}" if p["receipt_note"] else "")})
    events.sort(key=lambda e: e["at"], reverse=True)
    return events[:limit]


# Serve the built React app (copied to ./static by Dockerfile).
_static = Path(__file__).parent.parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="web")
