# Conversation Coach

Conversation Coach helps English learners turn real speaking practice into useful feedback for their next conversation.

**Current status:** Milestone 000 (product foundation) is complete. Milestone 001 extension source has passed type-checking, a production build, and a browser UI check; manual loading as a Chrome extension remains to be checked. Recording and AI analysis are future milestones.

## Who it is for

English learners who already practice speaking with other people online and want specific, measurable ways to improve.

## Current extension

The Chrome extension has a React popup with a Start Session button and an options page for choosing a practice focus. Start Session currently changes the popup's local UI state; it does not access the microphone or save a recording.

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

To load the build manually in Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/.output/chrome-mv3`. Open the popup, click **Start Session**, then open **Settings** and choose a focus. Reload the popup to confirm the focus is remembered.

## Project documents

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Privacy](docs/privacy.md)
- [Roadmap](docs/roadmap.md)
- [Original blueprint](project.md)

The product specification in `project.md` describes a long-term plan. The roadmap records implementation status based on what exists and has been verified in this repository.
