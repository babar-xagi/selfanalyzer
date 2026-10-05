from uuid import uuid4

from fastapi.testclient import TestClient

from app.grammar import review_grammar
from app.main import create_app


HEADERS = {"X-Conversation-Coach-Client": "extension"}
SEGMENTS = [{"start_ms": 1000, "end_ms": 5000, "text": "Um, yesterday I go to university."}]
CORRECTION = {
    "timestamp_ms": 1485,
    "original": "yesterday I go to university.",
    "corrected": "Yesterday I went to university.",
    "natural_alternative": "I went to university yesterday.",
    "explanation": "Use the past tense 'went' for an action that happened yesterday.",
    "category": "tense",
}


def _finished_session(client):
    session_id = str(uuid4())
    assert client.post("/sessions", headers=HEADERS, json={
        "session_id": session_id, "mode": "audio", "created_at": "2026-09-29T12:00:00Z",
    }).status_code == 201
    assert client.post(f"/sessions/{session_id}/recording", headers=HEADERS, files={
        "file": ("recording.webm", b"synthetic bytes", "audio/webm"),
    }).status_code == 200
    assert client.post(f"/sessions/{session_id}/finish", headers=HEADERS, json={
        "ended_at": "2026-09-29T12:00:10Z", "duration_ms": 10_000,
        "notes": "", "source_status": "completed",
    }).status_code == 200
    return session_id


def test_grammar_model_quotes_are_verified_and_timestamped():
    def answer(batch):
        return {"corrections": [
            {"segment_index": batch[0]["segment_index"], **{
                key: value for key, value in CORRECTION.items() if key != "timestamp_ms"
            }},
            {"segment_index": batch[0]["segment_index"], **{
                **{key: value for key, value in CORRECTION.items() if key != "timestamp_ms"},
                "original": "I was at the airport."}},
        ]}

    result = review_grammar(SEGMENTS, model_response=answer)
    assert result["corrections"] == [CORRECTION]


def test_grammar_api_waits_for_transcript_and_persists_review(tmp_path):
    calls = []

    def reviewer(segments):
        calls.append(segments)
        return {"corrections": [CORRECTION]}

    client = TestClient(create_app(
        data_dir=tmp_path,
        transcriber=lambda path: {"language": "en", "text": SEGMENTS[0]["text"], "segments": SEGMENTS},
        grammar_reviewer=reviewer,
    ))
    session_id = _finished_session(client)
    url = f"/sessions/{session_id}/grammar"
    assert client.get(url, headers=HEADERS).json()["status"] == "not_started"
    assert client.post(url, headers=HEADERS).status_code == 409
    assert client.post(f"/sessions/{session_id}/transcript", headers=HEADERS).status_code == 202
    queued = client.post(url, headers=HEADERS)
    assert queued.status_code == 202
    assert queued.json()["status"] == "queued"
    completed = client.get(url, headers=HEADERS)
    assert completed.json()["status"] == "completed"
    assert completed.json()["corrections"] == [CORRECTION]
    assert calls == [SEGMENTS]
    assert client.post(url, headers=HEADERS).json()["status"] == "completed"
    assert calls == [SEGMENTS]

    restarted = TestClient(create_app(data_dir=tmp_path, grammar_reviewer=reviewer))
    assert restarted.get(url, headers=HEADERS).json() == completed.json()

    transcript_url = f"/sessions/{session_id}/transcript"
    transcript = client.get(transcript_url, headers=HEADERS).json()
    edited = client.patch(transcript_url, headers=HEADERS, json={
        "source_updated_at": transcript["updated_at"],
        "texts": ["Um, yesterday I went to university."],
    })
    assert edited.status_code == 200
    assert client.get(url, headers=HEADERS).json()["status"] == "not_started"
    assert client.post(url, headers=HEADERS).status_code == 202
    assert calls[-1][0]["text"] == "Um, yesterday I went to university."


def test_failed_grammar_review_can_be_retried(tmp_path):
    calls = 0

    def reviewer(segments):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("model error")
        return {"corrections": []}

    client = TestClient(create_app(
        data_dir=tmp_path,
        transcriber=lambda path: {"language": "en", "text": SEGMENTS[0]["text"], "segments": SEGMENTS},
        grammar_reviewer=reviewer,
    ))
    session_id = _finished_session(client)
    assert client.post(f"/sessions/{session_id}/transcript", headers=HEADERS).status_code == 202
    url = f"/sessions/{session_id}/grammar"
    assert client.post(url, headers=HEADERS).status_code == 202
    assert client.get(url, headers=HEADERS).json()["status"] == "failed"
    assert client.post(url, headers=HEADERS).status_code == 202
    assert client.get(url, headers=HEADERS).json()["status"] == "completed"
    assert calls == 2
