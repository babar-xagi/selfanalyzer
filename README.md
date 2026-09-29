# Conversation Coach

Conversation Coach records your Episoden call so you can download it, play it again, and review your English after the conversation.

**Current status:** The extension can capture the Episoden tab screen and audio together with your microphone, save and download the full call, and analyze a separate recording of your voice. See the [roadmap](docs/roadmap.md) for verification status.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

The Chrome extension has a React popup with a Start Session button. Open Episoden in a Chrome tab and ask your partner before recording. Choose **Episoden tab + both voices**, click **Start Recording**, then select the Episoden tab in Chrome's sharing picker and enable **Share tab audio**. Allow microphone access. The extension records the shared call screen and both voices into a downloadable WebM video. **Stop Recording** saves it for playback, download, notes, and deletion. **My voice only** remains available as an audio mode.

During full-call capture, the extension also saves an isolated microphone track. **Analyze my voice** sends only that track and your notes to the local Python API; the full call stays in browser storage for replay and download. The API transcribes your speech and offers grammar suggestions. Click a transcript or correction timestamp to play that moment in the saved recording. Timestamps are approximate.

Recordings and metadata are stored in this browser's IndexedDB. The app saves full-call and microphone chunks as recording runs. If the tab closes unexpectedly, reopen the recorder and allow up to 30 seconds for recovery, or use **Recover interrupted**. Only chunks already saved can be restored; the last moments may be missing. Browser storage can be cleared or evicted, so download any recording you need to keep elsewhere.

### Run locally

Requires Node.js 20+, npm, and Python 3.11+. Start the API from `backend/` in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API responds at `http://127.0.0.1:8000/health`. For uv in WSL, use `uv sync --extra dev` and `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000` from `backend/`. See [backend instructions](backend/README.md).

Grammar feedback also needs the local model server. From `backend/`, run `.\scripts\setup_grammar_model.ps1` once, then `.\scripts\start_grammar_model.ps1` in a separate terminal. The model server listens on `127.0.0.1:8081`. Model setup downloads the CPU runtime and model weights; session media stays local.

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

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Open the popup and click **Start Session**. For a full call, choose the Episoden tab and **Share tab audio** in Chrome's picker. Stop, play the video, add notes, download it, then reopen the recorder to confirm the session remains. Delete a browser session and verify it disappears from Recent sessions. Also test denied tab sharing, missing tab audio, and denied microphone access. Open **Settings** and choose a focus, then reopen the popup to confirm it is remembered.

With both local servers running, select a saved session and click **Analyze my voice**. For new Episoden captures, the API receives only your microphone audio, while the full call stays in your browser. The transcript appears after transcription, followed by grammar corrections and explanations. The first transcription downloads the English speech model, so it can take a few minutes; later sessions reuse the downloaded model. The extension requests host access only to `http://127.0.0.1/*` for this connection.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
