"""Local, transcript-only English grammar coaching."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Literal

import httpx
from pydantic import BaseModel, Field


MODEL_URL = "http://127.0.0.1:8081/v1/chat/completions"
CATEGORIES = (
    "tense", "articles", "prepositions", "word_order",
    "subject_verb_agreement", "sentence_structure", "other_grammar",
)


class GrammarCorrection(BaseModel):
    timestamp_ms: int = Field(ge=0)
    original: str = Field(min_length=1, max_length=500)
    corrected: str = Field(min_length=1, max_length=500)
    natural_alternative: str = Field(min_length=1, max_length=500)
    explanation: str = Field(min_length=1, max_length=1000)
    category: Literal[
        "tense", "articles", "prepositions", "word_order",
        "subject_verb_agreement", "sentence_structure", "other_grammar",
    ]


class GrammarOutput(BaseModel):
    corrections: list[GrammarCorrection] = Field(default_factory=list)


_SCHEMA = {
    "type": "object",
    "properties": {
        "corrections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "segment_index": {"type": "integer"},
                    "original": {"type": "string"},
                    "corrected": {"type": "string"},
                    "natural_alternative": {"type": "string"},
                    "explanation": {"type": "string"},
                    "category": {"type": "string", "enum": list(CATEGORIES)},
                },
                "required": [
                    "segment_index", "original", "corrected", "natural_alternative",
                    "explanation", "category",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["corrections"],
    "additionalProperties": False,
}

_SYSTEM = """You are a careful English grammar teacher reviewing speech transcripts.
The transcript can have speech-recognition mistakes. Correct only clear grammar errors;
do not correct names, slang, filler words, or stylistic preferences. Preserve the
speaker's meaning. Return JSON with a corrections array. For each correction:
- segment_index must match an input segment_index.
- original must be an exact, contiguous quote from that segment's text.
- corrected fixes the grammar and preserves meaning.
- natural_alternative is another conversational way to express the corrected idea.
- explanation teaches the specific grammar rule in plain English.
- category is one of: tense, articles, prepositions, word_order,
  subject_verb_agreement, sentence_structure, other_grammar.
If there is no clear error, return {"corrections": []}. Return at most six useful
corrections per batch. Do not include markdown or comments."""


def _batches(segments: list[dict]):
    batch: list[dict] = []
    size = 0
    unit_index = 0
    for index, segment in enumerate(segments):
        text = segment["text"].strip()
        if not text:
            continue
        # Whisper segments are normally short. Split unusually long ones so
        # each local-model request fits the context window.
        pieces = re.findall(r".{1,900}(?:\s|$)|\S+", text)
        for piece in pieces:
            piece = piece.strip()
            if not piece:
                continue
            if batch and (size + len(piece) > 2200 or len(batch) >= 12):
                yield batch
                batch, size = [], 0
            batch.append({"segment_index": unit_index, "source_index": index, "text": piece})
            unit_index += 1
            size += len(piece)
    if batch:
        yield batch


def _timestamp(segment: dict, original: str) -> int:
    text = segment["text"]
    start = segment["start_ms"]
    end = max(start, segment["end_ms"])
    offset = text.casefold().find(original.casefold())
    if offset < 0:
        return start
    return start + round(offset / max(len(text), 1) * (end - start))


def _model_response(batch: list[dict]) -> dict:
    with httpx.Client(timeout=600, trust_env=False) as client:
        response = client.post(MODEL_URL, json={
            "model": "grammar-coach",
            "messages": [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": json.dumps(
                    [{"segment_index": item["segment_index"], "text": item["text"]} for item in batch],
                    ensure_ascii=False,
                )},
            ],
            "response_format": {"type": "json_object", "schema": _SCHEMA},
            "temperature": 0.1,
            "max_tokens": 1200,
            "stream": False,
        })
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return json.loads(content)


def review_grammar(
    segments: list[dict], model_response: Callable[[list[dict]], dict] = _model_response
) -> dict:
    """Ask the loopback model for corrections, then verify every source quote."""
    found: list[GrammarCorrection] = []
    seen: set[tuple[int, str, str]] = set()
    for batch in _batches(segments):
        raw = model_response(batch)
        if not isinstance(raw, dict) or not isinstance(raw.get("corrections"), list):
            raise ValueError("The local grammar model returned an invalid response.")
        allowed = {item["segment_index"]: item for item in batch}
        for item in raw["corrections"][:6]:
            if not isinstance(item, dict):
                continue
            index = item.get("segment_index")
            if type(index) is not int or index not in allowed:
                continue
            original = str(item.get("original", "")).strip()
            source = allowed[index]["text"]
            if not original or original.casefold() not in source.casefold():
                continue
            try:
                correction = GrammarCorrection(
                    timestamp_ms=_timestamp(segments[allowed[index]["source_index"]], original),
                    original=original,
                    corrected=item["corrected"],
                    natural_alternative=item["natural_alternative"],
                    explanation=item["explanation"],
                    category=item["category"],
                )
            except (KeyError, ValueError):
                continue
            if correction.corrected.casefold() == correction.original.casefold():
                continue
            key = (allowed[index]["source_index"], correction.original.casefold(), correction.corrected.casefold())
            if key not in seen:
                seen.add(key)
                found.append(correction)
    return GrammarOutput(corrections=found).model_dump()
