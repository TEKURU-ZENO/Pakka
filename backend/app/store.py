"""Tiny SQLite store with anti-fraud image fingerprints and a milestone ledger.

Fine for the buildathon; swap for Cloud SQL (Postgres) and Cloud Storage after.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from PIL import Image

DATA_DIR = Path(os.getenv("PAKKA_DATA", "data"))
# On Cloud Run, /tmp is RAM. Point PAKKA_MEDIA_DIR at a Cloud Storage volume mount so uploads don't eat memory.
MEDIA_DIR = Path(os.getenv("PAKKA_MEDIA_DIR") or DATA_DIR / "media")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
_db = sqlite3.connect(DATA_DIR / "pakka.db", check_same_thread=False)
_lock = threading.Lock()

# dHash bits only mean something where neighbouring pixels actually differ. A flat image (dark photo,
# blank wall, a demo canvas) has near-random or all-zero bits and collides with every other flat image.
DHASH_MIN_DELTA = 4          # grey-level difference (0-255) for a bit to count as informative
DHASH_MIN_INFORMATIVE = 16   # of 64 bits; below this, fall back to exact-match only
DHASH_MAX_DISTANCE = 6

_db.execute("CREATE TABLE IF NOT EXISTS updates (id TEXT PRIMARY KEY, created REAL, prompt_version TEXT, body TEXT)")
try:
    _db.execute("ALTER TABLE updates ADD COLUMN prompt_version TEXT")
except sqlite3.OperationalError:
    pass
_db.execute("CREATE TABLE IF NOT EXISTS image_hashes (dhash TEXT PRIMARY KEY, created REAL, filename TEXT)")
_db.execute("CREATE TABLE IF NOT EXISTS image_sha256 (sha256 TEXT PRIMARY KEY, created REAL, filename TEXT)")
_db.execute("CREATE TABLE IF NOT EXISTS milestone_verified "
            "(milestone_id TEXT PRIMARY KEY, created REAL, update_id TEXT)")
_db.execute("CREATE TABLE IF NOT EXISTS capture_links (token TEXT PRIMARY KEY, created REAL, expires REAL, "
            "milestone_id TEXT, amount_inr INTEGER, site_lat REAL, site_lng REAL, radius_m REAL, "
            "submissions INTEGER DEFAULT 0, last_update_id TEXT)")
_db.execute("CREATE TABLE IF NOT EXISTS plan_overrides (milestone_id TEXT PRIMARY KEY, amount_inr INTEGER, "
            "engineer_gate INTEGER, updated REAL)")
_db.execute("CREATE TABLE IF NOT EXISTS signoffs (id TEXT PRIMARY KEY, created REAL, update_id TEXT, milestone_id TEXT, "
            "engineer_name TEXT, registration_no TEXT, decision TEXT, note TEXT)")
_db.execute("CREATE TABLE IF NOT EXISTS share_links (token TEXT PRIMARY KEY, created REAL, expires REAL, label TEXT)")
_db.execute("CREATE TABLE IF NOT EXISTS engineer_links (token TEXT PRIMARY KEY, created REAL, expires REAL, update_id TEXT, "
            "used REAL)")
try:  # who entered the sign-off: the engineer through their own link, or the owner on their behalf
    _db.execute("ALTER TABLE signoffs ADD COLUMN channel TEXT")
except sqlite3.OperationalError:
    pass
_db.commit()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compute_dhash(path: Path) -> Optional[str]:
    """64-bit difference hash, or None if the image is too flat for the hash to be trustworthy."""
    try:
        with Image.open(path) as img:
            gray = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            b = gray.tobytes()
    except Exception:
        return None
    val = informative = 0
    for row in range(8):
        for col in range(8):
            left, right = b[row * 9 + col], b[row * 9 + col + 1]
            val = (val << 1) | (1 if left > right else 0)
            informative += abs(left - right) >= DHASH_MIN_DELTA
    if informative < DHASH_MIN_INFORMATIVE:
        return None
    return f"{val:016x}"


def hamming_distance(h1: str, h2: str) -> int:
    return bin(int(h1, 16) ^ int(h2, 16)).count("1")


def find_duplicate_image(sha256: Optional[str], dhash: Optional[str],
                         max_distance: int = DHASH_MAX_DISTANCE) -> Optional[float]:
    """Returns the timestamp of an earlier identical / near-identical photo, else None."""
    with _lock:
        if sha256:
            row = _db.execute("SELECT created FROM image_sha256 WHERE sha256 = ?", (sha256,)).fetchone()
            if row:
                return row[0]
        if dhash:
            for stored_hash, created in _db.execute("SELECT dhash, created FROM image_hashes").fetchall():
                if hamming_distance(dhash, stored_hash) <= max_distance:
                    return created
    return None


def store_image_fingerprint(sha256: Optional[str], dhash: Optional[str], filename: str):
    now = time.time()
    with _lock:
        if sha256:
            _db.execute("INSERT OR IGNORE INTO image_sha256 (sha256, created, filename) VALUES (?, ?, ?)",
                        (sha256, now, filename))
        if dhash:
            _db.execute("INSERT OR IGNORE INTO image_hashes (dhash, created, filename) VALUES (?, ?, ?)",
                        (dhash, now, filename))
        _db.commit()


def milestone_verified_at(milestone_id: str) -> Optional[float]:
    with _lock:
        row = _db.execute("SELECT created FROM milestone_verified WHERE milestone_id = ?", (milestone_id,)).fetchone()
    return row[0] if row else None


def mark_milestone_verified(milestone_id: str, update_id: str):
    with _lock:
        _db.execute("INSERT OR IGNORE INTO milestone_verified (milestone_id, created, update_id) VALUES (?, ?, ?)",
                    (milestone_id, time.time(), update_id))
        _db.commit()


def save_update(body: dict) -> str:
    uid = uuid.uuid4().hex[:10]
    prompt_version = body.get("prompt_version") or "unknown"
    body = {"id": uid, "created": time.time(), **body}
    with _lock:
        _db.execute("INSERT INTO updates (id, created, prompt_version, body) VALUES (?, ?, ?, ?)",
                    (uid, body["created"], prompt_version, json.dumps(body)))
        _db.commit()
    return uid


def list_updates() -> list[dict]:
    with _lock:
        rows = _db.execute("SELECT body FROM updates ORDER BY created DESC").fetchall()
    return [json.loads(r[0]) for r in rows]


def create_capture_link(token: str, milestone_id: str, amount_inr, site_lat, site_lng, radius_m: float,
                        ttl_s: float) -> dict:
    now = time.time()
    with _lock:
        _db.execute("INSERT INTO capture_links (token, created, expires, milestone_id, amount_inr, site_lat, site_lng, "
                    "radius_m) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (token, now, now + ttl_s, milestone_id, amount_inr, site_lat, site_lng, radius_m))
        _db.commit()
    return get_capture_link(token)


_LINK_COLS = ("token", "created", "expires", "milestone_id", "amount_inr", "site_lat", "site_lng", "radius_m",
              "submissions", "last_update_id")


def get_capture_link(token: str) -> Optional[dict]:
    with _lock:
        row = _db.execute(f"SELECT {', '.join(_LINK_COLS)} FROM capture_links WHERE token = ?", (token,)).fetchone()
    return dict(zip(_LINK_COLS, row)) if row else None


def list_capture_links() -> list[dict]:
    with _lock:
        rows = _db.execute(f"SELECT {', '.join(_LINK_COLS)} FROM capture_links ORDER BY created DESC").fetchall()
    return [dict(zip(_LINK_COLS, r)) for r in rows]


def record_capture_submission(token: str, update_id: str):
    with _lock:
        _db.execute("UPDATE capture_links SET submissions = submissions + 1, last_update_id = ? WHERE token = ?",
                    (update_id, token))
        _db.commit()


def reset_all():
    """Wipes records and fingerprints. Used by tests and by the mock-mode demo reset."""
    with _lock:
        for table in ("updates", "image_hashes", "image_sha256", "milestone_verified", "capture_links",
                      "plan_overrides", "signoffs", "share_links", "engineer_links"):
            _db.execute(f"DELETE FROM {table}")
        _db.commit()



# ---------------------------------------------------------------- payment plan overrides
def plan_overrides() -> dict[str, dict]:
    with _lock:
        rows = _db.execute("SELECT milestone_id, amount_inr, engineer_gate FROM plan_overrides").fetchall()
    return {m: {"amount_inr": a, "engineer_gate": bool(g) if g is not None else None} for m, a, g in rows}


def set_plan_override(milestone_id: str, amount_inr: Optional[int], engineer_gate: Optional[bool]):
    with _lock:
        _db.execute("INSERT INTO plan_overrides (milestone_id, amount_inr, engineer_gate, updated) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT(milestone_id) DO UPDATE SET amount_inr = excluded.amount_inr, "
                    "engineer_gate = excluded.engineer_gate, updated = excluded.updated",
                    (milestone_id, amount_inr, None if engineer_gate is None else int(engineer_gate), time.time()))
        _db.commit()


# ---------------------------------------------------------------- engineer sign-offs
_SIGNOFF_COLS = ("id", "created", "update_id", "milestone_id", "engineer_name", "registration_no", "decision", "note",
                 "channel")


def add_signoff(update_id: str, milestone_id: str, engineer_name: str, registration_no: str, decision: str,
                note: str, channel: str = "owner_entered") -> dict:
    sid = uuid.uuid4().hex[:10]
    with _lock:
        _db.execute(f"INSERT INTO signoffs ({', '.join(_SIGNOFF_COLS)}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (sid, time.time(), update_id, milestone_id, engineer_name, registration_no, decision, note, channel))
        _db.commit()
    return list_signoffs(update_id=update_id)[0]


def list_signoffs(update_id: Optional[str] = None) -> list[dict]:
    q = f"SELECT {', '.join(_SIGNOFF_COLS)} FROM signoffs"
    args: tuple = ()
    if update_id:
        q, args = q + " WHERE update_id = ?", (update_id,)
    with _lock:
        rows = _db.execute(q + " ORDER BY created DESC", args).fetchall()
    return [dict(zip(_SIGNOFF_COLS, r)) for r in rows]


def verified_milestones() -> dict[str, float]:
    with _lock:
        rows = _db.execute("SELECT milestone_id, created FROM milestone_verified").fetchall()
    return {m: t for m, t in rows}


# ---------------------------------------------------------------- read-only share links
def create_share_link(token: str, label: str, ttl_s: float):
    now = time.time()
    with _lock:
        _db.execute("INSERT INTO share_links (token, created, expires, label) VALUES (?, ?, ?, ?)", (token, now, now + ttl_s, label))
        _db.commit()


def get_share_link(token: str) -> Optional[dict]:
    with _lock:
        row = _db.execute("SELECT token, created, expires, label FROM share_links WHERE token = ?", (token,)).fetchone()
    return dict(zip(("token", "created", "expires", "label"), row)) if row else None


def list_share_links() -> list[dict]:
    with _lock:
        rows = _db.execute("SELECT token, created, expires, label FROM share_links ORDER BY created DESC").fetchall()
    return [dict(zip(("token", "created", "expires", "label"), r)) for r in rows]


def revoke_share_link(token: str):
    with _lock:
        _db.execute("DELETE FROM share_links WHERE token = ?", (token,))
        _db.commit()


# ---------------------------------------------------------------- erasure and retention (DPDP Act 2023, s.8(7), s.12)
def get_update(uid: str) -> Optional[dict]:
    with _lock:
        row = _db.execute("SELECT body FROM updates WHERE id = ?", (uid,)).fetchone()
    return json.loads(row[0]) if row else None


def _media_names(body: dict) -> list[str]:
    return [m["url"].split("/")[-1].split("?")[0] for m in (body.get("media") or []) + (body.get("audio") or [])]


def delete_update(uid: str) -> bool:
    """Erase one check: its record, its photos/voice notes, its sign-offs and any 'verified' mark it created."""
    body = get_update(uid)
    if not body:
        return False
    for name in _media_names(body):
        try:
            (MEDIA_DIR / name).unlink(missing_ok=True)
        except OSError:
            pass
    shas = [m.get("sha256") for m in body.get("media") or [] if m.get("sha256")]
    with _lock:
        _db.execute("DELETE FROM updates WHERE id = ?", (uid,))
        _db.execute("DELETE FROM signoffs WHERE update_id = ?", (uid,))
        _db.execute("DELETE FROM milestone_verified WHERE update_id = ?", (uid,))
        for sha in shas:  # keep the dHash (anti-reuse) but drop the exact-file fingerprint
            _db.execute("DELETE FROM image_sha256 WHERE sha256 = ?", (sha,))
        _db.commit()
    return True


def purge_older_than(days: float) -> int:
    """Retention: delete checks (and their media) older than `days`. Returns how many were removed."""
    cutoff = time.time() - days * 86400
    with _lock:
        ids = [r[0] for r in _db.execute("SELECT id FROM updates WHERE created < ?", (cutoff,)).fetchall()]
    for uid in ids:
        delete_update(uid)
    with _lock:
        _db.execute("DELETE FROM capture_links WHERE expires < ?", (cutoff,))
        _db.execute("DELETE FROM share_links WHERE expires < ?", (time.time(),))
        _db.commit()
    return len(ids)



# ---------------------------------------------------------------- engineer links
def create_engineer_link(token: str, update_id: str, ttl_s: float):
    now = time.time()
    with _lock:
        _db.execute("INSERT INTO engineer_links (token, created, expires, update_id, used) VALUES (?, ?, ?, ?, NULL)",
                    (token, now, now + ttl_s, update_id))
        _db.commit()


def get_engineer_link(token: str) -> Optional[dict]:
    with _lock:
        row = _db.execute("SELECT token, created, expires, update_id, used FROM engineer_links WHERE token = ?",
                          (token,)).fetchone()
    return dict(zip(("token", "created", "expires", "update_id", "used"), row)) if row else None


def use_engineer_link(token: str):
    with _lock:
        _db.execute("UPDATE engineer_links SET used = ? WHERE token = ?", (time.time(), token))
        _db.commit()
