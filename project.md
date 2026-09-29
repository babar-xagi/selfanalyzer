# Project Blueprint — AI Conversation Coach 🎙️🧠📈

I would define the project more broadly than an “Episoden recorder.”

The product should eventually become a **browser-based AI communication coach that analyzes real human conversations and helps users improve English, speaking fluency, and observable communication habits over time.**

Episoden can be the **first platform you personally use it with**, but the architecture should not permanently depend on Episoden.

---

## 1. Core Project Goal

### Mission

> Help English learners improve through real conversations by automatically capturing their own speaking, analyzing it after each session, identifying recurring weaknesses, suggesting better ways to speak, and measuring improvement over time.

The important loop is:

```text
REAL HUMAN CONVERSATION
          ↓
       RECORD
          ↓
     TRANSCRIBE
          ↓
       ANALYZE
          ↓
      FEEDBACK
          ↓
 TARGETED PRACTICE
          ↓
NEXT REAL CONVERSATION
          ↓
MEASURE IMPROVEMENT
```

That loop is the real product.

Recording is only the first component.

---

# 2. Main Product Areas

Eventually the system has six major areas:

```text
AI Conversation Coach
│
├── 1. Recording
│     ├── microphone
│     ├── webcam
│     └── session management
│
├── 2. Speech Understanding
│     ├── transcription
│     ├── timestamps
│     ├── pauses
│     └── filler words
│
├── 3. English Coach
│     ├── grammar
│     ├── vocabulary
│     ├── sentence structure
│     ├── natural expressions
│     └── pronunciation
│
├── 4. Communication Coach
│     ├── speaking pace
│     ├── interruptions
│     ├── listening/speaking balance
│     ├── camera-facing behavior
│     └── visible movement
│
├── 5. Progress Engine
│     ├── recurring mistakes
│     ├── trends
│     ├── personal weaknesses
│     ├── goals
│     └── next-session challenges
│
└── 6. Dashboard
      ├── recordings
      ├── transcripts
      ├── corrections
      ├── highlights
      └── progress
```

---

# 3. Technology Stack

Keep the first architecture simple:

```text
Browser
│
├── WXT
├── TypeScript
├── React
├── Tailwind
│
├── getUserMedia()
└── MediaRecorder
        │
        ▼
Python Backend
│
├── FastAPI
├── uv
├── AI APIs
├── speech analysis
└── background processing
        │
        ▼
Storage
│
├── PostgreSQL
└── S3-compatible object storage
```

Later:

```text
Zig / WASM
```

only where local high-performance audio/video processing gives us a genuine advantage.

---

# 4. Important Product Principle

### V1 records **the user**, not everybody else

Prefer:

```text
Your microphone ✅
Your webcam ✅
Your speech ✅
Your communication behavior ✅
```

Avoid automatically capturing another participant's private audio/video unless the product has appropriate consent and the relevant platform rules allow it.

That keeps the first version much cleaner technically and from a privacy perspective.

---

# 5. Milestone 000 — Product Foundation

Before coding features, establish what the product actually is.

### Build

Create:

```text
README.md
docs/
├── vision.md
├── architecture.md
├── privacy.md
└── roadmap.md
```

Define:

- problem
- target user
- product goal
- MVP
- non-goals
- privacy rules
- technologies
- architecture
- milestones

### Target user

Initially:

> English learners who already practice speaking through online human conversations.

### Success condition

We can explain the project in one sentence:

> “Have a real conversation, and afterward receive personalized AI coaching showing how you can speak better next time.”

**Milestone 000 complete ✅**

---

# 6. Milestone 001 — Browser Extension Foundation

No recording yet.

Learn:

```text
Browser
Extension
Manifest
TypeScript
Components
Events
State
```

Build:

```text
extension/
├── entrypoints/
├── components/
├── lib/
└── assets/
```

Extension popup:

```text
┌──────────────────────────────┐
│       Conversation Coach     │
│                              │
│     Ready for practice       │
│                              │
│      [ Start Session ]       │
│                              │
└──────────────────────────────┘
```

At this milestone clicking buttons can simply update UI state.

### Completion condition

Extension successfully:

- installs in Chrome
- opens popup
- renders React
- uses TypeScript
- has Start button
- has Settings page

