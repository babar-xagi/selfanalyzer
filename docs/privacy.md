# Privacy principles

## Capture scope

Screen recording captures a tab, window, or full screen only after the user explicitly selects it in Chrome's sharing picker. Shared source audio can include other participants when the user enables Share audio. The user should ask participants before recording. Webcam mode captures the user's camera and microphone after browser permission. The microphone is recorded separately so analysis can focus on the user's speech. A microphone-only mode remains available.

## Permission and control

Ask for screen sharing, camera, and microphone permission only when the user starts a recording. Show a clear recording state and an obvious Stop control in the popup and recorder tab. Let the user play back, download, and delete a recording before analysis. Never start capture automatically.

## Data handling

Keep raw recordings in the browser until the user chooses to send a copy to the local Python API. Future cloud backend work must define retention, deletion, access controls, and provider data handling before sending recordings to AI services. Treat transcripts as sensitive personal data. Do not put recordings or transcripts in logs.

## Feedback boundaries

Report observable behavior such as word count, pace, fillers, and pauses. Do not infer emotion, intelligence, personality, or confidence from speech or video.

## Current milestone

The extension keeps session metadata, notes, recording chunks, the finished video, and a separate analysis audio recording in its browser origin. Chunks are removed when a session is finalized or deleted. After a completed recording, automatic transcription copies the analysis audio and notes to FastAPI at `127.0.0.1:8000`. ChatGPT tab mode records mixed call audio with both voices for this purpose; other modes normally send only the microphone recording. If the analysis track is missing for a webcam or ChatGPT recording, the extension may use the saved video as a local fallback. For another meeting with shared audio and a missing microphone track, the user must explicitly select Use full call audio before the video is copied to the local API. FastAPI stores the uploaded media and transcript locally in SQLite and recording files. Transcript corrections are saved to the local API and browser metadata; grammar review uses the corrected text. A local language model at `127.0.0.1:8081` stores grammar suggestions. Model files are downloaded from Hugging Face during setup or first use; recordings and transcripts are not sent there. Deleting a session in the extension removes its browser copies but does not remove the API copy; the API has no deletion endpoint yet. Browser storage can be cleared or evicted, so users should download recordings they need to keep.
