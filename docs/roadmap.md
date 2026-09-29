# Roadmap

The [blueprint](../project.md) describes the intended sequence. Status here reflects repository work and verification, regardless of checkmarks in the blueprint.

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
| 008–010 | Natural English, speaking analytics, and full report | Planned; MVP 1.0 boundary |
| 011–020 | Video signals, history, storage, progress, practice, and production features | Later |

## Manual device acceptance check

Load the extension in Chrome. First record several minutes in audio-only mode, then repeat with the camera preview enabled. Stop, play each recording, download it, and delete the local session. Check camera and microphone denial and disconnected devices. Close the recording tab mid-session, reopen it, and check the recovered partial recording after 30 seconds.