**Milestone 001 complete ✅**

---

# 7. Milestone 002 — Microphone Recording 🎤

Now implement only audio.

Flow:

```text
Start Session
     ↓
Ask microphone permission
     ↓
Microphone stream
     ↓
MediaRecorder
     ↓
Stop
     ↓
audio.webm
     ↓
Playback
```

UI:

```text
🎤 Recording

00:04:32

[ Stop ]

──────────────

After stop:

▶ Play recording
💾 Save recording
🗑 Delete
```

### Do NOT add yet

No:

- AI
- Python
- database
- login
- video
- transcription

### Completion condition

You can record yourself talking for several minutes and play it back reliably.

**Milestone 002 complete ✅**

---

# 8. Milestone 003 — Webcam Recording 📹

Now add your webcam.

Learn:

```text
MediaStream
Audio tracks
Video tracks
Permissions
Video preview
MediaRecorder
```

Flow:

```text
Microphone ─┐
            ├─ MediaStream → recording.webm
Webcam ─────┘
```

Extension displays:

```text
┌──────────────────────────┐
│                          │
│       Camera Preview     │
│                          │
└──────────────────────────┘

🎤 Microphone connected
📹 Camera connected

[ Start ]
```

### Completion condition

You can:

- preview camera
- record camera
- record microphone
- stop recording
- replay recording
- delete recording

**Milestone 003 complete ✅**

---

# 9. Milestone 004 — Session Engine

Recording alone isn't enough.

Create the concept of a **session**.

Example:

```text
Session
│
├── session_id
├── started_at
├── ended_at
├── duration
├── recording
├── status
└── notes
```

Possible states:

```text
IDLE
 ↓
PREPARING
 ↓
RECORDING
 ↓
PROCESSING
 ↓
COMPLETED
```

Handle problems properly:

```text
Camera denied
Microphone denied
Recording interrupted
Tab closed
Device disconnected
Recording failed
```

### Completion condition

Recording works as a reliable session rather than a random MediaRecorder demo.

**Milestone 004 complete ✅**

---

# 10. Milestone 005 — Python Backend 🐍

Now Python enters.

Architecture:

```text
Chrome Extension
       │
       │ HTTP
       ▼
   FastAPI
```

Initial endpoints:

```text
GET  /health

POST /sessions

POST /sessions/{id}/recording

POST /sessions/{id}/finish

GET /sessions/{id}
```

Initially don't use AI.

Just prove:

```text
Extension
   ↓
uploads recording
   ↓
Python receives recording
   ↓
Python returns success
```

### Completion condition

Your TypeScript extension successfully communicates with your Python application.

**Milestone 005 complete ✅**

---

# 11. Milestone 006 — Speech-to-Text

Now make the recording useful.

Pipeline:

```text
recording.webm
      ↓
Backend
      ↓
Transcription
      ↓
Transcript
```

Example:

```text
00:00
Hello, my name is Babar.

00:06
I'm currently studying computer science...

00:15
Yesterday I go to university...
```

Store timestamps whenever possible.

### UI

```text
Transcript

00:00  Hello, my name is Babar.

00:06  I'm currently studying...

00:15  Yesterday I go to university...
```

### Completion condition

Record yourself speaking →

stop →

receive readable transcript.

**Milestone 006 complete ✅**

---

# 12. Milestone 007 — Grammar Coach 🧠

This is the first milestone where the extension becomes a real **English-learning product**.

AI receives:

```text
Transcript
```

and returns structured information.

For every useful correction:

```text
Original
Corrected
Natural alternative
Explanation
Category
Timestamp
```

Example:

```text
❌ Yesterday I go to university.

✅ Yesterday I went to university.

💬 Natural:
I went to university yesterday.

Reason:
The event happened in the past,
so "go" becomes "went".

Category:
Past tense
```

### Categories

```text
Grammar
├── tense
├── articles
├── prepositions
├── word order
├── subject/verb agreement
└── sentence structure
```

### Completion condition

The AI doesn't merely say:

> “You made seven errors.”

It teaches:

> what was wrong  
> why it was wrong  
> how to say it correctly  
> how a natural speaker may phrase it.

**Milestone 007 complete ✅**

