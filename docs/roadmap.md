# Roadmap

The [blueprint](../project.md) describes the intended sequence. Status here reflects repository work and verification, regardless of checkmarks in the blueprint.

| Milestone | Deliverable | Status |
| --- | --- | --- |
| 000 | Product vision, architecture, privacy rules, and roadmap | Complete |
| 001 | Installable WXT/React/TypeScript extension with popup, Start button, and settings | Type-check, build, and browser UI check passed; Chrome extension load pending |
| 002 | Reliable microphone recording, playback, save, and delete | Planned |
| 003 | Optional webcam preview and recording | Planned |
| 004 | Session lifecycle and device/error handling | Planned |
| 005 | FastAPI session and upload API | Planned |
| 006 | Timestamped speech-to-text | Planned |
| 007–010 | Grammar, natural English, speaking analytics, and full report | Planned; MVP 1.0 boundary |
| 011–020 | Video signals, history, storage, progress, practice, and production features | Later |

## Next milestone: 002

Request microphone access after a user action, record only the user's microphone, show a running timer and Stop control, and provide playback, save, and delete. Test several-minute recordings and permission denial in Chrome before moving to webcam capture.
