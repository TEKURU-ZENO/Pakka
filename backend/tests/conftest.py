"""Keep tests away from the real data directory and from each other.

PAKKA_DATA must be set before `app.store` is imported, because the store opens its DB at import time.
"""
import os
import tempfile

os.environ["PAKKA_DATA"] = tempfile.mkdtemp(prefix="pakka_test_")
os.environ["PAKKA_SKIP_DOTENV"] = "1"
os.environ["PAKKA_MOCK"] = "1"
os.environ.pop("PAKKA_ACCESS_KEY", None)

import pytest  # noqa: E402

from app import main, store  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_state():
    store.reset_all()
    main.reset_rate_limits()
    yield
