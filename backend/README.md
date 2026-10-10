# Local Python API

For ChatGPT tab and meeting screen recordings, the extension sends a separate mixed audio track with available shared audio and microphone input to Python and keeps the video in the browser for replay and download. Webcam recordings send the microphone audio. If a separate track is missing, the saved video can be used locally as a fallback. The API transcribes English speech with Faster Whisper and reviews clear grammar issues with a local language model. It does not distinguish speakers in a shared call. Recordings and transcripts are not uploaded to an AI service.

## Install on Windows

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

The Chrome companion uses this Windows virtual environment and starts the API only when the extension needs it. WSL Python cannot be launched through this Windows companion.

The development extension now has fixed ID `cdgiokmmcnaimhhcjdokjogehhephppp`. Run `scripts/install_native_companion.ps1 -ExtensionId cdgiokmmcnaimhhcjdokjogehhephppp` once. The script builds `native/ConversationCoachHost.cs` using the installed .NET Framework compiler and registers it for Chrome under the current user's registry. You can use `-AdditionalExtensionIds ID1,ID2` while migrating older unpacked installs. The API runs only on `127.0.0.1:8000`. It stays available while automatic transcription and grammar review run, then the extension stops it. Use `scripts/uninstall_native_companion.ps1` to remove the registration. Diagnostics are written to `data/native-host.log`.

## Local grammar model

Milestone 007 uses [llama.cpp](https://github.com/ggml-org/llama.cpp) with the official [Qwen2.5 3B Instruct GGUF](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF). On Windows, after installing the Python backend dependencies, run from `backend/`:

```powershell
.\scripts\setup_grammar_model.ps1
```

This downloads a CPU runtime and a roughly 2 GB model into ignored `backend/data/grammar/`. It is a one-time download. The extension's native companion starts the model when grammar review begins and stops it when the recorder tab closes. For manual backend development only, run:

```powershell
.\scripts\start_grammar_model.ps1
```

The model server listens only at `127.0.0.1:8081`. The extension starts grammar review when a transcript finishes. Model output is checked against exact transcript quotes before corrections are saved. Suggestions can still be wrong, especially if speech recognition misheard a word; compare them with the recording.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Check server availability |
| POST | `/sessions` | Create or reuse a session ID |
| POST | `/sessions/{id}/recording` | Upload one recording as multipart field `file` |
| POST | `/sessions/{id}/finish` | Save duration, notes, and local completion state |
| GET | `/sessions/{id}` | Read saved metadata and upload confirmation |
| POST | `/sessions/{id}/transcript` | Queue local transcription after the session is finished |
| GET | `/sessions/{id}/transcript` | Read status, text, and timestamped segments |
| PATCH | `/sessions/{id}/transcript` | Save user-corrected words while preserving segment times; invalidates old grammar review |
| POST | `/sessions/{id}/grammar` | Queue grammar review after transcription |
| GET | `/sessions/{id}/grammar` | Read status and structured corrections |

The extension starts transcription after a successful upload and polls for the result. The first request downloads the `base.en` model from Hugging Face into `backend/data/models/`; later requests reuse it offline. Processing runs in the background so the API can keep responding. If the server stops during transcription, the job is marked failed on restart and can be retried. Set `CONVERSATION_COACH_WHISPER_MODEL` to `tiny.en`, `base.en`, or `small.en` before starting the API to choose speed versus accuracy. CPU `int8` is used by default. A transcript can be empty when no clear speech is detected.

Session requests require `X-Conversation-Coach-Client: extension`. This header blocks ordinary browser forms; it is not authentication against other programs running on the computer. Keep the server bound to `127.0.0.1`. Recording types are WebM, Ogg audio, and MP4 audio/video, up to 256 MiB. Retries using the same ID and recording bytes are accepted. A different recording for an existing ID is rejected.

Metadata and transcripts live in `backend/data/sessions.sqlite3`, and recordings in `backend/data/recordings/`. Set `CONVERSATION_COACH_DATA_DIR` to use another local directory. This directory is ignored by Git. The API has no deletion endpoint yet; deleting a session in the extension deletes the browser copy only. To remove the API copy, stop the server and remove the corresponding local data manually. Back up anything you need to keep.

Grammar reviews also live in the same SQLite database. Each correction includes the original quote, a correction, a natural alternative, an explanation, a category, and an approximate timestamp. No audio or transcript is sent outside this computer during review. The model setup downloads software and model weights, not session data.

## Tests

```powershell
.\.venv\Scripts\python -m pytest -q
```

With the API running, use `npm run test:backend-live` from `extension/` to send synthetic bytes through the actual TypeScript client and verify the Python response.
