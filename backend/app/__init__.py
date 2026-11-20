"""PAKKA backend package.

Loads KEY=VALUE pairs from a local .env (pakka/.env or pakka/backend/.env) before anything reads the
environment. Real environment variables always win, and on Cloud Run there is no .env at all: secrets
come from Secret Manager. .env is gitignored and dockerignored; never commit it.
"""
import os
from pathlib import Path


def _load_dotenv() -> None:
    if os.getenv("PAKKA_SKIP_DOTENV") == "1":  # tests: never pick up a developer's real keys
        return
    here = Path(__file__).resolve().parent
    for candidate in (here.parent.parent / ".env", here.parent / ".env"):
        if not candidate.is_file():
            continue
        for raw in candidate.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key, value = key.strip(), value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()
