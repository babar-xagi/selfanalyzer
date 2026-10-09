# Conversation Coach

Conversation Coach records a Google Meet or Episoden call, or your own camera and voice, so you can replay it and review your English.

**Current status:** The pinned extension button records the active ChatGPT tab, its audio, your camera, and microphone in one video. Other meeting screen and camera modes remain available. A local transcript starts automatically after each completed recording. See the [roadmap](docs/roadmap.md) for verification status.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

Open your ChatGPT voice tab, click the pinned extension icon, then **Record ChatGPT tab + both voices**. Chrome briefly opens the recorder tab for camera and microphone permission and returns to ChatGPT automatically. This mode captures the ChatGPT tab, its audio, your microphone, and a camera inset in one video. There is no tab picker or dashboard step. For other meetings, click **Record meeting screen**, choose the meeting tab, a window, or the full screen in Chrome's picker, and turn on **Share audio**. For a video of yourself, click **Record my camera** and allow camera and microphone access. Open the popup again and click **Stop recording**. A Chrome notification and the popup show when the recording is saved. Choose **Replay, download, or analyze** to open it. The recorder tab must stay open while capture runs. **My voice only** remains available from the recorder page.

Chrome's source audio options vary by source and platform. A Chrome tab with **Share tab audio** is the best choice for both meeting voices. If source audio was not shared, the extension records the screen and your microphone and marks the session as microphone only.

After a completed recording, the extension automatically sends analysis audio and notes to the local Python API and starts transcription. ChatGPT mode sends a separate mixed audio track containing both voices; other modes normally send your microphone track. The full video stays in browser storage. If a separate track is missing, the extension may use the video as a local fallback. For another meeting with shared audio, you must explicitly choose full call transcription if its separate track is missing. The complete transcript appears directly under the video when processing finishes, with a one-click **Copy transcript** button. The timed lines highlight during replay; click one to replay pronunciation at that moment. Speaker names and automatic pronunciation scores are not provided. Timestamps are approximate.

**Download video + transcript** starts transcription if needed. Once the timed words appear below, listen to the recording, correct any words the speech model misheard, click **I checked these words**, and click **Download video + transcript** again. The download is one ZIP containing the WebM video, a plain text transcript, and synchronized `.vtt` subtitles. **Video only** works without the Python API. Automatic speech recognition cannot guarantee a word-for-word match; the review step is how you make the exported text match what you actually said. Corrected words are saved to the local API, so grammar review uses them too.

Recordings and metadata are stored in this browser's IndexedDB. The app saves full-call and microphone chunks as recording runs. If the tab closes unexpectedly, reopen the recorder and allow up to 30 seconds for recovery, or use **Recover interrupted**. Only chunks already saved can be restored; the last moments may be missing. Browser storage can be cleared or evicted, so download any recording you need to keep elsewhere.

### Install locally on Windows

Requires Node.js 20+, npm, and Python 3.11+. Install the Python dependencies once from `backend/` in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

The extension uses the Windows Python environment at `backend/.venv`. See [backend instructions](backend/README.md).

Development builds include a fixed manifest key, so unpacking future ZIP updates in a different folder keeps the extension ID `cdgiokmmcnaimhhcjdokjogehhephppp`. Register the local companion once from the repository root:

Chrome stores recordings separately for each extension ID. Before removing an older Conversation Coach install, download any recordings you need from its **Open recordings** page. The new fixed-ID install cannot read the older ID's browser storage.

```powershell
.\backend\scripts\install_native_companion.ps1 -ExtensionId cdgiokmmcnaimhhcjdokjogehhephppp
```

The companion starts the Python API when recording or transcript review needs it. It stays available while automatic transcription and review are active. Closing the recorder tab or disabling the extension closes the connection and stops the API it started. It runs only at `127.0.0.1:8000` and does not start when Windows signs in. To remove the registration, run `backend/scripts/uninstall_native_companion.ps1`.

The video and transcript ZIP needs only the FastAPI server. For grammar feedback, run `backend/scripts/setup_grammar_model.ps1` once to install the local CPU model. The native companion then starts the grammar server when grammar review begins and stops it when the recorder tab closes. It listens on `127.0.0.1:8081`; session media stays local.

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

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Remove or disable older Conversation Coach installs to avoid clicking the wrong pinned icon. Test **Record ChatGPT tab + both voices** while the ChatGPT tab is active; grant camera and microphone access if Chrome asks. The recorder should return to ChatGPT automatically. Stop from the popup, then use **Replay, download, or analyze** to play the saved video, see the automatic transcript, copy it, correct any misheard words, and download the ZIP. Test other recording modes separately.

The first transcription downloads the English speech model, so it can take a few minutes; later sessions reuse the downloaded model. The transcript starts automatically after new recordings; **Create transcript** remains available for older saved sessions or a failed automatic start. If connection fails, check the companion setup and use **Retry transcription**. The extension requests host access only to `http://127.0.0.1/*` for this connection. Grammar corrections require the one-time local model setup above.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
