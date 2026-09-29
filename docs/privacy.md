# Privacy principles

## Capture scope

The first recording implementation will capture only the user's microphone and, if they choose, their webcam. It must not capture another participant's audio or video automatically. A future feature that changes that scope requires explicit user controls and a review of platform rules and consent requirements.

## Permission and control

Ask for camera permission only when the user enables the preview, and for microphone permission only when they start a recording. Show a clear recording state and an obvious Stop control. Let the user play back and delete a recording before any upload. Do not request media permissions in the extension foundation.

## Data handling

Keep raw recordings in the browser until the user chooses to send a copy to the local Python API. Future cloud backend work must define retention, deletion, access controls, and provider data handling before sending recordings to AI services. Treat transcripts as sensitive personal data. Do not put recordings or transcripts in logs.

## Feedback boundaries

Report observable behavior such as word count, pace, fillers, and pauses. Do not infer emotion, intelligence, personality, or confidence from speech or video.

## Current milestone

Milestone 007 keeps the selected practice focus, session metadata, notes, recording chunks, and finished media in the extension's browser origin. The chunks are removed when a session is finalized or deleted. Clicking Send to local API copies the recording and notes to FastAPI at `127.0.0.1:8000`, which stores them in local SQLite and files. FastAPI transcribes the recording with a local speech model and stores the transcript in the same local SQLite database. A local language model at `127.0.0.1:8081` reviews transcript text and returns grammar suggestions, which are also stored in SQLite. Model files are downloaded from Hugging Face on setup or first use; recordings and transcripts are not sent to Hugging Face. Deleting a session in the extension removes its browser copy but does not remove the API copy; the API has no deletion endpoint yet. Browser storage can be cleared or evicted, so users should download recordings they need to keep. The browser may show camera and microphone permission prompts after the corresponding user actions.
