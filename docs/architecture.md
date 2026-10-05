# Architecture

## Planned system

```text
Chrome extension (WXT, TypeScript, React, Tailwind)
    explicit tab/window/screen capture, shared source audio, and separate microphone audio
    session UI and reports
                 |
                 | HTTP to 127.0.0.1, on explicit Send action
                 v
FastAPI backend (Python)
    session, recording, transcription, and grammar API
                 |
                 v
Local SQLite metadata/transcripts/corrections, recording files, and models
```

The extension can record and replay without the backend. Python handles explicit local uploads of the user's microphone audio, speech-to-text, and grammar review. PostgreSQL, object storage, and broader coaching analysis are later milestones. The Chrome sharing picker selects the meeting tab, window, or screen; no meeting page script is injected.

## Current implementation: Milestones 001–007

- `extension/entrypoints/popup/`: React popup with Start, Stop, status, and saved-recording controls.
- `extension/entrypoints/background.ts`: screen picker, recorder tab handoff, badge, and saved notification.
- `extension/entrypoints/record/`: microphone-only, webcam, or selected screen capture; audio mixing, session lifecycle, replay, transcript synchronization, correction, bundled export, notes, and delete.
- `extension/entrypoints/options/`: React settings page.
- `extension/components/`: shared UI components.
- `extension/lib/`: shared focus preference, IndexedDB session store, and local API client.
- `extension/assets/`: shared Tailwind styles.
- `extension/wxt.config.ts`: WXT build and manifest metadata.
- `backend/app/`: FastAPI session lifecycle, background speech-to-text and grammar review, SQLite metadata, transcript segments, corrections, and local media files.

The settings preference uses extension-origin local storage. Session metadata, notes, full-call chunks, microphone chunks, and finished media use IndexedDB in the same origin. The popup asks Chrome to show its desktop picker. After the user selects a source, a one-use stream ID is passed to a recorder tab and consumed promptly. The recorder requests microphone access, mixes shared source audio with the microphone when available, and saves a separate microphone track for analysis. The recorder tab stays open in the background while the meeting tab returns to the front. The popup can stop recording; Chrome's sharing control can also stop it. A completion notification opens the saved recording. Each nonempty chunk is committed to IndexedDB. Finalization assembles saved chunks into finished Blobs and removes the chunks. After an unexpected tab close, sessions that have not been updated for 30 seconds are marked interrupted and assembled from saved chunks. Browser storage limits and eviction remain possible; downloads are the durable user-controlled copy.

After a user clicks Create transcript, the extension creates a matching Python session ID, sends only the isolated microphone Blob for screen captures, finishes the API session, and reads it back to verify success. The extension requests host access only to the fixed loopback address, and the documented server command binds there. It stores metadata in SQLite and audio in a local file. An upload failure leaves the browser copies intact, so the user can retry. Once upload succeeds, the extension requests transcription and polls for timestamped results. The backend downloads a local Faster Whisper model on first use, serializes CPU inference, and persists results in SQLite. A failed or interrupted job can be retried. The server does not upload recordings to a cloud service.

After transcription, the extension requests grammar review. FastAPI sends timestamped transcript text to a separate local llama.cpp server on `127.0.0.1:8081`. It asks for structured corrections, checks every original quote against its source segment, derives timestamps from those segments, and stores accepted corrections in SQLite. The extension polls for results and shows the original, correction, natural alternative, explanation, and category. The model server and model files remain on this computer.

Webcam mode records a camera and microphone stream, while a second MediaRecorder saves microphone-only audio for transcription. During replay, the video time selects the current transcript segment. Users can correct misheard words; the local API preserves segment timing, updates the text, and invalidates earlier grammar output so it can be regenerated. The user confirms the words before a single ZIP download is prepared with video, plain text, and timed VTT subtitles. The automatic transcript is a draft because speech recognition cannot guarantee every word.

## Later data flow

Later processing will use the saved transcript and grammar corrections for natural phrasing suggestions and measurable speech metrics. Reports can be generated before adding account history or cloud storage.

Keep recording and analysis separated so the user can review or delete local media before upload. A processing failure must not silently erase the local recording.
