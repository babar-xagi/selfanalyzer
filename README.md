# Conversation Coach

Conversation Coach records a Google Meet or Episoden call, or your own camera and voice, so you can replay it and review your English.

**Current status:** The extension can capture a selected tab, window, full screen, or your webcam. It saves your microphone separately for a timed transcript and analysis. See the [roadmap](docs/roadmap.md) for verification status.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

Open your meeting and ask participants before recording. In the extension popup, click **Record meeting screen**, choose the meeting tab, a window, or the full screen in Chrome's picker, and turn on **Share audio**. Allow microphone access when Chrome asks. The recorder briefly opens its own tab, then returns you to the meeting while it keeps recording. For a video of yourself, click **Record my camera** and allow camera and microphone access; the recorder tab shows a live preview. Open the popup again and click **Stop recording**, or stop sharing from Chrome. A Chrome notification and the popup show when the recording is saved. Choose **Replay, download, or analyze** to open it. The recorder tab must stay open while capture runs. **My voice only** remains available from the recorder page.

Chrome's source audio options vary by source and platform. A Chrome tab with **Share tab audio** is the best choice for both meeting voices. If source audio was not shared, the extension records the screen and your microphone and marks the session as microphone only.

During screen and webcam capture, the extension also saves an isolated microphone track. **Create transcript** sends only that track and your notes to the local Python API; the full video stays in browser storage. The API transcribes your speech and offers grammar suggestions. During replay, the current transcript line appears below the video and is highlighted in the timed transcript. Click a transcript or correction timestamp to replay that moment. Timestamps are approximate.

**Download video + transcript** starts transcription if needed. Once the timed words appear below, listen to the recording, correct any words the speech model misheard, click **I checked these words**, and click **Download video + transcript** again. The download is one ZIP containing the WebM video, a plain text transcript, and synchronized `.vtt` subtitles. **Video only** works without the Python API. Automatic speech recognition cannot guarantee a word-for-word match; the review step is how you make the exported text match what you actually said. Corrected words are saved to the local API, so grammar review uses them too.

Recordings and metadata are stored in this browser's IndexedDB. The app saves full-call and microphone chunks as recording runs. If the tab closes unexpectedly, reopen the recorder and allow up to 30 seconds for recovery, or use **Recover interrupted**. Only chunks already saved can be restored; the last moments may be missing. Browser storage can be cleared or evicted, so download any recording you need to keep elsewhere.

### Run locally

Requires Node.js 20+, npm, and Python 3.11+. Start the API from `backend/` in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The API responds at `http://127.0.0.1:8000/health`. For uv in WSL, use `uv sync --extra dev` and `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000` from `backend/`. See [backend instructions](backend/README.md).

On Windows, after the one-time Python setup, you can double-click `Start-Transcript-Server.cmd` instead of typing the server command. Keep its window open while creating or downloading transcripts. If `http://127.0.0.1:8000/health` does not show `{"status":"ok"}`, the extension cannot create a transcript. The video still remains in browser storage and can be downloaded with **Video only**.

The video and transcript ZIP needs only the FastAPI server. Grammar feedback also needs the local model server. From `backend/`, run `.\scripts\setup_grammar_model.ps1` once, then `.\scripts\start_grammar_model.ps1` in a separate terminal. The model server listens on `127.0.0.1:8081`. Model setup downloads the CPU runtime and model weights; session media stays local.

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

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. If an older build is already loaded, replace its files and click its Reload icon. Test **Record meeting screen** with a tab, window, or screen and its audio option. After recording starts, the meeting tab returns to the front. Test **Record my camera** separately and confirm its live preview. Stop from the popup, then use the notification or **Replay, download, or analyze** to play the saved video. Create, correct, and confirm the timed transcript, then download the ZIP. Open the WebM, TXT, and VTT files from the ZIP. Reopen the recorder to confirm the session remains. Also test denied camera, microphone, and screen permissions.

With the local transcript server running, select a saved session and click **Create transcript**. For screen and webcam captures, the API receives only your microphone audio, while the full video stays in your browser. The transcript appears below the recording after transcription. The first transcription downloads the English speech model, so it can take a few minutes; later sessions reuse the downloaded model. If connection fails, start the server and use **Retry transcription**. The extension requests host access only to `http://127.0.0.1/*` for this connection. Grammar corrections also require the separate local model server.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
