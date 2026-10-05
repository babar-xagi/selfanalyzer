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
| Meeting screen recording | User-selected tab, window, or screen; source audio mixed with microphone for replay; separate microphone track for personal analysis; popup Stop and saved notification | Implemented; type-check, build, and local storage tests passed. Real Chrome capture, source-audio, and downloaded-file acceptance pending |
| Webcam and synced transcript | Self camera + microphone mode, editable timed transcript, replay highlighting, video/TXT/VTT ZIP, and corrected grammar input | Implemented; extension and backend tests passed. Real camera, transcription accuracy, timing, and downloaded ZIP acceptance pending |
| 008–010 | Natural English, speaking analytics, and full report | Planned; MVP 1.0 boundary |
| 011–020 | Video signals, history, storage, progress, practice, and production features | Later |

## Manual device acceptance check

Load the extension in Chrome and open Google Meet or Episoden. In the popup, click Record meeting screen, choose the meeting tab, enable Share tab audio, and allow microphone access. Confirm the meeting tab returns to the front and the popup shows Recording in background. Speak with a participant who agreed to recording. Stop from the popup, confirm the Recorded successfully notification, and play the video to confirm both voices and the call screen. Click Create transcript and confirm the transcript contains only your speech. While playing, confirm the line below the video and highlighted transcript row follow the recording; click a timestamp to seek. Correct any misheard words, confirm the transcript, and download the ZIP; open the WebM, TXT, and VTT. Repeat with Record my camera and confirm preview, microphone audio, transcription, and export. Also test missing source audio, denied sharing, denied camera/microphone access, and interrupted recovery.
