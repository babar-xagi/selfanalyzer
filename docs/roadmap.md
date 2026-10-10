# Roadmap

The [blueprint](../project.md) describes the intended sequence. Status here reflects repository work and verification, regardless of checkmarks in the blueprint.

The user's immediate goal is to record a Google Meet or Episoden call with both voices and the call screen, or record themselves on camera; replay it with synchronized words, download video and transcript together, and analyze their mistakes. This takes priority over further coaching categories.

| Milestone | Deliverable | Status |
| --- | --- | --- |
| 000 | Product vision, architecture, privacy rules, and roadmap | Complete |
| 001 | Installable WXT/React/TypeScript extension with popup, Start button, and settings | Type-check, build, and browser UI check passed; Chrome extension load pending |
| 002 | Local microphone recording, timer, playback, download, and delete | Implemented; type-check, build, 2m21s generated-audio playback, delete, and denied-permission checks passed. Real Chrome microphone and completed download checks pending |
| 003 | Optional webcam preview and audio/video recording | Implemented; synthetic camera/audio preview, recording, playback, delete, and camera-denial checks passed. Real Chrome camera/microphone and downloaded-file checks pending |
| 004 | Session lifecycle, local recording store, notes, and interruption recovery | Implemented; type-check, build, synthetic audio/video sessions, note persistence, tab-close recovery, device disconnect, permission denial, and deletion checks passed. Real Chrome device and downloaded-file checks pending |
| 005 | FastAPI session and upload API | Implemented; backend lifecycle tests, TypeScript client to live Python API, synthetic browser UI upload, extension type-check, and build passed. Manual unpacked Chrome upload check pending |
| 006 | Local timestamped speech-to-text | Implemented; backend tests, real WebM speech-to-text API check, extension type-check and build passed. User microphone acceptance check pending |
| 007 | Local grammar coach with corrections, explanations, and timestamps | Implemented; backend and client checks, real Qwen model response, and synthetic end-to-end API check passed. User microphone acceptance pending |
| Meeting screen recording | Camera and microphone permission before screen picker; live camera preview; face-first saved video with screen in a corner; source audio mixed with microphone; popup Stop and saved notification | Implemented; type-check, build, and local storage tests passed. Real Chrome capture, source-audio, camera, and downloaded-file acceptance pending |
| Webcam and synced transcript | Self camera + microphone mode, editable timed transcript, replay highlighting, video/TXT/VTT ZIP, and corrected grammar input | Implemented; extension and backend tests passed. Real camera, transcription accuracy, timing, and downloaded ZIP acceptance pending |
| Direct ChatGPT capture | Pinned popup captures active ChatGPT tab, tab audio, camera inset, and microphone; fixed development extension ID; automatic transcript under video with Copy button | Implemented; type-check, build, fixed-ID test, storage tests, and native host lifecycle test passed. Real Chrome voice call and camera acceptance pending |
| 008–010 | Natural English, speaking analytics, and full report | Planned; MVP 1.0 boundary |
| 011–020 | Video signals, history, storage, progress, practice, and production features | Later |

## Manual device acceptance check

Load the fixed-ID extension in Chrome, open a ChatGPT voice tab, and click Record ChatGPT tab + both voices in the pinned popup. Allow camera and microphone access if asked. Confirm it returns to ChatGPT and the popup shows Recording in background. Speak briefly while ChatGPT responds. Stop from the popup, then replay the saved video and check the ChatGPT page, camera, both voices, and automatically generated transcript below the video. Use Copy transcript and paste the text into a local editor. Click a timed line to replay pronunciation. Correct any misheard words, confirm the transcript, and download the ZIP; open its WebM, TXT, and VTT. Then check Record screen + my camera with Google Meet or Episoden: allow camera and microphone first, confirm the live preview, choose the meeting tab with Share audio, record for at least five seconds, stop sharing, and confirm the saved video shows your face with the meeting screen in a corner and both voices. Check Record screen only and Record my camera separately. Also test permission denial and verify ports 8000 and 8081 shut down after analysis completes.
