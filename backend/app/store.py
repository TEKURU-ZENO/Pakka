"""Tiny SQLite store with anti-fraud perceptual image hashing.

Fine for the buildathon; swap for Cloud SQL (Postgres) and Cloud Storage after.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Optional
from PIL import Image

DATA_DIR = Path(os.getenv("PAKKA_DATA", "data"))
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
_db = sqlite3.connect(DATA_DIR / "pakka.db", check_same_thread=False)

# Ensure schemas exist
_db.execute(
    "CREATE TABLE IF NOT EXISTS updates (id TEXT PRIMARY KEY, created REAL, prompt_version TEXT, body TEXT)"
)
try:
    _db.execute("ALTER TABLE updates ADD COLUMN prompt_version TEXT")
except sqlite3.OperationalError:
    pass

_db.execute(
    "CREATE TABLE IF NOT EXISTS image_hashes (dhash TEXT PRIMARY KEY, created REAL, filename TEXT)"
)
_db.commit()


def compute_dhash(path: Path) -> Optional[str]:
    """Computes a 64-bit difference hash (dHash) for an image to detect duplicate/re-sent photo fraud."""
    try:
        with Image.open(path) as img:
            # Convert to grayscale 8-bit and resize to 9x8 using Lanczos interpolation
            gray = img.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
            b = gray.tobytes()
            val = 0
            for row in range(8):
                for col in range(8):
                    val = (val << 1) | (1 if b[row * 9 + col] > b[row * 9 + col + 1] else 0)
            return f"{val:016x}"
    except Exception:
        return None


def hamming_distance(h1: str, h2: str) -> int:
    """Bitwise Hamming distance between two 16-character hexadecimal dHashes."""
    return bin(int(h1, 16) ^ int(h2, 16)).count("1")


def find_duplicate_image(dhash: str, max_distance: int = 6) -> Optional[tuple[str, float]]:
    """Checks if image dHash is within max_distance bits (default: 6) of any previously uploaded photo.
    Returns (dhash, created_timestamp) if a duplicate is found, else None.
    """
    rows = _db.execute("SELECT dhash, created FROM image_hashes").fetchall()
    for stored_hash, created in rows:
        if hamming_distance(dhash, stored_hash) <= max_distance:
            return stored_hash, created
    return None


def store_image_hash(dhash: str, filename: str):
    """Saves perceptual hash into the database to guard future updates against replay fraud."""
    _db.execute(
        "INSERT OR IGNORE INTO image_hashes (dhash, created, filename) VALUES (?, ?, ?)",
        (dhash, time.time(), filename),
    )
    _db.commit()


def save_update(body: dict) -> str:
    uid = uuid.uuid4().hex[:10]
    prompt_version = body.get("prompt_version") or "unknown"
    body = {"id": uid, "created": time.time(), **body}
    _db.execute(
        "INSERT INTO updates (id, created, prompt_version, body) VALUES (?, ?, ?, ?)",
        (uid, body["created"], prompt_version, json.dumps(body)),
    )
    _db.commit()
    return uid


def list_updates() -> list[dict]:
    rows = _db.execute("SELECT body FROM updates ORDER BY created DESC").fetchall()
    return [json.loads(r[0]) for r in rows]
