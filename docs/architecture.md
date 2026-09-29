# Architecture

## Planned system

```text
Chrome extension (WXT, TypeScript, React, Tailwind)
    microphone / optional webcam capture in the browser
    session UI and reports
                 |
                 | HTTP to 127.0.0.1, on explicit Send action
                 v
FastAPI backend (Python)
    session, recording, and local transcription API
                 |
                 v
Local SQLite metadata/transcripts, recording files, and speech model
```

The extension can record without the backend. Python handles explicit local uploads and speech-to-text. PostgreSQL, object storage, and coaching analysis are later milestones. The extension is designed around the user's own media, without site-specific capture code, so the product can work alongside different conversation platforms.

## Current implementation: Milestones 001–006

- `extension/entrypoints/popup/`: React popup that opens the recorder tab.
- `extension/entrypoints/record/`: audio-only or camera-and-microphone capture, camera preview, session lifecycle, timer, playback, notes, download, and delete.
- `extension/entrypoints/options/`: React settings page.
- `extension/components/`: shared UI components.
- `extension/lib/`: shared focus preference, IndexedDB session store, and local API client.
- `extension/assets/`: shared Tailwind styles.
- `extension/wxt.config.ts`: WXT build and manifest metadata.
- `backend/app/`: FastAPI session lifecycle and background speech-to-text with SQLite metadata, transcript segments, and local media files.

The settings preference uses extension-origin local storage. Session metadata, notes, recording chunks, and finished media use IndexedDB in the same origin. In video mode, camera access is requested when the user enables the preview; microphone access is requested after Start Recording. A full tab keeps the capture alive when the popup closes. During recording, each nonempty MediaRecorder chunk is committed to IndexedDB. Finalization assembles saved chunks into a Blob and atomically stores the finished recording while removing chunks. After an unexpected tab close, sessions that have not been updated for 30 seconds are marked interrupted and assembled from saved chunks. Browser storage limits and eviction remain possible; downloads are the durable user-controlled copy.

After a user clicks Send to local API, the extension creates a matching Python session ID, sends the finished Blob, finishes the API session, and reads it back to verify success. The extension requests host access only to the fixed loopback address, and the documented server command binds there. It stores metadata in SQLite and media in a local file. An upload failure leaves the browser copy intact, so the user can retry. Once upload succeeds, the extension requests transcription and polls for timestamped results. The backend downloads a local Faster Whisper model on first use, serializes CPU inference, and persists results in SQLite. A failed or interrupted job can be retried. The server does not upload recordings to a cloud service.

## Later data flow

Later processing will use the saved transcript for corrections and measurable speech metrics. Reports can be generated before adding account history or cloud storage.

Keep recording and analysis separated so the user can review or delete local media before upload. A processing failure must not silently erase the local recording.
