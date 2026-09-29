# Roadmap

The [blueprint](../project.md) describes the intended sequence. Status here reflects repository work and verification, regardless of checkmarks in the blueprint.

| Milestone | Deliverable | Status |
| --- | --- | --- |
| 000 | Product vision, architecture, privacy rules, and roadmap | Complete |
| 001 | Installable WXT/React/TypeScript extension with popup, Start button, and settings | Type-check, build, and browser UI check passed; Chrome extension load pending |
| 002 | Local microphone recording, timer, playback, download, and delete | Implemented; type-check, build, 2m21s generated-audio playback, delete, and denied-permission checks passed. Real Chrome microphone and completed download checks pending |
| 003 | Optional webcam preview and recording | Planned |
| 004 | Session lifecycle and device/error handling | Planned |
| 005 | FastAPI session and upload API | Planned |
| 006 | Timestamped speech-to-text | Planned |
| 007–010 | Grammar, natural English, speaking analytics, and full report | Planned; MVP 1.0 boundary |
| 011–020 | Video signals, history, storage, progress, practice, and production features | Later |

## Milestone 002 acceptance check

Load the extension in Chrome, record for several minutes, stop, play the audio, download it, and delete the in-tab copy. Check microphone denial and a disconnected device. Complete this check before adding webcam capture in Milestone 003.
