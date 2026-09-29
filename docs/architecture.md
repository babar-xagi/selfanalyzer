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

## Current implementation: Milestones 001–003

- `extension/entrypoints/popup/`: React popup that opens the recorder tab.
- `extension/entrypoints/record/`: audio-only or camera-and-microphone capture, camera preview, timer, playback, download, and delete.
- `extension/entrypoints/options/`: React settings page.
- `extension/components/`: shared UI components.
- `extension/lib/`: shared focus preference helper.
- `extension/assets/`: shared Tailwind styles.
- `extension/wxt.config.ts`: WXT build and manifest metadata.

The settings preference uses extension-origin local storage. In video mode, camera access is requested when the user enables the preview; microphone access is requested after Start Recording. A full tab keeps the capture alive when the popup closes. The recording is held in memory and never sent over the network. Closing or reloading the tab discards an undownloaded recording; persistent session state belongs to a later milestone.

## Later data flow

The extension will create a session, capture the user's own media, finish recording, then upload it to the API. Processing will produce timestamped transcript segments, corrections, and measurable speech metrics. Reports can be generated before adding account history or cloud storage.

Keep recording and analysis separated so the user can review or delete local media before upload. A processing failure must not silently erase the local recording.
