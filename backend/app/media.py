"""Upload ingest: decide what a file really is, and make images safe to store, show and send to Gemini.

- Extension allow-list (no SVG, HTML or anything else a browser could execute).
- Magic-byte check so a renamed file can't pass as a photo or voice note.
- Every image is decoded and re-encoded: EXIF orientation applied, ALL metadata (GPS!) stripped,
  long side capped, saved as JPEG. Gemini, the browser and the boxes all see the same pixels.
"""
from __future__ import annotations

import io
from datetime import datetime
from dataclasses import dataclass

from PIL import Image, ImageFilter, ImageOps, ImageStat

try:  # iPhones send HEIC; without this Pillow can't open it.
    from pillow_heif import register_heif_opener

    register_heif_opener()
    HEIC_SUPPORTED = True
except ImportError:  # pragma: no cover
    HEIC_SUPPORTED = False

Image.MAX_IMAGE_PIXELS = 60_000_000  # decompression-bomb guard (~60 MP; phones are 12-50 MP)
MAX_IMAGE_SIDE = 1600
JPEG_QUALITY = 85

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".3gp"}
AUDIO_EXTS = {".opus", ".ogg", ".m4a", ".aac", ".mp3", ".wav", ".amr"}
ALLOWED_EXTS = IMAGE_EXTS | VIDEO_EXTS | AUDIO_EXTS

VIDEO_MIME = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".3gp": "video/3gpp"}
AUDIO_MIME = {".opus": "audio/ogg", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".aac": "audio/aac",
              ".mp3": "audio/mpeg", ".wav": "audio/wav", ".amr": "audio/amr"}


class RejectedUpload(ValueError):
    pass


@dataclass
class Ingested:
    data: bytes        # bytes to store and send to the model
    ext: str           # extension of the stored file
    mime: str
    kind: str          # "image" | "video" | "audio"
    original_sha256: str = ""
    taken_at: float | None = None   # camera time from EXIF (unix seconds), read before metadata is stripped


def _looks_like(ext: str, head: bytes) -> bool:
    """Container signatures for audio/video. Images are verified by actually decoding them."""
    is_ftyp = head[4:8] == b"ftyp"                       # mp4 / mov / m4a / 3gp
    if ext in (".mp4", ".mov", ".m4a", ".3gp"):
        return is_ftyp or (ext == ".mov" and head[4:8] in (b"moov", b"mdat", b"wide", b"free"))
    if ext == ".webm":
        return head[:4] == b"\x1a\x45\xdf\xa3"
    if ext in (".opus", ".ogg"):
        return head[:4] == b"OggS"
    if ext == ".wav":
        return head[:4] == b"RIFF" and head[8:12] == b"WAVE"
    if ext == ".mp3":
        return head[:3] == b"ID3" or (head[0] == 0xFF and head[1] & 0xE0 == 0xE0)
    if ext == ".aac":
        return head[0] == 0xFF and head[1] & 0xF6 == 0xF0
    if ext == ".amr":
        return head[:5] == b"#!AMR"
    return False


def normalise_image(data: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(data)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")
            img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)  # no exif= → metadata dropped
            return out.getvalue()
    except Image.DecompressionBombError as e:
        raise RejectedUpload("Image is too large to process") from e
    except Exception as e:
        raise RejectedUpload("This photo could not be opened. Send it again as a normal JPG photo") from e


def ingest(filename: str, data: bytes, original_sha256: str) -> Ingested:
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in ALLOWED_EXTS:
        raise RejectedUpload(f"Unsupported file type: {ext or 'none'}. Upload photos, videos or voice notes only.")
    if not data:
        raise RejectedUpload(f"{filename} is empty")

    if ext in IMAGE_EXTS:
        if ext in (".heic", ".heif") and not HEIC_SUPPORTED:
            raise RejectedUpload("HEIC photos aren't supported on this server. Send as JPG")
        return Ingested(normalise_image(data), ".jpg", "image/jpeg", "image", original_sha256, exif_taken_at(data))

    if not _looks_like(ext, data[:16]):
        raise RejectedUpload(f"{filename} doesn't look like a real {ext[1:]} file")
    if ext in VIDEO_EXTS:
        return Ingested(data, ext, VIDEO_MIME[ext], "video", original_sha256)
    return Ingested(data, ext, AUDIO_MIME[ext], "audio", original_sha256)


# ---------------------------------------------------------------- capture-quality gate (deterministic, no AI)
# Calibrated on eval/photos: genuinely dark / defocused / shaky captures scored sharpness 65-161 and brightness
# 12.6 for the dark one; every real site photo scored sharpness >= 356 and brightness >= 95.
# Failing this asks for a retake, which is the safe direction: it can delay a payment, never approve one.
MIN_SHARPNESS = 200.0   # variance of the Laplacian on a 512 px greyscale copy
MIN_BRIGHTNESS = 35.0   # mean grey level, 0-255
_LAPLACIAN = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=128)


def capture_metrics(data: bytes) -> tuple[float, float]:
    with Image.open(io.BytesIO(data)) as img:
        g = img.convert("L")
        g.thumbnail((512, 512))
        return ImageStat.Stat(g).mean[0], ImageStat.Stat(g.filter(_LAPLACIAN)).var[0]


def quality_issue(data: bytes) -> str | None:
    """Plain-language reason a photo can't be used as evidence, or None if it's fine."""
    try:
        brightness, sharpness = capture_metrics(data)
    except Exception:
        return None  # undecodable images were already rejected by ingest
    if brightness < MIN_BRIGHTNESS:
        return "Too dark to see the work. Take it again in daylight or with the flash on"
    if sharpness < MIN_SHARPNESS:
        return "Too blurry to see the work. Hold the phone steady and tap to focus on the work"
    return None


def exif_taken_at(data: bytes) -> float | None:
    """Camera capture time (DateTimeOriginal) as unix seconds, or None. Phone local time, so treat as approximate."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            exif = img.getexif()
            raw = exif.get_ifd(0x8769).get(0x9003) or exif.get(0x0132)  # DateTimeOriginal, else DateTime
        return datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S").timestamp() if raw else None
    except Exception:
        return None