---

# 13. Milestone 008 — Natural English Coach

Grammar alone doesn't make someone sound natural.

Example:

```text
Technically acceptable:

I want to know regarding this thing.

More natural:

I'd like to learn more about it.
```

Build categories for:

```text
Natural phrasing
Vocabulary
Repetition
Overly formal wording
Word choice
Sentence simplification
Conversation transitions
Question formation
```

Example feedback:

```text
You frequently said:

"According to me"

A more natural conversational phrase:

"In my opinion..."
"From my perspective..."
"I think..."
```

### Completion condition

The system improves not only correctness but **natural conversation ability**.

**Milestone 008 complete ✅**

---

# 14. Milestone 009 — Speaking Analytics

Now analyze speech behavior.

Calculate:

```text
Speaking duration
Words spoken
Words/minute
Average pause
Longest pause
Filler words
Repeated words
Sentence length
```

Example:

```text
Speaking time
08:42

Words
894

Average pace
103 words/minute

Fillers

um       12
actually 8
like     7

Longest pause
4.8 seconds
```

### Important

Don't say:

> You have low confidence.

Instead say something measurable:

> You had 14 pauses longer than three seconds.

That is factual and actionable.

**Milestone 009 complete ✅**

---

# 15. Milestone 010 — Complete Session Report

Now combine everything.

After a conversation:

```text
SESSION REPORT
━━━━━━━━━━━━━━━━━━━━━━━━

Conversation
27 minutes

Speaking
11:42

Words
1,203

━━━━━━━━━━━━━━━━━━━━━━━━

English

Grammar issues     8
Vocabulary tips    5
Natural phrases    11
Fillers            17

━━━━━━━━━━━━━━━━━━━━━━━━

Top improvement area

PAST TENSE

━━━━━━━━━━━━━━━━━━━━━━━━

Best correction

❌ Yesterday I go there.

✅ Yesterday I went there.

━━━━━━━━━━━━━━━━━━━━━━━━

Next challenge

Use past tense correctly
when describing yesterday.
```

Now you have your **first true MVP**.

🎉

---

# 16. MILESTONE 011 — Video Communication Analytics 📹

Only now would I start serious video analysis.

Analyze observable signals such as:

```text
Camera-facing time
Head direction
Large repetitive movements
Time away from camera
Speaking/listening periods
```

Potential report:

```text
During your speaking time:

Facing camera:
72%

Looking away:
28%

Frequent head movement:
4 periods

Camera absence:
18 seconds
```

Avoid trying to scientifically infer emotions, intelligence, personality or confidence from someone's face.

---

# 17. Milestone 012 — PostgreSQL Database

Until this point, individual reports are enough.

Now introduce history.

Tables may eventually include:

```text
users

sessions

recordings

transcripts

sentences

corrections

speech_metrics

video_metrics

learning_goals
```

Relationship:

```text
User
 │
 ├── Session #1
 │    ├── Transcript
 │    ├── Corrections
 │    └── Metrics
 │
 ├── Session #2
 │
 └── Session #3
```

**Milestone 012 complete ✅**

---

# 18. Milestone 013 — Recording Storage

Use object storage for large media:

```text
Database
    ↓
recording ID / metadata

Object Storage
    ↓
actual .webm recording
```

Give users controls:

```text
Keep recording

Delete recording

Automatically delete
after analysis
```

Privacy should become a first-class product feature.

---

# 19. Milestone 014 — Progress Engine 📈

This is one of the most valuable milestones.

Compare:

```text
Session 1
Session 2
Session 3
...
Session 30
```

Find repeated mistakes.

Example:

```text
YOUR RECURRING ISSUES
━━━━━━━━━━━━━━━━━━━━━━

Past tense
18 → 14 → 11 → 6

Articles
21 → 16 → 13 → 9

"actually"
17 → 15 → 9 → 5

Long pauses
24 → 19 → 12 → 8
```

Now the AI understands:

> this wasn't just one mistake — it's a pattern.

---

# 20. Milestone 015 — Personal AI Coach

Now the system begins planning the user's next practice session.

Before starting:

