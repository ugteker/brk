# Unified Realtime and Source Picker Design

**Date:** 2026-07-22  
**Status:** Approved

## Goal

Deliver reliable, cross-tab and cross-device live updates for each user's Runs,
Reports, Discussions, Sources, and Marketplace actions. Replace the two
resource-specific SSE streams with one cluster-safe transport. Keep source
search results contained so modal actions remain visible.

## Current State

Only two flows use SSE today:

- Agent runs and reports: `/api/agents/:agentId/stream`.
- Discussion turns: `/api/discussions/:id/runs/:runId/stream`.

Marketplace actions use REST mutations and local refreshes. Source details poll
every five seconds. The nginx proxy disables buffering, but the existing streams
can remain silent for up to 20 seconds, and the Discussion hook closes on the
first error. This is vulnerable to production proxy/tunnel idle interruptions.

The API now runs multiple Node cluster processes. An in-memory event emitter
would therefore lose events whenever the mutation and stream connection land on
different workers.

## Architecture

### Persistent user event feed

Add a SQLite-backed `RealtimeEvent` table with:

- Monotonic numeric event ID.
- Target `userId`.
- `topic`: `agent.changed`, `playbook.changed`, `source.changed`,
  `marketplace.changed`, `run.changed`, `report.changed`, or
  `discussion.changed`.
- Optional `entityId`.
- `createdAt`.

Every relevant mutation writes its domain change and its user event within the
same Prisma transaction. This makes the feed safe across all cluster workers and
prevents a database update from succeeding without a corresponding notification.

Events are retained for 24 hours. Startup and a periodic worker cleanup remove
older records.

### Global SSE endpoint

Add authenticated `GET /api/realtime/stream`.

- It accepts a positive `cursor` query parameter and the native
  `Last-Event-ID` header; the larger valid cursor is used.
- It sends each record as an SSE message with `id: <eventId>`.
- It polls the event table cursor-first for new records and sends a comment
  heartbeat every 15 seconds when there is no data.
- It sends `resync` if a persisted client cursor predates retained events.
- It sets `Content-Type: text/event-stream`, `Cache-Control:
  no-cache, no-transform`, `Connection: keep-alive`, and
  `X-Accel-Buffering: no`.

The endpoint is read-only and works from any web worker because the feed is in
SQLite. Native EventSource reconnects resume via `Last-Event-ID`; a fresh page
connection resumes via its query cursor.

### Client

Mount exactly one `useRealtimeStream(userId)` hook in the application shell.

- The cursor is stored in
  `localStorage` under `chattrader:realtime-cursor:<userId>`.
- The initial connection supplies this value as `?cursor=...`; each processed
  event updates the stored cursor.
- Topic subscribers register only the data loaders required by visible pages.
  A matching event refreshes the existing REST data for Runs, Reports,
  Discussions, Sources, or Marketplace.
- `resync` invokes the same registered visible-data loaders once.
- Stream errors leave EventSource open for native reconnect and show only a
  subtle reconnecting indication. REST mutations remain responsible for
  immediate operation feedback.

Remove the resource-specific agent and discussion stream endpoints/hooks after
the global feed covers their topics.

### Topic producers and consumers

| Topic | Producer actions | Consumers |
| --- | --- | --- |
| `agent.changed` | create, edit, delete, share, enable/disable | Agent lists/details |
| `playbook.changed` | create, edit, delete, share, enable/disable | Playbook lists/details |
| `run.changed` | queue, phase, completion, failure | Runs views, notifications |
| `report.changed` | report creation/update | Report lists/details |
| `discussion.changed` | run/turn/status changes | Discussion detail |
| `source.changed` | create, edit, delete, publish, unpublish, clone | Source library/detail |
| `marketplace.changed` | publication/clone actions | Marketplace and source views |

All events are targeted to the affected user. The scope is real-time
synchronisation of the same user's tabs and devices, not a public broadcast
mechanism.

## Source Search UX

`SourceSearchPicker` receives a bounded result region with a viewport-relative
maximum height and vertical scrolling. Search results and curated suggestions
scroll inside that region. The URL fallback remains below it. The library modal
footer and guided wizard's final action remain outside this internal scroller,
so they remain reachable without scrolling through a long result list.

## Library Card Accuracy and Agent Management

### Source-scoped report count

Library cover cards must show reports only when those reports actually crawled
the concrete source. The current card derives its count from all reports of any
agent linked to the source, which includes unrelated reports and disagrees with
the source detail view.

The source-list API will include `reportCount`, calculated in one batched
backend query using the same saved-artifact `sourceId` criterion as
`GET /api/sources/:sourceId/reports`. The frontend displays “X reports
available” only when this value is greater than zero. Its card preview report
must come from the same source-scoped set.

### Detail-view agent management

The source detail view will expose the existing linked-agent area and add the
same plus action available on the cover card. The action opens the existing
follow-source wizard with the source preselected and already linked agents
selected. Users can add or remove agents without returning to the cover grid.
No duplicate agent-assignment workflow is introduced.

### Analysis start semantics

The source-detail header action is renamed to “Analyse new content” (localized
in German and English). It continues to run the first selected Playbook in its
normal `latest_only` mode: the crawler analyzes the newest not-yet-processed
items for the source. If multiple agents are linked, the existing agent picker
opens first. A tooltip explains this behavior and directs users to the Episodes
tab’s play action when they want to force a specific episode.

## Production Configuration

Keep the existing `/api/` nginx SSE configuration and add an explicit
`/api/realtime/stream` location with `proxy_request_buffering off`, buffering
disabled, cache disabled, and one-hour read/send timeouts. The 15-second
heartbeat prevents idle disconnects through nginx, Cloudflare Quick Tunnel, and
intermediate networks.

## Testing and Verification

TDD is optional; tests are required.

- API Vitest coverage: producer writes, user isolation, cursor delivery,
  expired-cursor `resync`, event SSE format/headers, heartbeat, and cleanup.
- Web tests: cursor persistence and topic-to-loader routing as pure logic; the
  picker result-region constraint.
- Build validation: `cd apps/web && npm run build`.
- VPS verification: authenticated `curl -N` receives stream headers,
  heartbeat within 15 seconds, and an event after mutation.
- Browser verification with two tabs: source/Marketplace clone, run/report,
  and discussion changes appear in the second tab without reload.

## Out of Scope

- Cross-user/public broadcasts.
- WebSockets.
- Replacing REST mutations or their synchronous success/error UX.
- Moving SQLite to another database.
