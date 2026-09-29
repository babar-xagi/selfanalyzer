# Privacy principles

## Capture scope

The Episoden recording mode captures the tab screen and tab audio, including the partner, only after the user explicitly selects that tab in Chrome's sharing picker and enables tab audio. The user should ask their partner before recording. The microphone is recorded separately so analysis can focus on the user's speech. A microphone-only mode remains available.

## Permission and control

Ask for tab sharing and microphone permission only when the user starts a recording. Show a clear recording state and an obvious Stop control. Let the user play back, download, and delete a recording before analysis. Never start tab capture automatically.

## Data handling

Keep raw recordings in the browser until the user chooses to send a copy to the local Python API. Future cloud backend work must define retention, deletion, access controls, and provider data handling before sending recordings to AI services. Treat transcripts as sensitive personal data. Do not put recordings or transcripts in logs.

## Feedback boundaries

Report observable behavior such as word count, pace, fillers, and pauses. Do not infer emotion, intelligence, personality, or confidence from speech or video.

## Current milestone

The extension keeps session metadata, notes, recording chunks, the finished full-call video, and a separate microphone recording in its browser origin. Chunks are removed when a session is finalized or deleted. Clicking Analyze my voice copies only the microphone recording and notes to FastAPI at `127.0.0.1:8000`. FastAPI transcribes that audio locally and stores the transcript in SQLite. A local language model at `127.0.0.1:8081` reviews transcript text and stores grammar suggestions. Model files are downloaded from Hugging Face during setup or first use; recordings and transcripts are not sent there. Deleting a session in the extension removes its browser copies but does not remove the API copy; the API has no deletion endpoint yet. Browser storage can be cleared or evicted, so users should download full-call recordings they need to keep.
