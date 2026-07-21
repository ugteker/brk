# Agent Discussions & Synthetic Sources — Design Spec

**Date:** 2026-07-16  
**Status:** Approved  
**Author:** Ugur Teker + Copilot

---

## 1. Overview

Add a **Studio hub** (5th nav tab, route `/studio`) where two or more AI Agents can
"discuss" their reports and source material with each other. Each discussion run produces:

1. A **text transcript** — rendered in-app as a speaker-bubble conversation
2. An **audio podcast episode** — rendered on demand via OpenAI TTS, one voice per agent
3. A **synthetic Source** in the Library — the discussion itself becomes a first-class
   Source with episodes, fully re-analyzable by other agents (fully recursive)

Platform-scope note: although the initial use case is financial content, the platform is
source-type agnostic — discussions work for any domain.

---

## 2. Domain Model

### 2.1 New tables

#### `Discussion`
| Column | Type | Notes |
|---|---|---|
| id | cuid | PK |
| ownerUserId | string | FK → User |
| name | string | user-chosen label |
| description | string? | optional context prompt |
| format | enum | `free_form \| structured \| hosted \| hybrid` |
| scheduleJson | JSON? | same shape as Playbook scheduleJson (null = unscheduled) |
| syntheticSourceId | string? | FK → Source (auto-created on first run) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

#### `DiscussionParticipant`
| Column | Type | Notes |
|---|---|---|
| id | cuid | PK |
| discussionId | string | FK → Discussion |
| agentId | string | FK → Agent |
| role | enum | `speaker \| host` |
| voiceId | string | OpenAI TTS voice: alloy/echo/fable/onyx/nova/shimmer |
| speakerOrder | int | turn-taking order (0-based) |

#### `DiscussionRun`
| Column | Type | Notes |
|---|---|---|
| id | cuid | PK |
| discussionId | string | FK → Discussion |
| status | enum | `pending \| running \| done \| error` |
| triggeredBy | enum | `manual \| auto_suggested \| scheduled` |
| errorMessage | string? | set on error |
| startedAt | DateTime? | |
| completedAt | DateTime? | |
| syntheticSourceItemId | string? | FK → SourceItem (episode produced) |
| audioUrl | string? | stitched MP3 URL (set after TTS render) |

#### `DiscussionTurn`
| Column | Type | Notes |
|---|---|---|
| id | cuid | PK |
| discussionRunId | string | FK → DiscussionRun |
| participantId | string | FK → DiscussionParticipant |
| turnIndex | int | 0-based ordering |
| segmentLabel | string? | null for free_form; e.g. "opening", "disagreement" |
| content | TEXT | the spoken text for this turn |
| audioUrl | string? | per-turn TTS chunk URL (set after rendering) |
| createdAt | DateTime | |

### 2.2 Changes to existing tables

- `Source.type` enum gains: `synthetic_discussion`
- `SourceItem.content` already stores text — no change needed; transcript stored here
- `Notification` (existing): gains `type: 'discussion_suggestion'` for auto-suggest alerts

### 2.3 Synthetic Source lifecycle

When a Discussion's first run completes:
1. A `Source` record is created with `type: synthetic_discussion`, `name` = discussion name,
   `ownerUserId` = discussion owner — stored in `Discussion.syntheticSourceId`
2. Each `DiscussionRun` (on completion) appends a `SourceItem` with:
   - `title` = `"<Discussion name> — <date>"`
   - `content` = full transcript (speaker: text, speaker: text…)
   - `audioUrl` = stitched MP3 once rendered
3. The synthetic Source appears in the Library tagged `synthetic_discussion`
4. Any Agent can be pointed at it — transcript is indexed and analyzed exactly like a
   podcast transcript. Fully recursive: agents can analyze a discussion, then discuss
   *that* analysis, ad infinitum.

---

## 3. Backend API

All routes under `/api/discussions`, authenticated.

| Method | Path | Description |
|---|---|---|
| GET | `/api/discussions` | List user's discussions |
| POST | `/api/discussions` | Create discussion |
| GET | `/api/discussions/:id` | Get discussion + participants + runs |
| PATCH | `/api/discussions/:id` | Update name/format/schedule/participants |
| DELETE | `/api/discussions/:id` | Delete discussion (and its runs) |
| POST | `/api/discussions/:id/runs` | Trigger a new run (manual) |
| GET | `/api/discussions/:id/runs` | List runs for a discussion |
| GET | `/api/discussions/:id/runs/:runId` | Get run detail + turns |
| GET | `/api/discussions/:id/runs/:runId/stream` | SSE stream of turns as generated |
| POST | `/api/discussions/:id/runs/:runId/audio` | Trigger TTS rendering (async) |
| GET | `/api/discussions/:id/runs/:runId/audio/status` | Poll TTS render status |

---

## 4. AI Orchestration

### 4.1 Run execution (per DiscussionRun)

