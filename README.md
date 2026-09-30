# Conversation Coach

Conversation Coach records a Google Meet or Episoden call so you can download it, play it again, and review your English after the conversation.

**Current status:** The extension can capture a selected tab, window, or full screen with shared audio and your microphone, save and download the recording, and analyze a separate recording of your voice. See the [roadmap](docs/roadmap.md) for verification status.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

Open your meeting and ask participants before recording. In the extension popup, click **Start recording**, choose the meeting tab, a window, or the full screen in Chrome's picker, and turn on **Share audio**. Allow microphone access when Chrome asks. The recorder briefly opens its own tab, then returns you to the meeting while it keeps recording. Open the popup again and click **Stop recording**, or stop sharing from Chrome. A Chrome notification and the popup show when the recording is saved. Choose **Replay, download, or analyze** to open the saved WebM video. The recorder tab must stay open while capture runs. **My voice only** remains available from the recorder page.

Chrome's source audio options vary by source and platform. A Chrome tab with **Share tab audio** is the best choice for both meeting voices. If source audio was not shared, the extension records the screen and your microphone and marks the session as microphone only.

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

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Open the popup and click **Start recording**. Choose a tab, window, or screen and enable its audio option. After recording starts, the meeting tab returns to the front. Open the popup to stop, then use the notification or **Replay, download, or analyze** to play and download the saved video. Reopen the recorder to confirm the session remains. Delete a browser session and verify it disappears from Recent sessions. Also test denied sharing, missing source audio, and denied microphone access. Open **Settings** and choose a focus, then reopen the popup to confirm it is remembered.

With both local servers running, select a saved session and click **Analyze my voice**. For screen captures, the API receives only your microphone audio, while the full call stays in your browser. The transcript appears after transcription, followed by grammar corrections and explanations. The first transcription downloads the English speech model, so it can take a few minutes; later sessions reuse the downloaded model. The extension requests host access only to `http://127.0.0.1/*` for this connection.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
