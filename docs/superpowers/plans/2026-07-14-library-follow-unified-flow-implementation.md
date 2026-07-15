# Implementation Plan — Unified "Follow" Flow from Library Cards

## Problem statement
The current UX splits setup across separate hubs:
- **Library** manages sources and preview episodes
- **Agents** manages agent identity/personality
- **Playbooks** manages source selection, schedule, and recipients

Goal: from a Library card item, start one unified 3-step flow to **follow** that item (channel or episode), while reusing existing Follower and Playbook capabilities.

## Confirmed decisions
- Keep conversation in German; define key terminology in English glossary.
- Primary product verb: **Verfolgen** (`follow`).
- Primary product noun: **Follower** (rename from Agent in UI/domain language).
- Follow target can be **channel or episode**.
- Reuse Playbook table as base; **extend schema** (no new table now).
- Step 1b (“new follower”) must be **embedded** in the unified flow.
- Wizard placement: **hybrid** (desktop inline under card, mobile dialog/bottom-sheet).
- Navigation: **remove all end-user tabs**; Library-only surface for everyone.
- Admin access: add separate **Admin area** containing user management + follower/playbook management.
- Renaming strategy: **logical rename now, physical DB table rename later**.

## Current state (codebase analysis)
- Library cards + preview items live in `apps/web/src/pages/AgentsPage.tsx` (Library tab).
- Follower wizard currently exists under Agent naming as reusable component: `apps/web/src/components/AgentForm.tsx` (3-step wizard).
- Playbook creation wizard currently exists inline in `AgentsPage.tsx` (pick source, pick agent, set schedule/recipients).
- API contracts:
  - Playbooks client: `apps/web/src/api/playbooks.ts`
  - Playbook backend types/repository/routes: `apps/api/src/modules/playbook/*`
- Data model currently has no explicit “follow target type/key” to distinguish channel vs episode follow intent.

## Terminology glossary (working)
- Verfolgen → **Follow**
- Bibliothek-Kachel → **Library Card**
- Kanal/Quelle → **Channel / Source**
- Episode → **Episode**
- Agent (legacy term) → **Follower** (new product term)
- Termin/Planung → **Schedule**
- Empfänger → **Recipients**
- Ergebnis/Report → **Report**
- (Working domain noun) Verfolgung → **Follow Subscription** (code/domain label; UI copy can stay “Verfolgen”)

## Approaches considered
1. **UI orchestration only, no backend schema change**
   - Reuse existing playbook creation and infer follow type heuristically.
   - Pros: low migration work.
   - Cons: ambiguous state, weak edit mode, brittle logic for episode-level follow.

2. **Recommended: Extend Playbook model with follow-target metadata**
   - Keep Playbook as persistence anchor, add optional fields (e.g., `followTargetType`, `followTargetKey`, `followTargetTitle`).
   - Build unified flow in Library, map to existing playbook lifecycle.
   - Pros: explicit semantics, clean edit mode, backward compatible.
   - Cons: migration + API contract updates.

3. **New dedicated Follow table now**
   - Create explicit subscription aggregate and map to playbooks.
   - Pros: clean domain separation long-term.
   - Cons: larger scope, extra joins/migrations, not aligned with “reuse Playbook now”.

## Recommended design
Use **Approach 2**: keep Playbook persistence, extend it with follow-target metadata, and implement a unified Library-first flow.

## Information architecture update (tabs vs single surface)
With the new follow wizard, Library can become the primary and potentially only end-user surface.

Options:
1. **Keep all 3 tabs (Library / Followers / Playbooks)**
   - Pros: low disruption for existing users.
   - Cons: now redundant and splits a flow that should be card-centric.

2. **Remove tabs for everyone; Library-only app shell**
   - Pros: simplest mental model, strongest product narrative.
   - Cons: removes direct access to operational/diagnostic views that may still matter for power users/admins.

3. **Selected: remove tabs for all users + separate Admin area**
   - End-user UX: Library-only shell (no Library/Followers/Playbooks tabs).
   - Admin UX: dedicated admin section with user management plus follower/playbook management.
   - Benefit: very clear primary journey while keeping operational controls for admins.

