"""The ONLY place that talks to Gemini. It observes; it never decides.

Set PAKKA_MOCK=1 to run without an API key (offline demo fallback when venue wifi dies).
"""
from __future__ import annotations

import json
import mimetypes
import os
import time
from pathlib import Path

from .prompts import SITE_PROMPT, VOICE_PROMPT
from .schemas import MediaObservation, VoiceClaim

MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")  # check AI Studio for the newest Flash and set it here
MOCK = os.getenv("PAKKA_MOCK") == "1"
INLINE_LIMIT = 18 * 1024 * 1024  # larger files go through the Files API
MOCK_DIR = Path(__file__).parent / "mock"

# WhatsApp voice notes are .opus inside ogg; phones also send m4a/aac.
for ext, mime in {".opus": "audio/ogg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac",
                  ".webm": "video/webm", ".mov": "video/quicktime", ".heic": "image/heic"}.items():
    mimetypes.add_type(mime, ext)

_client = None


def _gemini():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def _media_part(path: Path, mime: str):
    from google.genai import types
    if path.stat().st_size <= INLINE_LIMIT:
        return types.Part.from_bytes(data=path.read_bytes(), mime_type=mime)
    client = _gemini()
    f = client.files.upload(file=str(path))
    while f.state and f.state.name == "PROCESSING":  # videos need a few seconds
        time.sleep(2)
        f = client.files.get(name=f.name)
    return f


def _generate(parts, schema):
    from google.genai import types
    resp = _gemini().models.generate_content(
        model=MODEL,
        contents=parts,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.1,
        ),
    )
    return resp.parsed if resp.parsed is not None else schema.model_validate_json(resp.text)


def guess_mime(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def observe_media(path: Path, claim: str) -> MediaObservation:
    mime = guess_mime(path)
    kind = "video" if mime.startswith("video") else "photo"
    if MOCK:
        return _mock_observation(path)
    prompt = SITE_PROMPT.format(kind=kind, claim=claim or "none")
    return _generate([_media_part(path, mime), prompt], MediaObservation)


def understand_voice(path: Path) -> VoiceClaim:
    if MOCK:
        return VoiceClaim.model_validate_json((MOCK_DIR / "voice.json").read_text())
    return _generate([_media_part(path, guess_mime(path)), VOICE_PROMPT], VoiceClaim)


def _mock_observation(path: Path) -> MediaObservation:
    """Picks a canned observation by filename keyword, e.g. 'shuttering_1.jpg' -> mock/shuttering.json."""
    name = path.stem.lower()
    for f in sorted(MOCK_DIR.glob("*.json")):
        if f.stem != "voice" and f.stem in name:
            return MediaObservation.model_validate_json(f.read_text())
    return MediaObservation.model_validate_json((MOCK_DIR / "shuttering.json").read_text())
