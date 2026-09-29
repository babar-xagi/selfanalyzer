# Roadmap

The [blueprint](../project.md) describes the intended sequence. Status here reflects repository work and verification, regardless of checkmarks in the blueprint.

The user's immediate goal is to record an Episoden call with both voices and the call screen, download and replay the complete recording, and then analyze their own mistakes. This takes priority over further coaching categories.

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
| Episoden recording | User-selected Episoden tab video and audio, mixed with microphone for replay; separate microphone track for personal analysis | Implemented; type-check and build passed. Real Chrome call capture and downloaded-file acceptance pending |
| 008–010 | Natural English, speaking analytics, and full report | Planned; MVP 1.0 boundary |
| 011–020 | Video signals, history, storage, progress, practice, and production features | Later |

## Manual device acceptance check

Load the extension in Chrome and open Episoden in another tab. Start a recording, choose Chrome Tab, select Episoden, and enable Share tab audio. Speak with a partner who has agreed to recording. Stop, play the video to confirm both voices and the call screen, download it, and open the downloaded file. Click Analyze my voice and confirm the transcript contains only your speech. Click a transcript or correction timestamp and confirm playback jumps to that moment. Also test missing tab audio, denied tab sharing, denied microphone access, and interrupted recovery.
