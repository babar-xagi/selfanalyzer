"""Run the local transcript API without a console at Windows sign-in."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


BACKEND = Path(__file__).resolve().parents[1]
HEALTH_URL = "http://127.0.0.1:8000/health"


def already_running() -> bool:
    try:
        with urlopen(HEALTH_URL, timeout=2) as response:
            return response.status == 200 and b'"status":"ok"' in response.read()
    except (OSError, URLError):
        return False


if __name__ == "__main__":
    if not already_running():
        os.chdir(BACKEND)
        data = BACKEND / "data"
        data.mkdir(parents=True, exist_ok=True)
        with (data / "transcript-server.log").open("a", encoding="utf-8", buffering=1) as log:
            sys.stdout = log
            sys.stderr = log
            import uvicorn

            uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