```
1. Load context for each participant:
   - Agent's promptVersion (persona / system prompt)
   - Agent's last N reports (configurable, default 3)
   - Raw transcripts of sources the agent analyzed

2. Build a "director prompt" describing:
   - Format (free_form / structured / hosted / hybrid)
   - Participants with their personas and key views from their reports
   - Segment structure (if structured/hosted)
   - Turn budget (default: ~12 turns total, configurable)
   - User's description / custom instructions (Discussion.description)

3. For each turn (round-robin or host-driven order):
   - Identify current speaker
   - Build message history (all prior turns as chat messages)
   - Call Claude with: system = current speaker's persona prompt,
     messages = [director context, prior turns, "Your turn as <name>:"]
   - Append returned text as a DiscussionTurn record
   - Stream turn via SSE (event: "turn", data: { turnIndex, speakerName, content })

4. On all turns complete:
   - Assemble full transcript
   - Create/update synthetic SourceItem (episode)
   - Emit SSE event: "done"
   - Create auto-suggest notifications for related agents if applicable
```

### 4.2 Format behaviour

| Format | Behaviour |
|---|---|
| `free_form` | Pure round-robin, no segments. LLM drives natural conversation. |
| `structured` | Fixed segments: opening → disagreements → common ground → final call. Agents take turns within each. |
| `hosted` | One participant with `role: host` steers with questions; others respond. |
| `hybrid` | Structured segments, free-form dialogue within each segment. |

### 4.3 Auto-suggestion trigger

After any agent run completes: check if another agent has analyzed the same `sourceId`
within the last 30 days. If yes, create a `Notification` of type `discussion_suggestion`:
*"Agent A and Agent B both analysed [Source X] — start a discussion?"* with a CTA link.

---

## 5. TTS Rendering (OpenAI)

- **Provider:** OpenAI TTS API (`tts-1` model, or `tts-1-hd` for higher quality)
- **Voice assignment:** each `DiscussionParticipant.voiceId` maps to one of:
  `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- **Rendering flow:**
  1. User triggers `POST /runs/:runId/audio`
  2. Server iterates `DiscussionTurn` records in order
  3. Per turn: `openai.audio.speech.create({ model: 'tts-1', voice: participant.voiceId, input: turn.content })`
  4. Save audio chunk to object storage; set `DiscussionTurn.audioUrl`
  5. Stitch chunks (in-order concatenation of MP3 buffers)
  6. Save stitched MP3; set `DiscussionRun.audioUrl`
- **Storage:** same storage adapter used for report artifacts (local FS in dev, S3-compatible in prod)
- **Cost guard:** warn user if transcript exceeds ~10,000 chars (~$0.15 at tts-1 pricing) before rendering

---

## 6. Frontend — Studio Hub

### 6.1 Navigation

New 5th tab: **Studio** (icon: `AudioOutlined` or `TeamOutlined`), route `/studio`.
Added to the hub nav bar alongside Feed / Library / Agents / Playbooks.

### 6.2 Studio hub views

**Discussions list (default)**
- Cards: discussion name, participant avatar stack (agent avatars), format badge, last run date, status pill
- Empty state: "Start your first discussion — pick two agents and let them debate their findings"
- "+ New Discussion" button top-right

**Discussion detail** (click a card)
- Header: name, participants, format, schedule info, "Run now" + "Edit" buttons
- Runs list: accordion of past runs, newest first
- Expanded run: transcript in chat-bubble layout (speaker name + avatar left/right), audio player if MP3 ready
- "Render audio" button if TTS not yet triggered
- Live SSE view when a run is in progress: turns appear in real time

**New Discussion wizard** (3 steps)
1. **Pick agents** — multi-select from user's agents (min 2), assign host role if desired
2. **Configure** — discussion name, format selector, voice assignment per agent, custom instructions textarea
3. **Schedule** — run once now / recurring schedule (same schedule picker as Playbook wizard)

### 6.3 Library integration

Synthetic sources in Library:
- Tagged with `🎙 Synthetic` badge on source card
- Episodes list shows each DiscussionRun as an episode with date + play button
- Assignable to playbooks / agents like any other source

### 6.4 i18n

All UI strings added to both `en.json` and `de.json` under `studio.*` namespace.

---

## 7. Scheduling

Discussions with a `scheduleJson` are picked up by the existing scheduler (same cron
infrastructure used by Playbooks). The scheduler calls `POST /api/discussions/:id/runs`
with `triggeredBy: 'scheduled'`. No new scheduler infrastructure needed.

---

## 8. Error handling

| Scenario | Behaviour |
|---|---|
| Claude API error mid-run | Mark run `error`, store partial turns, allow retry |
| TTS render fails | Run stays `done`; audio stays null; user can retry render |
| Synthetic source creation fails | Run still completes; retry source creation on next run |
| No shared sources between agents | Allowed — agents discuss based on reports only |
| Only 1 participant | Validation error at creation time |

---

## 9. Out of scope (Phase 1)

- Real-time "watch them talk live" streaming to multiple concurrent viewers
- ElevenLabs or other TTS providers (can be added via adapter pattern later)
- Public/shareable discussion links
- Agent-initiated discussions (agents autonomously starting discussions without user setup)
- Discussion export to external podcast platforms (RSS feed, etc.) — strong candidate for Phase 2

---

## 10. Open questions / future

- **RSS feed** for synthetic sources → subscribe in any podcast app (Phase 2 candidate)
- **Discussion templates** — shareable format configs (e.g. "Bull vs Bear", "Weekly Roundtable")
- **Audience mode** — read-only users can subscribe to a synthetic source's feed
