"""Local-only session and transcript API."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Annotated, Callable, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.grammar import GrammarCorrection, GrammarOutput, review_grammar
from app.transcription import transcribe_recording


DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MAX_UPLOAD_BYTES = 256 * 1024 * 1024
MEDIA_EXTENSIONS = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
}
logger = logging.getLogger(__name__)


class SessionCreate(BaseModel):
    session_id: UUID
    mode: Literal["audio", "video"]
    created_at: datetime
    started_at: datetime | None = None


class SessionFinish(BaseModel):
    ended_at: datetime
    duration_ms: int = Field(ge=0)
    notes: str = Field(default="", max_length=10_000)
    source_status: Literal["completed", "interrupted"]


class SessionRead(BaseModel):
    session_id: UUID
    mode: Literal["audio", "video"]
    status: Literal["created", "uploaded", "completed"]
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    duration_ms: int
    notes: str
    source_status: Literal["completed", "interrupted"] | None
    mime_type: str | None
    size_bytes: int | None
    sha256: str | None
    has_recording: bool


class TranscriptSegment(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    text: str


class TranscriptRead(BaseModel):
    session_id: UUID
    status: Literal["not_started", "queued", "running", "completed", "failed"]
    language: str | None = None
    text: str = ""
    segments: list[TranscriptSegment] = Field(default_factory=list)
    error: str | None = None
    updated_at: datetime | None = None


class TranscriptEdit(BaseModel):
    source_updated_at: datetime
    texts: list[str] = Field(max_length=10_000)


class GrammarRead(BaseModel):
    session_id: UUID
    status: Literal["not_started", "queued", "running", "completed", "failed"]
    corrections: list[GrammarCorrection] = Field(default_factory=list)
    error: str | None = None
    updated_at: datetime | None = None


def _require_client(x_conversation_coach_client: Annotated[str | None, Header()] = None) -> None:
    # This custom header prevents ordinary cross-origin browser forms from writing
    # to the loopback API. It is not authentication against local processes.
    if x_conversation_coach_client != "extension":
        raise HTTPException(status_code=403, detail="Extension client header required.")


@contextmanager
def _connect(db_path: Path) -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(db_path, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def _get_session(db_path: Path, session_id: UUID) -> dict:
    with _connect(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM sessions WHERE session_id = ?", (str(session_id),)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    session = dict(row)
    session["has_recording"] = session["sha256"] is not None
    return session


def create_app(
    data_dir: Path | None = None,
    max_upload_bytes: int = MAX_UPLOAD_BYTES,
    transcriber: Callable[[Path], dict] | None = None,
    grammar_reviewer: Callable[[list[dict]], dict] | None = None,
) -> FastAPI:
    storage = Path(data_dir or os.getenv("CONVERSATION_COACH_DATA_DIR", DEFAULT_DATA_DIR)).resolve()
    recordings = storage / "recordings"
    models = storage / "models"
    recordings.mkdir(parents=True, exist_ok=True)
    db_path = storage / "sessions.sqlite3"
    with _connect(db_path) as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                started_at TEXT,
                ended_at TEXT,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                source_status TEXT,
                mime_type TEXT,
                size_bytes INTEGER,
                sha256 TEXT
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS transcripts (
                session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
                recording_sha256 TEXT NOT NULL,
                status TEXT NOT NULL,
                language TEXT,
                text TEXT NOT NULL DEFAULT '',
                segments_json TEXT NOT NULL DEFAULT '[]',
                error TEXT,
                updated_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            """UPDATE transcripts SET status = 'failed',
                error = 'The server restarted during transcription. Retry transcription.',
                updated_at = ? WHERE status IN ('queued', 'running')""",
            (datetime.now(timezone.utc).isoformat(),),
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS grammar_reviews (
                session_id TEXT PRIMARY KEY REFERENCES sessions(session_id),
                transcript_sha256 TEXT NOT NULL,
                status TEXT NOT NULL,
                corrections_json TEXT NOT NULL DEFAULT '[]',
                error TEXT,
                updated_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            """UPDATE grammar_reviews SET status = 'failed',
                error = 'The server restarted during grammar analysis. Retry analysis.',
                updated_at = ? WHERE status IN ('queued', 'running')""",
            (datetime.now(timezone.utc).isoformat(),),
        )

    recognize = transcriber or (lambda path: transcribe_recording(path, models))
    review = grammar_reviewer or review_grammar
    recognition_lock = Lock()
    grammar_lock = Lock()

    def read_transcript_data(session_id: UUID) -> dict:
        with _connect(db_path) as connection:
            row = connection.execute(
                "SELECT * FROM transcripts WHERE session_id = ?", (str(session_id),)
            ).fetchone()
        if row is None:
            return {"session_id": session_id, "status": "not_started"}
        result = dict(row)
        result["segments"] = json.loads(result.pop("segments_json"))
        result.pop("recording_sha256")
        return result

    def run_transcription(session_id: UUID, digest: str, path: Path) -> None:
        with recognition_lock:
            with _connect(db_path) as connection:
                connection.execute(
                    "UPDATE transcripts SET status = 'running', updated_at = ? WHERE session_id = ? AND recording_sha256 = ?",
                    (datetime.now(timezone.utc).isoformat(), str(session_id), digest),
                )
            try:
                transcript = TranscriptRead(
                    session_id=session_id, status="completed", **recognize(path)
                )
                with _connect(db_path) as connection:
                    connection.execute(
                        """UPDATE transcripts SET status = 'completed', language = ?, text = ?,
                            segments_json = ?, error = NULL, updated_at = ?
                            WHERE session_id = ? AND recording_sha256 = ?""",
                        (
                            transcript.language, transcript.text,
                            json.dumps([segment.model_dump() for segment in transcript.segments]),
                            datetime.now(timezone.utc).isoformat(), str(session_id), digest,
                        ),
                    )
            except Exception:
                logger.exception("Transcription failed for session %s", session_id)
                with _connect(db_path) as connection:
                    connection.execute(
                        """UPDATE transcripts SET status = 'failed',
                            error = 'Transcription failed. Check backend logs and retry.',
                            updated_at = ? WHERE session_id = ? AND recording_sha256 = ?""",
                        (datetime.now(timezone.utc).isoformat(), str(session_id), digest),
                    )

    def read_grammar_data(session_id: UUID) -> dict:
        with _connect(db_path) as connection:
            row = connection.execute(
                "SELECT * FROM grammar_reviews WHERE session_id = ?", (str(session_id),)
            ).fetchone()
        if row is None:
            return {"session_id": session_id, "status": "not_started"}
        result = dict(row)
        transcript = read_transcript_data(session_id)
        if transcript["status"] != "completed" or result["transcript_sha256"] != transcript_digest(transcript["segments"]):
            return {"session_id": session_id, "status": "not_started"}
        result["corrections"] = json.loads(result.pop("corrections_json"))
        result.pop("transcript_sha256")
        return result

    def transcript_digest(segments: list[dict]) -> str:
        return hashlib.sha256(
            json.dumps(segments, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()

    def run_grammar(session_id: UUID, digest: str, segments: list[dict]) -> None:
        with grammar_lock:
            with _connect(db_path) as connection:
                connection.execute(
                    "UPDATE grammar_reviews SET status = 'running', updated_at = ? WHERE session_id = ? AND transcript_sha256 = ?",
                    (datetime.now(timezone.utc).isoformat(), str(session_id), digest),
                )
            try:
                output = GrammarOutput.model_validate(review(segments))
                with _connect(db_path) as connection:
                    connection.execute(
                        """UPDATE grammar_reviews SET status = 'completed', corrections_json = ?,
                            error = NULL, updated_at = ?
                            WHERE session_id = ? AND transcript_sha256 = ?""",
                        (
                            json.dumps([item.model_dump() for item in output.corrections]),
                            datetime.now(timezone.utc).isoformat(), str(session_id), digest,
                        ),
                    )
            except Exception as error:
                logger.exception("Grammar analysis failed for session %s", session_id)
                message = (
                    "Local grammar model unavailable. Start it and retry."
                    if isinstance(error, (httpx.ConnectError, httpx.TimeoutException))
                    else "Grammar analysis failed. Check backend logs and retry."
                )
                with _connect(db_path) as connection:
                    connection.execute(
                        """UPDATE grammar_reviews SET status = 'failed', error = ?,
                            updated_at = ? WHERE session_id = ? AND transcript_sha256 = ?""",
                        (message, datetime.now(timezone.utc).isoformat(), str(session_id), digest),
                    )

    app = FastAPI(title="Conversation Coach Local API", version="0.1.0")
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["127.0.0.1", "localhost", "testserver"],
    )
    router = APIRouter(dependencies=[Depends(_require_client)])

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @router.post("/sessions", response_model=SessionRead, status_code=201)
    def create_session(payload: SessionCreate, response: Response) -> dict:
        session_id = str(payload.session_id)
        with _connect(db_path) as connection:
            inserted = connection.execute(
                """INSERT OR IGNORE INTO sessions
                    (session_id, mode, status, created_at, started_at)
                    VALUES (?, ?, 'created', ?, ?)""",
                (
                    session_id,
                    payload.mode,
                    payload.created_at.isoformat(),
                    payload.started_at.isoformat() if payload.started_at else None,
                ),
            ).rowcount
            if not inserted:
                existing = connection.execute(
                    "SELECT mode FROM sessions WHERE session_id = ?", (session_id,)
                ).fetchone()
                if existing["mode"] != payload.mode:
                    raise HTTPException(status_code=409, detail="Session ID already uses another mode.")
                response.status_code = 200
        return _get_session(db_path, payload.session_id)

    @router.post("/sessions/{session_id}/recording", response_model=SessionRead)
    async def upload_recording(
        session_id: UUID,
        file: Annotated[UploadFile, File()],
    ) -> dict:
        _get_session(db_path, session_id)
        mime_type = (file.content_type or "").split(";", 1)[0].strip().lower()
        if mime_type not in MEDIA_EXTENSIONS:
            raise HTTPException(status_code=415, detail="Unsupported recording type.")

        temporary = recordings / f"{session_id}.{secrets.token_hex(8)}.part"
        digest = hashlib.sha256()
        size = 0
        try:
            with temporary.open("xb") as destination:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > max_upload_bytes:
                        raise HTTPException(status_code=413, detail="Recording is too large.")
                    digest.update(chunk)
                    destination.write(chunk)
            if size == 0:
                raise HTTPException(status_code=400, detail="Recording is empty.")

            with _connect(db_path) as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = connection.execute(
                    "SELECT mime_type, sha256 FROM sessions WHERE session_id = ?",
                    (str(session_id),),
                ).fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Session not found.")
                if row["sha256"] is not None:
                    if row["sha256"] != digest.hexdigest() or row["mime_type"] != mime_type:
                        raise HTTPException(status_code=409, detail="A different recording already exists.")
                else:
                    final_path = recordings / f"{session_id}.{MEDIA_EXTENSIONS[mime_type]}"
                    os.replace(temporary, final_path)
                    connection.execute(
                        """UPDATE sessions SET status = 'uploaded', mime_type = ?,
                        size_bytes = ?, sha256 = ? WHERE session_id = ?""",
                        (mime_type, size, digest.hexdigest(), str(session_id)),
                    )
        finally:
            await file.close()
            temporary.unlink(missing_ok=True)
        return _get_session(db_path, session_id)

    @router.post("/sessions/{session_id}/finish", response_model=SessionRead)
    def finish_session(session_id: UUID, payload: SessionFinish) -> dict:
        current = _get_session(db_path, session_id)
        if not current["has_recording"]:
            raise HTTPException(status_code=409, detail="Upload a recording before finishing.")
        if current["status"] != "completed":
            with _connect(db_path) as connection:
                connection.execute(
                    """UPDATE sessions SET status = 'completed', ended_at = ?,
                    duration_ms = ?, notes = ?, source_status = ? WHERE session_id = ?""",
                    (
                        payload.ended_at.isoformat(), payload.duration_ms,
                        payload.notes, payload.source_status, str(session_id),
                    ),
                )
        return _get_session(db_path, session_id)

    @router.get("/sessions/{session_id}", response_model=SessionRead)
    def read_session(session_id: UUID) -> dict:
        return _get_session(db_path, session_id)

    @router.get("/sessions/{session_id}/transcript", response_model=TranscriptRead)
    def read_transcript(session_id: UUID) -> dict:
        _get_session(db_path, session_id)
        return read_transcript_data(session_id)

    @router.post("/sessions/{session_id}/transcript", response_model=TranscriptRead)
    def request_transcript(
        session_id: UUID, background_tasks: BackgroundTasks, response: Response
    ) -> dict:
        session = _get_session(db_path, session_id)
        if session["status"] != "completed" or not session["sha256"]:
            raise HTTPException(status_code=409, detail="Finish an uploaded session before transcription.")
        path = recordings / f"{session_id}.{MEDIA_EXTENSIONS[session['mime_type']]}"
        if not path.is_file():
            raise HTTPException(status_code=409, detail="The saved recording is missing.")

        with _connect(db_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT status, recording_sha256 FROM transcripts WHERE session_id = ?",
                (str(session_id),),
            ).fetchone()
            if row is None or row["recording_sha256"] != session["sha256"] or row["status"] == "failed":
                connection.execute(
                    """INSERT INTO transcripts (session_id, recording_sha256, status, updated_at)
                        VALUES (?, ?, 'queued', ?)
                        ON CONFLICT(session_id) DO UPDATE SET
                            recording_sha256 = excluded.recording_sha256,
                            status = 'queued', language = NULL, text = '',
                            segments_json = '[]', error = NULL, updated_at = excluded.updated_at""",
                    (str(session_id), session["sha256"], datetime.now(timezone.utc).isoformat()),
                )
                background_tasks.add_task(run_transcription, session_id, session["sha256"], path)
                response.status_code = 202
            elif row["status"] in {"queued", "running"}:
                response.status_code = 202
        return read_transcript_data(session_id)

    @router.patch("/sessions/{session_id}/transcript", response_model=TranscriptRead)
    def correct_transcript(session_id: UUID, payload: TranscriptEdit) -> dict:
        _get_session(db_path, session_id)
        with _connect(db_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT status, segments_json, updated_at FROM transcripts WHERE session_id = ?",
                (str(session_id),),
            ).fetchone()
            if row is None or row["status"] != "completed":
                raise HTTPException(status_code=409, detail="Complete transcription before editing it.")
            if datetime.fromisoformat(row["updated_at"]) != payload.source_updated_at:
                raise HTTPException(status_code=409, detail="The transcript changed. Reload it before saving edits.")
            segments = json.loads(row["segments_json"])
            if len(segments) != len(payload.texts):
                raise HTTPException(status_code=400, detail="Provide one correction for each transcript segment.")
            if any(len(text) > 5_000 for text in payload.texts):
                raise HTTPException(status_code=400, detail="A transcript segment is too long.")
            corrected = [
                {**segment, "text": text.strip()}
                for segment, text in zip(segments, payload.texts, strict=True)
            ]
            connection.execute(
                """UPDATE transcripts SET text = ?, segments_json = ?, updated_at = ?
                    WHERE session_id = ?""",
                (
                    " ".join(segment["text"] for segment in corrected if segment["text"]),
                    json.dumps(corrected, ensure_ascii=False),
                    datetime.now(timezone.utc).isoformat(), str(session_id),
                ),
            )
        return read_transcript_data(session_id)

    @router.get("/sessions/{session_id}/grammar", response_model=GrammarRead)
    def read_grammar(session_id: UUID) -> dict:
        _get_session(db_path, session_id)
        return read_grammar_data(session_id)

    @router.post("/sessions/{session_id}/grammar", response_model=GrammarRead)
    def request_grammar(
        session_id: UUID, background_tasks: BackgroundTasks, response: Response
    ) -> dict:
        _get_session(db_path, session_id)
        transcript = read_transcript_data(session_id)
        if transcript["status"] != "completed":
            raise HTTPException(status_code=409, detail="Complete transcription before grammar analysis.")
        segments = transcript["segments"]
        digest = transcript_digest(segments)
        with _connect(db_path) as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT status, transcript_sha256 FROM grammar_reviews WHERE session_id = ?",
                (str(session_id),),
            ).fetchone()
            if row is None or row["transcript_sha256"] != digest or row["status"] == "failed":
                connection.execute(
                    """INSERT INTO grammar_reviews (session_id, transcript_sha256, status, updated_at)
                        VALUES (?, ?, 'queued', ?)
                        ON CONFLICT(session_id) DO UPDATE SET
                            transcript_sha256 = excluded.transcript_sha256,
                            status = 'queued', corrections_json = '[]',
                            error = NULL, updated_at = excluded.updated_at""",
                    (str(session_id), digest, datetime.now(timezone.utc).isoformat()),
                )
                background_tasks.add_task(run_grammar, session_id, digest, segments)
                response.status_code = 202
            elif row["status"] in {"queued", "running"}:
                response.status_code = 202
        return read_grammar_data(session_id)

    app.include_router(router)
    return app


app = create_app()
