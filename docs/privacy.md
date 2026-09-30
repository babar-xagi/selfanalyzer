# Privacy principles

## Capture scope

Screen recording captures a tab, window, or full screen only after the user explicitly selects it in Chrome's sharing picker. Shared source audio can include other participants when the user enables Share audio. The user should ask participants before recording. The microphone is recorded separately so analysis can focus on the user's speech. A microphone-only mode remains available.

## Permission and control

Ask for screen sharing and microphone permission only when the user starts a recording. Show a clear recording state and an obvious Stop control in the popup and recorder tab. Let the user play back, download, and delete a recording before analysis. Never start capture automatically.

## Data handling

Keep raw recordings in the browser until the user chooses to send a copy to the local Python API. Future cloud backend work must define retention, deletion, access controls, and provider data handling before sending recordings to AI services. Treat transcripts as sensitive personal data. Do not put recordings or transcripts in logs.

## Feedback boundaries

Report observable behavior such as word count, pace, fillers, and pauses. Do not infer emotion, intelligence, personality, or confidence from speech or video.

## Current milestone

The extension keeps session metadata, notes, recording chunks, the finished meeting video, and a separate microphone recording in its browser origin. Chunks are removed when a session is finalized or deleted. Clicking Analyze my voice copies only the microphone recording and notes to FastAPI at `127.0.0.1:8000`. FastAPI transcribes that audio locally and stores the transcript in SQLite. A local language model at `127.0.0.1:8081` reviews transcript text and stores grammar suggestions. Model files are downloaded from Hugging Face during setup or first use; recordings and transcripts are not sent there. Deleting a session in the extension removes its browser copies but does not remove the API copy; the API has no deletion endpoint yet. Browser storage can be cleared or evicted, so users should download meeting recordings they need to keep.
