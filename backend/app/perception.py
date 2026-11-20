"""The ONLY place that talks to Gemini. It observes; it never decides.

Set PAKKA_MOCK=1 to run without an API key (offline demo fallback when venue wifi dies).
"""
from __future__ import annotations

import logging
import re
import mimetypes
import os
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from .prompts import SITE_PROMPT, VOICE_PROMPT
from .schemas import MediaObservation, VoiceClaim

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")  # check AI Studio for newest Flash model
MOCK = os.getenv("PAKKA_MOCK") == "1"
INLINE_LIMIT = 18 * 1024 * 1024  # files over 18MB go through Files API
MOCK_DIR = Path(__file__).parent / "mock"

# WhatsApp voice notes are .opus inside ogg; phones also send m4a/aac.
for ext, mime in {
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".heic": "image/heic",
    ".wav": "audio/wav",
    ".amr": "audio/amr",
    ".3gp": "video/3gpp",
}.items():
    mimetypes.add_type(mime, ext)

_client = None
_client_lock = threading.Lock()

REQUEST_TIMEOUT_MS = int(os.getenv("GEMINI_TIMEOUT_MS", "90000"))
FILE_PROCESSING_DEADLINE_S = 120
MAX_ATTEMPTS = 3
RETRYABLE_CODES = {429, 500, 502, 503, 504}

log = logging.getLogger("pakka.perception")


class PerceptionError(RuntimeError):
    """Gemini could not give a usable answer. main.py turns this into a friendly 502."""


