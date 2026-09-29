"""Local-only session API. No analysis or cloud upload happens here."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, File, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware


DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
MAX_UPLOAD_BYTES = 256 * 1024 * 1024
MEDIA_EXTENSIONS = {
    "audio/webm": "webm",
    "video/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "video/mp4": "mp4",
}


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
) -> FastAPI:
    storage = Path(data_dir or os.getenv("CONVERSATION_COACH_DATA_DIR", DEFAULT_DATA_DIR)).resolve()
    recordings = storage / "recordings"
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

    app.include_router(router)
    return app


app = create_app()
