# Privacy principles

## Capture scope

The first recording implementation will capture only the user's microphone and, if they choose, their webcam. It must not capture another participant's audio or video automatically. A future feature that changes that scope requires explicit user controls and a review of platform rules and consent requirements.

## Permission and control

Ask for microphone or camera permission only when the user starts a recording that needs it. Show a clear recording state and an obvious Stop control. Let the user play back and delete a recording before any upload. Do not request media permissions in the extension foundation.

## Data handling

Keep raw recordings local until the user chooses to upload them. Future backend work should define retention, deletion, access controls, and provider data handling before sending recordings to AI services. Treat transcripts as sensitive personal data. Do not put recordings or transcripts in logs.

## Feedback boundaries

Report observable behavior such as word count, pace, fillers, and pauses. Do not infer emotion, intelligence, personality, or confidence from speech or video.

## Current milestone

Milestone 001 stores only the selected practice focus in the extension origin. It does not record, transmit, or analyze media.
