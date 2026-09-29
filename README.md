# Conversation Coach

Conversation Coach helps English learners turn real speaking practice into useful feedback for their next conversation.

**Current status:** The product foundation and extension UI are implemented. Milestone 002 adds local microphone recording. AI analysis and video are future milestones. See the [roadmap](docs/roadmap.md) for verification status.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

The Chrome extension has a React popup with a Start Session button and an options page for choosing a practice focus. Start Session opens a dedicated recording tab. Click **Start Recording** there to request microphone access, then **Stop Recording** to play back, download, or delete the audio. The recorder uses only your microphone; it does not capture other participants or upload anything.

Keep the recording tab open until you have downloaded the file. The recording exists only in that tab's memory and is lost if the tab closes or reloads. Persistent sessions are planned for a later milestone.

### Run locally

Requires Node.js 20+ and npm. From `extension/`:

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run typecheck
npm run build
```

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Open the popup, click **Start Session**, and record a few minutes of speech in the new tab. Stop, play the recording, download it, and delete the in-tab copy. Also deny microphone permission once to check the error message. Open **Settings** and choose a focus, then reopen the popup to confirm it is remembered.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
