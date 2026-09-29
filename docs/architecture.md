# Architecture

## Planned system

```text
Chrome extension (WXT, TypeScript, React, Tailwind)
    microphone / optional webcam capture in the browser
    session UI and reports
                 |
                 | HTTPS, later milestone
                 v
FastAPI backend (Python, uv)
    session API, transcription and analysis jobs
                 |
                 v
Database for metadata; object storage for recordings
```

The initial extension does not need a backend. Python is introduced when local recording and session handling work. PostgreSQL and object storage are later milestones. The extension is designed around the user's own media, without site-specific capture code, so the product can work alongside different conversation platforms.

## Current implementation: Milestones 001–004

- `extension/entrypoints/popup/`: React popup that opens the recorder tab.
- `extension/entrypoints/record/`: audio-only or camera-and-microphone capture, camera preview, session lifecycle, timer, playback, notes, download, and delete.
- `extension/entrypoints/options/`: React settings page.
- `extension/components/`: shared UI components.
- `extension/lib/`: shared focus preference and IndexedDB session store.
- `extension/assets/`: shared Tailwind styles.
- `extension/wxt.config.ts`: WXT build and manifest metadata.

The settings preference uses extension-origin local storage. Session metadata, notes, recording chunks, and finished media use IndexedDB in the same origin. In video mode, camera access is requested when the user enables the preview; microphone access is requested after Start Recording. A full tab keeps the capture alive when the popup closes. Media is never sent over the network. During recording, each nonempty MediaRecorder chunk is committed to IndexedDB. Finalization assembles saved chunks into a Blob and atomically stores the finished recording while removing chunks. After an unexpected tab close, sessions that have not been updated for 30 seconds are marked interrupted and assembled from saved chunks. Browser storage limits and eviction remain possible; downloads are the durable user-controlled copy.

## Later data flow

The extension will create a session, capture the user's own media, finish recording, then upload it to the API. Processing will produce timestamped transcript segments, corrections, and measurable speech metrics. Reports can be generated before adding account history or cloud storage.

Keep recording and analysis separated so the user can review or delete local media before upload. A processing failure must not silently erase the local recording.
