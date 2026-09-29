from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import create_app


HEADERS = {"X-Conversation-Coach-Client": "extension"}


def _create(client: TestClient, session_id: str, mode: str = "audio"):
    return client.post(
        "/sessions",
        headers=HEADERS,
        json={
            "session_id": session_id,
            "mode": mode,
            "created_at": "2026-09-28T12:00:00Z",
            "started_at": "2026-09-28T12:00:02Z",
        },
    )


def test_session_upload_finish_and_restart(tmp_path):
    session_id = str(uuid4())
    media = b"synthetic webm content" * 100
    client = TestClient(create_app(data_dir=tmp_path))

    assert client.get("/health").json() == {"status": "ok"}
    created = _create(client, session_id)
    assert created.status_code == 201
    assert created.json()["status"] == "created"
    assert created.json()["has_recording"] is False

    uploaded = client.post(
        f"/sessions/{session_id}/recording",
        headers=HEADERS,
        files={"file": ("recording.webm", media, "audio/webm;codecs=opus")},
    )
    assert uploaded.status_code == 200
    assert uploaded.json()["status"] == "uploaded"
    assert uploaded.json()["size_bytes"] == len(media)
    assert len(uploaded.json()["sha256"]) == 64
    assert (tmp_path / "recordings" / f"{session_id}.webm").read_bytes() == media

    finished = client.post(
        f"/sessions/{session_id}/finish",
        headers=HEADERS,
        json={
            "ended_at": datetime.now(timezone.utc).isoformat(),
            "duration_ms": 12_345,
            "notes": "Practice shorter answers.",
            "source_status": "completed",
        },
    )
    assert finished.status_code == 200
    assert finished.json()["status"] == "completed"
    assert finished.json()["duration_ms"] == 12_345
    assert finished.json()["notes"] == "Practice shorter answers."

    restarted = TestClient(create_app(data_dir=tmp_path))
    stored = restarted.get(f"/sessions/{session_id}", headers=HEADERS)
    assert stored.status_code == 200
    assert stored.json() == finished.json()


def test_retries_are_idempotent_and_conflicting_media_is_rejected(tmp_path):
    session_id = str(uuid4())
    client = TestClient(create_app(data_dir=tmp_path))
    assert _create(client, session_id).status_code == 201
    assert _create(client, session_id).status_code == 200
    assert _create(client, session_id, mode="video").status_code == 409

    url = f"/sessions/{session_id}/recording"
    upload = lambda content: client.post(
        url,
        headers=HEADERS,
        files={"file": ("recording.webm", content, "audio/webm")},
    )
    assert upload(b"first recording").status_code == 200
    assert upload(b"first recording").status_code == 200
    assert upload(b"different recording").status_code == 409
    assert (tmp_path / "recordings" / f"{session_id}.webm").read_bytes() == b"first recording"


def test_missing_or_invalid_upload_and_premature_finish(tmp_path):
    session_id = str(uuid4())
    client = TestClient(create_app(data_dir=tmp_path, max_upload_bytes=8))
    assert client.post("/sessions", json={}).status_code == 403
    assert client.get(f"/sessions/{session_id}", headers=HEADERS).status_code == 404
    assert _create(client, session_id).status_code == 201
    finish_url = f"/sessions/{session_id}/finish"
    finish = {
        "ended_at": "2026-09-28T12:00:10Z",
        "duration_ms": 8_000,
        "notes": "",
        "source_status": "interrupted",
    }
    assert client.post(finish_url, headers=HEADERS, json=finish).status_code == 409

    url = f"/sessions/{session_id}/recording"
    assert client.post(url, headers=HEADERS, files={"file": ("x.txt", b"x", "text/plain")}).status_code == 415
    assert client.post(url, headers=HEADERS, files={"file": ("x.webm", b"", "audio/webm")}).status_code == 400
    assert client.post(url, headers=HEADERS, files={"file": ("x.webm", b"123456789", "audio/webm")}).status_code == 413
    assert list((tmp_path / "recordings").iterdir()) == []
    assert client.get(f"/sessions/{session_id}", headers=HEADERS).json()["status"] == "created"