def _gemini():
    global _client
    with _client_lock:
        if _client is None:
            from google import genai
            from google.genai import types

            http = types.HttpOptions(timeout=REQUEST_TIMEOUT_MS)
            if use_vertex():
                # Vertex AI: billed to the Google Cloud project (and its credits). Auth comes from
                # Application Default Credentials (gcloud auth application-default login, or the
                # Cloud Run service account), never from a key in the environment.
                project = os.getenv("GOOGLE_CLOUD_PROJECT")
                if not project:
                    raise PerceptionError("GOOGLE_CLOUD_PROJECT is not set (needed for Vertex AI)")
                _client = genai.Client(vertexai=True, project=project,
                                       location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"), http_options=http)
            else:
                key = os.getenv("GEMINI_API_KEY")
                if not key:
                    raise PerceptionError("GEMINI_API_KEY is not set on the server")
                _client = genai.Client(api_key=key, http_options=http)
    return _client


def use_vertex() -> bool:
    return os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("1", "true", "yes")


def backend_name() -> str:
    if is_mock():
        return "mock"
    return f"vertex:{os.getenv('GOOGLE_CLOUD_PROJECT', '?')}/{os.getenv('GOOGLE_CLOUD_LOCATION', 'global')}" if use_vertex() else "ai-studio"


def _retrying(call, what: str):
    """Retries transient Gemini failures (rate limit, overload, timeouts) with exponential backoff."""
    from google.genai import errors

    attempts = int(os.getenv("GEMINI_MAX_ATTEMPTS", MAX_ATTEMPTS))
    max_wait = float(os.getenv("GEMINI_RETRY_MAX_WAIT_S", "10"))  # the live app never stalls long; eval waits more
    for attempt in range(1, attempts + 1):
        wait = min(2 ** attempt, 8)
        try:
            return call()
        except errors.APIError as e:
            code = getattr(e, "code", None)
            retryable = code in RETRYABLE_CODES
            log.warning("%s failed (attempt %d, code %s): %s", what, attempt, code or "?", str(e)[:160])
            daily = code == 429 and "PerDay" in str(e)
            if code == 429:
                # Google says how long to back off ("Please retry in 38.1s"); honour it, up to max_wait.
                # A per-day quota can't clear in seconds, so never wait on that one.
                m = re.search(r"retry in ([\d.]+)s", str(e))
                hint = float(m.group(1)) + 1 if m else 30.0
                if daily or hint > max_wait:
                    retryable = False
                wait = min(hint, max_wait)
            if not retryable or attempt == attempts:
                if daily:
                    msg = "The AI service's daily quota is used up (free tier). Enable billing on the Gemini API project"
                elif code == 429:
                    msg = "The AI service's rate limit was hit. Try again in a minute"
                else:
                    msg = f"The AI service refused the request ({code or 'error'})"
                raise PerceptionError(msg) from e
            time.sleep(wait)
            continue
        except (TimeoutError, ConnectionError, OSError) as e:
            log.warning("%s failed (attempt %d): %r", what, attempt, e)
            if attempt == attempts:
                raise PerceptionError("The AI service did not answer in time") from e
        except Exception as e:  # httpx timeouts etc. surface as library-specific exceptions
            if "timeout" not in type(e).__name__.lower() or attempt == attempts:
                raise PerceptionError(f"The AI call failed: {type(e).__name__}") from e
            log.warning("%s timed out (attempt %d)", what, attempt)
        time.sleep(min(2 ** attempt, 8))


@contextmanager
def _media_part(path: Path, mime: str):
    """Yields a Gemini content part. Files uploaded to the Files API are always deleted afterwards."""
    from google.genai import types

    # Photos and audio under INLINE_LIMIT are sent inline; videos and large files use the Files API.
    if not mime.startswith("video") and path.stat().st_size <= INLINE_LIMIT:
        yield types.Part.from_bytes(data=path.read_bytes(), mime_type=mime)
        return

    client = _gemini()
    f = _retrying(lambda: client.files.upload(file=str(path), config={"mime_type": mime}), "file upload")
    try:
        deadline = time.monotonic() + FILE_PROCESSING_DEADLINE_S
        while f.state and f.state.name == "PROCESSING":  # videos need processing time
            if time.monotonic() > deadline:
                raise PerceptionError("The video took too long to process. Send a shorter clip (under 30 s)")
            time.sleep(2)
            f = _retrying(lambda: client.files.get(name=f.name), "file status")
        if f.state and f.state.name == "FAILED":
            raise PerceptionError("The AI service could not read this video. Send it again as MP4")
        yield f
    finally:
        try:
            client.files.delete(name=f.name)  # don't leave owners' site videos sitting in Google's file store
        except Exception as e:  # pragma: no cover - best effort; files also expire after 48 h
            log.warning("could not delete uploaded file %s: %r", getattr(f, "name", "?"), e)


def _generate(path: Path, mime: str, prompt: str, schema):
    from google.genai import types
    from pydantic import ValidationError

    with _media_part(path, mime) as part:
        resp = _retrying(lambda: _gemini().models.generate_content(
            model=MODEL,
            contents=[part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.1,
            ),
        ), "generate_content")
    usage = getattr(resp, "usage_metadata", None)
    if usage:
        log.info("gemini %s tokens in=%s out=%s", schema.__name__,
                 getattr(usage, "prompt_token_count", "?"), getattr(usage, "candidates_token_count", "?"))
    if resp.parsed is not None:
        return resp.parsed
    try:
        return schema.model_validate_json(resp.text or "")
    except ValidationError as e:  # structured output only: never regex free text
        raise PerceptionError("The AI answer was not in the expected format. Try again") from e


def is_mock() -> bool:
    return MOCK or os.getenv("PAKKA_MOCK") == "1"


def guess_mime(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def observe_media(path: Path, mime: Optional[str] = None) -> MediaObservation:
    """Blind observation: the contractor's claim is deliberately NOT passed in.

    Telling a vision model "he says the slab is done" anchors what it reports, and the claim (often a
    model translation of a voice note) is an injection channel. The claim-vs-evidence comparison
    happens in rules.py, where it belongs.
    """
    mime = mime or guess_mime(path)
    kind = "video" if mime.startswith("video") else "photo"
    if is_mock():
        return _mock_observation(path)
    return _generate(path, mime, SITE_PROMPT.format(kind=kind), MediaObservation)


def understand_voice(path: Path, mime: Optional[str] = None) -> VoiceClaim:
    if is_mock():
        return _mock_voice(path)
    return _generate(path, mime or guess_mime(path), VOICE_PROMPT, VoiceClaim)


def _mock_observation(path: Path) -> MediaObservation:
    """Picks a canned observation by filename keyword, prioritizing defect/quality keywords."""
    name = path.stem.lower()
    files = sorted(
        MOCK_DIR.glob("*.json"),
        key=lambda f: (f.stem not in ("honeycomb", "blurry"), -len(f.stem)),
    )
    for f in files:
        if f.stem != "voice" and f.stem in name:
            return MediaObservation.model_validate_json(f.read_text())
    return MediaObservation.model_validate_json((MOCK_DIR / "shuttering.json").read_text())


def _mock_voice(path: Path) -> VoiceClaim:
    """Picks a canned voice claim by filename keyword or returns default voice.json."""
    name = path.stem.lower()
    for f in sorted(MOCK_DIR.glob("*voice*.json")):
        if f.stem in name or name in f.stem:
            return VoiceClaim.model_validate_json(f.read_text())
    return VoiceClaim.model_validate_json((MOCK_DIR / "voice.json").read_text())
