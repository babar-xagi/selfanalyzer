"""Local speech recognition for recordings saved by the API."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=2)
def _model(name: str, model_dir: str):
    from faster_whisper import WhisperModel

    return WhisperModel(name, device="cpu", compute_type="int8", download_root=model_dir)


def transcribe_recording(recording: Path, model_dir: Path) -> dict:
    """Return English text and millisecond-timestamped segments from local media."""
    model_name = os.getenv("CONVERSATION_COACH_WHISPER_MODEL", "base.en")
    if model_name not in {"tiny.en", "base.en", "small.en"}:
        raise ValueError("CONVERSATION_COACH_WHISPER_MODEL must be tiny.en, base.en, or small.en")
    model_dir.mkdir(parents=True, exist_ok=True)
    segments, info = _model(model_name, str(model_dir)).transcribe(
        str(recording), language="en", beam_size=5, vad_filter=True
    )
    timed = [
        {
            "start_ms": max(0, round(segment.start * 1000)),
            "end_ms": max(0, round(segment.end * 1000)),
            "text": segment.text.strip(),
        }
        for segment in segments
        if segment.text.strip()
    ]
    return {
        "language": info.language,
        "text": " ".join(segment["text"] for segment in timed),
        "segments": timed,
    }