## Target architecture
### Frontend
1. Add “Follow” CTA(s) on Library card context:
   - Start for channel-level follow
   - Start for specific episode follow (from preview list)
2. Introduce new unified wizard container (new component), 3 steps:
   - **Step 1: Agent**
     - 1a select existing follower (same visual listing style as current Agents dashboard)
     - 1b create new follower (embed existing `AgentForm` flow; to be renamed logically)
   - **Step 2: Schedule**
     - Reuse current Playbook schedule controls
   - **Step 3: Recipients**
     - Reuse current Playbook recipients tags input
3. Edit mode:
   - If a follow already exists for selected target, open wizard in prefilled edit mode.
4. Preserve existing Playbooks hub behavior initially; wire new flow to same backend contracts (extended with follow metadata).

### Wizard placement UX (card correlation)
Because the flow starts from a specific Library card, placement must keep strong visual ownership.

Options:
1. **Inline embedded panel directly below the clicked card**
   - Pros: strongest card-to-wizard correlation, clear ownership, less context switching.
   - Cons: can push layout down and feel heavy in dense grids.

2. **Modal dialog**
   - Pros: focused flow, stable layout, easy stepper experience.
   - Cons: weaker card correlation unless header explicitly references the source/episode.

3. **Recommended hybrid: inline on desktop, bottom-sheet/dialog on mobile**
   - Desktop: expand a clearly branded “Follower setup for <card title>” panel directly under the selected card.
   - Mobile: open a bottom sheet/dialog with the same explicit header context.
   - Pros: keeps correlation where screen space allows, preserves usability on small screens.
   - Cons: slightly more implementation complexity than a single mode.

### Backend
1. Extend Prisma `Playbook` schema with optional follow metadata:
   - `followTargetType` (`channel` | `episode`)
   - `followTargetKey` (stable identifier, e.g., sourceId + item key)
   - `followTargetTitle` (display label snapshot)
2. Add migration for new columns (non-breaking defaults/nullables).
3. Update playbook DTOs/repository/routes to read/write follow metadata.
4. Add query support for:
   - find existing follow by target key for current user
   - upsert/edit behavior used by Library wizard entrypoint

### Naming strategy
- UI/domain naming shifts toward “Follow” semantics now.
- Physical DB rename (`Playbook` table/model) deferred to later migration to avoid risk.

## Data flow (happy path)
1. User clicks “Verfolgen” on Library card or episode item.
2. UI resolves target identity (`channel` or `episode`) and checks existing follow.
3. Wizard opens:
   - prefilled if existing
   - blank if new
4. User completes step 1/2/3.
5. API creates/updates playbook + follow metadata.
6. Library card reflects “already followed” state and edit affordance.

## Error handling
- Distinguish validation vs server errors per step.
- If follower creation (1b) fails, keep wizard state and return to follower sub-step.
- If schedule/recipient save fails, preserve draft and show actionable error.
- Prevent duplicate follows for same target via backend uniqueness strategy (app-level first, DB uniqueness if safe after key format stabilization).

## Testing strategy
### Frontend
- Unit/component tests:
  - Follow CTA visibility and click behavior on Library cards/episode rows
  - 3-step wizard progression and validation
  - Embedded Follower form path (1b) returning selected/new follower
  - Edit mode prefill
- Integration tests in `AgentsPage.three-hub.test.tsx` flow coverage for follow start + update.

### Backend
- Repository tests:
  - create/update playbook with follow metadata
  - find-by-follow-target logic
- Route tests:
  - list/get/create/update compatibility with new fields
  - edit existing follow path
- Migration safety checks for existing playbook rows.

## Phased implementation steps
1. Add follow metadata to Playbook schema + migration + backend type support.
2. Extend web API client types/contracts for follow metadata.
3. Build unified Library “Follow” wizard container (with step 1a/1b for Follower selection/creation).
4. Reuse/compose schedule + recipients steps from existing playbook flow.
5. Add create/edit detection from Library target identity.
6. Add UI copy adjustments (Verfolgen semantics) and non-breaking badges/states.
7. Add tests (frontend + backend) and adjust existing tests for contract changes.
8. Keep legacy Playbooks creation entry available initially; optionally hide later after validation.

