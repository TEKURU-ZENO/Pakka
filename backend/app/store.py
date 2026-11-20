"""Tiny SQLite store. Fine for the buildathon; swap for Cloud SQL (Postgres) after."""
import json
import os
import sqlite3
import time
import uuid
from pathlib import Path

DATA_DIR = Path(os.getenv("PAKKA_DATA", "data"))
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
_db = sqlite3.connect(DATA_DIR / "pakka.db", check_same_thread=False)

# Ensure schema has prompt_version for AI Governance auditability
_db.execute("CREATE TABLE IF NOT EXISTS updates (id TEXT PRIMARY KEY, created REAL, prompt_version TEXT, body TEXT)")
try:
    _db.execute("ALTER TABLE updates ADD COLUMN prompt_version TEXT")
except sqlite3.OperationalError:
    pass  # Column already exists


def save_update(body: dict) -> str:
    uid = uuid.uuid4().hex[:10]
    prompt_version = body.get("prompt_version") or "unknown"
    body = {"id": uid, "created": time.time(), **body}
    _db.execute("INSERT INTO updates (id, created, prompt_version, body) VALUES (?, ?, ?, ?)",
                (uid, body["created"], prompt_version, json.dumps(body)))
    _db.commit()
    return uid


def list_updates() -> list[dict]:
    rows = _db.execute("SELECT body FROM updates ORDER BY created DESC").fetchall()
    return [json.loads(r[0]) for r in rows]
