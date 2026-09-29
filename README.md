# Conversation Coach

Conversation Coach helps English learners turn real speaking practice into useful feedback for their next conversation.

**Current status:** Milestone 006 adds local speech-to-text. The extension can send a finished recording to FastAPI and show an English transcript with timestamps. Coaching analysis is a future milestone. See the [roadmap](docs/roadmap.md) for verification status.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

The Chrome extension has a React popup with a Start Session button and an options page for choosing a practice focus. Start Session opens a dedicated recording tab. Choose **Audio only** or **Camera + microphone**. In camera mode, **Enable Camera Preview** requests camera access and shows a muted preview. **Start Recording** then requests microphone access. **Stop Recording** saves a session with playback, download, notes, and deletion. The recorder uses only your own microphone and optional webcam; it does not capture other participants. **Send to local API** copies a selected recording and its notes to the Python server on this computer only when clicked. The API then transcribes it locally and the extension shows timestamped text.

Recordings and metadata are stored in this browser's IndexedDB. The app saves chunks as recording runs. If the tab closes unexpectedly, reopen the recorder and allow up to 30 seconds for recovery, or use **Recover interrupted**. Only chunks already saved can be restored; the last moments may be missing. Browser storage can be cleared or evicted, so download any recording you need to keep elsewhere.

### Run locally

Requires Node.js 20+, npm, and Python 3.11+. Start the API from `backend/` in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API responds at `http://127.0.0.1:8000/health`. For uv in WSL, use `uv sync --extra dev` and `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000` from `backend/`. See [backend instructions](backend/README.md).

From `extension/` in a second terminal:

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run typecheck
npm run build
```

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Open the popup, click **Start Session**, and record a few minutes in each mode. In camera mode, check the preview before recording. Stop, play the recording, add notes, download it, then reopen the recorder to confirm the session remains. Delete a browser session and verify it disappears from Recent sessions. Also deny camera and microphone permission once each to check the error messages. Open **Settings** and choose a focus, then reopen the popup to confirm it is remembered.

With the API running, select a saved session and click **Send to local API**. The API receives a copy; the browser copy stays available. The transcript appears below the session after local processing finishes. The first transcription downloads the English speech model, so it can take a few minutes; later sessions reuse the downloaded model. The extension requests host access only to `http://127.0.0.1/*` for this connection.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
