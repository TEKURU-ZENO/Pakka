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


def reset_all():
    """Wipes records and fingerprints. Used by tests and by the mock-mode demo reset."""
    with _lock:
        for table in ("updates", "image_hashes", "image_sha256", "milestone_verified"):
            _db.execute(f"DELETE FROM {table}")
        _db.commit()