## Out of scope for this implementation pass
- Physical DB table rename from `Playbook` to new name.
- Large domain-wide refactor of all legacy “agent/playbook” identifiers across backend internals.
- Redesign of run/report execution semantics beyond follow-target metadata.


## Historical note

Between the original plan above and the current state, this project went through several
rounds of UX exploration that were each proposed, then reversed before being fully built:
a fully tabless Library-only shell, subtitle removal, and a "Buddy icon" admin dropdown
menu (`User Management` / `Agent and the Playbook`). None of that exploratory direction
was implemented, and it has been superseded by the "keep tabs" pivot below. It is kept
here only as a historical record of directions that were considered and rejected — do not
treat it as current guidance.

## Current implemented state (authoritative)

- Outer tab bar is kept, but hidden (`tabBarStyle: { display: 'none' }`) while a regular
  user is in the default dashboard view. The outer `sources` tab/card is labeled
  **"Dashboard"** (not "Library", to avoid the duplicate label that used to appear).
  Admins can reveal the tab bar (Agents/Playbooks) via an "Open admin area" icon button
  in the header, gated by `isAdmin`.
- Inside the Dashboard tab, users have their own **inner library tab bar**
  (`libraryTabs` state in `AgentsPage.tsx`) so they can create additional named libraries
  and assign sources to them. Renaming is via double-click on the active tab or its
  inline rename (✎) button. Tab/assignment definitions persist in `localStorage`, keyed
  per user (`chattrader:library-tabs:<userId>`, `chattrader:library-assignments:<userId>`)
  — this is client-side only, not backend-synced across devices.
- Following a source opens the existing playbook create/edit form as a standalone
  **Modal** (`isPlaybookCreateOpen`), reachable regardless of tab/admin state, instead of
  navigating to the Playbooks tab. `onFollowSource` no longer touches
  `showAdminWorkspace`/`activeHub`. This was a required fix (see audit below) — previously
  it forced `showAdminWorkspace = true`, which incidentally exposed the admin-only
  Agents/Playbooks tabs to non-admin users too.
- Card actions (Edit/Delete/Share/Publish via `EntityActions`, plus Follow) remain
  unchanged from the original three-hub design: all are equal-weight circular icon
  buttons; Delete is still on the card (not moved to an edit-only view); Share and
  Publish remain two separate dialogs (not merged). The "make Follow dominant" /
  "merge share+publish" / "move delete into edit view" / "runs+reports inline in card"
  ideas from the mid-session UX refinement pass were explored but reversed before
  implementation and are **not currently built**.
- The subtitle "Manage your personal source library, agents, and playbooks from one
  dashboard." is still present under the header (not removed).

## 2026-07-15 audit findings (plan vs. implementation)

Reviewed against this doc's various clarification passes:

1. **Fixed — real bug:** `onFollowSource` unconditionally set `showAdminWorkspace = true`
   and jumped to the Playbooks tab with no `isAdmin` check, so a non-admin user clicking
   "Follow this source" would reveal the admin-only Agents/Playbooks tabs. Fixed by
   extracting the playbook create/edit form into a standalone Modal independent of the
   tab/admin-workspace state, and removing the state mutation from `onFollowSource`.
   Covered by a new regression test in `AgentsPage.three-hub.test.tsx`.
2. **Fixed:** Follow no longer switches tabs (previously contradicted the explicit
   "must stay in Library, no tab switching" directive above).
3. **Not implemented / superseded:** Buddy icon dropdown, fully tabless shell, subtitle
   removal — see "Historical note" above.
4. **Not implemented / abandoned:** Delete-to-edit-view relocation, Share+Publish merge,
   Follow CTA dominance styling, Runs/Reports inline-in-card. These were scoped in the
   mid-session UX refinement pass but reversed by later user direction before being
   built. Corresponding todos were closed as superseded rather than silently
   implemented, to avoid redoing work that may get reversed again — revisit explicitly
   if this UX polish is still wanted.