```text
TODAY'S MISSION 🎯

Based on your previous 12 conversations:

1. Focus on past tense.

2. Avoid using "actually"
   more than three times.

3. Try these expressions:

   "From my perspective..."
   "That reminds me of..."
   "What about you?"

[ Start Conversation ]
```

Afterward:

```text
Mission result

Past tense
✅ improved

Actually
⚠ used 6 times

New expressions
✅ 2 / 3 used
```

This creates a proper learning loop.

---

# 21. Milestone 016 — Video Highlights

Make reviewing long sessions easy.

AI creates markers:

```text
00:42 ⭐ Good introduction

02:17 ⚠ Grammar issue

05:46 🗣 Pronunciation practice

09:32 ⭐ Strong answer

13:20 ⏸ Long hesitation

17:52 💡 Better vocabulary available
```

Click:

```text
09:32
```

and video jumps directly there.

This could become one of the best UX features.

---

# 22. Milestone 017 — Pronunciation Coach

This should be separate from grammar analysis.

Example:

```text
Word:
development

Your pronunciation:
...

Target practice:
development

Practice ×3

🎤 Record
▶ Compare
```

Eventually users can maintain a personal list:

```text
YOUR DIFFICULT WORDS

development
particularly
entrepreneur
comfortable
architecture
```

---

# 23. Milestone 018 — Personal Practice Generator

Turn real mistakes into exercises.

If you repeatedly make:

```text
I go yesterday.
```

the system generates:

```text
Choose:

Yesterday I ___ to university.

A. go
B. went
C. gone
```

Or:

```text
Rewrite:

Yesterday I meet my professor.
```

Your own conversations become your English curriculum.

That is powerful.

---

# 24. Milestone 019 — Platform Independence

This is strategically important.

Don't permanently call the product:

> Episoden Extension

Instead design:

```text
Conversation Coach
```

which could eventually work with:

```text
Episoden
Google Meet
Zoom Web
Discord Web
language exchange websites
online classes
mock interviews
presentation practice
```

The product becomes much larger than one website.

---

# 25. Milestone 020 — Production Product

Only after the core system is genuinely useful do you add things like:

```text
Authentication
Cloud sync
Subscription plans
Payments
Multiple devices
Team accounts
Cross-browser support
Monitoring
Analytics
Backups
Security hardening
```

These are product infrastructure.

They are **not beginner MVP requirements**.

---

# What NOT to Build Initially ❌

This is extremely important.

Don't begin with:

```text
❌ mobile application

❌ desktop application

❌ Zig backend

❌ custom speech recognition model

❌ custom LLM

❌ live real-time corrections

❌ automatic emotion detection

❌ social network

❌ payments

❌ complicated authentication

❌ support for ten platforms

❌ massive dashboard

❌ gamification

❌ native application
```

Otherwise you'll spend months building infrastructure before experiencing the actual product.

---

# Your MVP Boundary

I would officially define **MVP 1.0** as:

```text
Chrome Extension
      ↓
Record user's microphone + webcam
      ↓
Finish session
      ↓
Upload
      ↓
Transcribe
      ↓
AI analyzes English
      ↓
Grammar corrections
      ↓
Natural alternatives
      ↓
Fillers / pauses / speaking speed
      ↓
Session report
```

Nothing more is required to prove the idea.

---

# Long-Term Vision 🚀

Eventually:

```text
              AI COMMUNICATION COACH

                       │
          ┌────────────┼────────────┐
          │            │            │
       English      Speaking    Communication
          │            │            │
          ▼            ▼            ▼

       Grammar        Pace       Camera behavior
       Vocabulary     Pauses     Conversation flow
       Naturalness    Fillers    Listening
       Pronunciation  Rhythm     Turn-taking

          └────────────┼────────────┘
                       │
                       ▼

                Progress Engine

                       │
                       ▼

                 Personal AI Coach

                       │
                       ▼

        "Here's what to practice next."
```

The big idea isn't:

> **AI checks my grammar.**

The bigger idea is:

> **Every real conversation teaches the system more about how I communicate, and the system turns that history into personalized practice for my next conversation.**

That is the product I would build. 🎯

And because you're learning programming while building it, I would treat **Milestone 001 as our next actual development step** rather than trying to code the entire architecture at once. TypeScript and browser fundamentals first; Python enters only after local recording works reliably.
