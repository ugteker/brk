# Seeded Library and Immutable Agent Catalog

## Goal

Replace forced onboarding and empty first-run screens with guided discovery:

- new users see useful starter sources, curated agents, and sample outcomes immediately;
- the Library clearly separates platform recommendations from saved user content;
- source-aware agent selection highlights the most relevant owned and public agents;
- public sources and published agent versions are shared rather than copied per user; and
- developers can curate, preview, validate, and import the initial catalog offline.

## Product Principles

1. Teach through visible examples instead of a mandatory welcome assistant.
2. Keep recommendations visibly separate from content the user owns or saved.
3. Guide the next action without permanent or distracting animation.
4. Prefer progressive disclosure over dense cards and setup forms.
5. Share canonical public resources; create private records only for membership, configuration, or original user content.
6. Make published agent versions immutable so reports remain reproducible.
7. Never change a user's selected agent version silently.

## Library Experience

### First-run hierarchy

The Library opens with these sections in order:

1. **Start here**
   - The ghost **Add source** card is always first.
   - Three to five platform-owned **Starter picks** follow it.
   - Starter picks are catalog records, not user-owned sources.
2. **Sample report**
   - Selected starter source and agent combinations may expose one frozen, clearly labeled sample report.
   - Samples demonstrate the product outcome without creating resources, running analysis, or implying that the report belongs to the user.
3. **Your library**
   - Contains only sources the user explicitly saved or created.
   - Its empty state explains that added sources will appear there.

The mandatory welcome assistant and first-run decision wizard are removed.

### Directional cues

The Add source ghost card receives a subtle halo or pulse until the user opens source creation or saves a source.

The cue:

- stops after the relevant interaction;
- appears only on the highest-priority next action;
- is not shown continuously to established users;
- respects `prefers-reduced-motion`; and
- retains a clear static visual treatment when motion is disabled.

If the user creates a source and skips agent selection, the new source card's **Add agent** action receives the same one-time cue.

### Source creation

Source creation remains focused on the source. After a source is created or saved, the app opens a lightweight optional **Choose an agent** step with **Skip**.

Choosing an agent:

- creates a manual source-agent playbook pinned to the selected agent version;
- offers **Run first report**;
- does not enable a recurring schedule; and
- presents recurring scheduling as a later explicit opt-in.

Skipping preserves the source without creating an agent connection or schedule.

## Agent Selection Experience

Agent selection always opens with source context when a source is available.

### Section order

1. **Best matches**
   - Show the first four ranked matches.
   - Rank eligible owned agents and public catalog agents together.
   - Label each match as **Yours** or **Curated**.
   - Display two plain-language reasons for the match.
   - **Show more** reveals the next ranked set and scrolls it into view.
2. **Your agents**
   - Show remaining owned agents that did not appear in Best matches.
   - Do not duplicate agents between sections.
3. **Curate your own**
   - Render as a ghost card.
   - Open the AI-driven agent curator.

### Ranking

The first release uses deterministic editorial metadata rather than runtime AI ranking.

Rank by:

1. topic match;
2. source-type match;
3. language match;
4. user ownership as a tie-breaker; and
5. editorial rank as the final tie-breaker.

Fallback order:

1. topic + source type + language;
2. source type + language;
3. language;
4. editorial rank.

The view must never become empty because source metadata is incomplete.

### Compact agent card

Reuse only the clean visual language of the former character-selection cards. Character selection does not become a new filter or step.

Each compact card contains:

- the agent's distinct icon;
- name;
- one-line purpose;
- up to two match reasons;
- ownership label when relevant; and
- one primary action.

Prompt text, detailed character metadata, model information, and advanced configuration move to a details drawer.

## Agent Creation and Variants

The manual **Create Agent** wizard is removed from primary navigation. Every **Curate your own** action opens the AI-driven curator.

### Shortened AI curation

With source context, the curator:

1. proposes a nearly complete agent immediately;
2. asks at most one or two questions, and only when information essential to a useful result is missing;
3. shows an editable confirmation; and
4. creates the agent only after explicit confirmation.

The flow does not run a fixed interview. Manual field editing remains available from confirmation and appropriate private-agent settings.

### Published agent immutability

Every published agent version is immutable, including versions published by users.

- Using a public agent saves a reference to its exact published version.
- Every report records the exact agent version used.
- Publishers make changes by publishing a new version.
- Existing users see **Update available** and choose whether to move to the new version.
- Updates never alter existing connections or report behavior silently.

### Creating a variant

Public agents are not edited directly.

**Create a variant** opens the shortened AI curator with the selected public agent version as its starting point. The user explains the desired change, reviews the result, and creates a new independent private agent.

The new agent records `basedOnAgentVersionId` for attribution and traceability. It does not receive future parent updates automatically.

## Shared Source Model

Public sources are canonical shared resources. Saving one does not clone its URL, crawled items, or ingestion state.

When a user selects **Add to library**, the app immediately creates a private library-membership record that references the canonical source. This is equivalent to saving a song to a personal music library:

- the platform stores and crawls the public source once;
- each user controls whether it appears in their Library;
- removing it deletes only that user's membership;
- user-specific labels and preferences belong to the membership or connection; and
- changing the actual source URL creates a new private source.

Nothing is saved or copied at signup.

## Domain Model

The implementation should evolve the existing `Source`, `Agent`, `AgentPromptVersion`, and `MarketplacePublication` foundation rather than create a parallel marketplace.

Conceptual additions:

### Library membership

`UserLibrarySource`

- `userId`
- `sourceId`
- optional user display-name override
- `savedAt`

Unique on `userId + sourceId`.

### Agent definition and version

Agent identity and curation drafts remain separate from immutable versions. Every agent version is immutable after creation, whether private or published. Editing a private agent creates another private version; publishing exposes a selected immutable version.

An immutable agent version contains:

- stable version number;
- name and one-line purpose snapshot;
- character/profile configuration;
- exact system prompt;
- language;
- icon asset key;
- editorial match metadata snapshot;
- optional `basedOnAgentVersionId`; and
- publication timestamp.

### Saved agent membership

`UserLibraryAgent`

- `userId`
- `agentVersionId`
- saved/update preference metadata
- `savedAt`

Connections and reports reference a concrete agent version, not a mutable public agent.

### Manual playbooks

Reuse `Playbook` as the source-agent connection. Add a non-recurring `manual` mode:

- pin the playbook to one agent version;
- allow `nextRunAt` to remain empty;
- exclude manual playbooks from scheduler pickup; and
- convert the same playbook to an existing recurring mode only after explicit schedule confirmation.

**Run first report** triggers the existing manual-run path for this playbook.

### Curated publication metadata

Extend the existing marketplace publication layer with:

- stable slug;
- catalog version;
- origin (`platform_curated` or future community origin);
- locale/language;
- source types;
- topics;
- icon asset key for agents;
- editorial rank;
- lifecycle status; and
- publication and retirement timestamps.

### Frozen demos

A catalog demo links:

- one curated source publication;
- one immutable agent version;
- one frozen sample report payload; and
- localized title and disclosure text.

Demo reports are never treated as user reports.

## Agent Icons

Use Phosphor Icons as the primary source because it is broad, visually consistent, and MIT-licensed.

For each curated agent:

1. a developer selects a semantically appropriate Phosphor icon;
2. the catalog defines a distinct reviewed color treatment;
3. the SVG is vendored locally and referenced by a stable asset key; and
4. validation confirms the asset exists and is not accidentally reused where uniqueness is required.

A reviewed custom SVG is allowed when Phosphor has no suitable concept. Runtime fetching from third-party icon services is not allowed.

The same icon asset key is used everywhere the agent appears.

## Offline Catalog Curation and Import

Phase one is developer-operated. Do not build a Catalog Studio yet.

### Repository structure

Use structured, version-controlled catalog files grouped by:

- agents;
- sources;
- sample demos; and
- icon assets.

Each entry has a stable slug and explicit schema version.

### Tooling

Provide commands for:

1. **Validate**
   - schema and required-field checks;
   - stable slug and version checks;
   - duplicate source and icon checks;
   - tag and locale validation;
   - source URL validation;
   - icon existence and allowed-license checks; and
   - demo source-agent reference checks.
2. **Preview**
   - generate a local visual gallery of every source card, compact agent card, icon, tag set, ranking metadata, and sample pairing;
   - require human review before import.
3. **Import dry run**
   - show creates, updates, new versions, publications, and retirements without changing the database.
4. **Import apply**
   - apply the validated bundle transactionally and idempotently.

Missing entries in a new bundle are retired, not deleted. Existing user memberships, connections, private variants, and historical reports remain valid.

A non-technical Catalog Studio may be added later when product/design users begin curating directly.

## Data Flow

### Signup

1. Create the user.
2. Create no starter sources, agents, connections, schedules, runs, or reports.
3. Load active curated publications and eligible frozen demos in the Library.

### Save starter source

1. User selects a Starter pick.
2. Create `UserLibrarySource` for the canonical source.
3. Refresh Your library.
4. Open optional source-aware agent selection.

### Use public agent

1. Rank owned and public immutable agent versions for the selected source.
2. User selects **Use agent**.
3. Save the agent-version membership if needed.
4. Create a manual playbook pinned to that version and the selected source.
5. Offer **Run first report**.
6. Keep recurring scheduling disabled until explicit opt-in.

### Curate a new agent

1. Open the curator with compact source context.
2. Generate the near-complete proposal.
3. Ask no more than two essential questions.
4. Confirm the editable profile.
5. Create a private agent definition and immutable first version.
6. Create a manual playbook when curation originated from source selection.

### Create a variant

1. Open the curator with the selected published version as the base.
2. Ask what should change.
3. Produce and confirm a revised independent profile.
4. Create a private agent and version with provenance.
5. Leave the public base unchanged.

## Failures and Fallbacks

- Catalog fetch failure leaves Your library usable and shows a retryable Starter picks error.
- A retired catalog entry disappears from discovery but remains usable through existing memberships and historical references.
- An unavailable starter source cannot be newly saved and explains that it is temporarily unavailable.
- Missing topic metadata falls through the deterministic ranking ladder.
- Missing or invalid icon assets fail catalog validation before import.
- Import validation errors prevent all writes.
- Import apply is transactional; partial catalog updates are not allowed.
- A failed first report does not remove the source-agent connection and exposes the existing run failure reason and retry action.
- A curator failure preserves the source and allows retry or Skip.

## Accessibility and Motion

- All cards and ghost actions are keyboard reachable and expose visible focus states.
- Labels do not rely on color alone.
- Curated, owned, sample, and update states have explicit text.
- Compact cards meet WCAG AA contrast.
- Pulse effects respect reduced motion and have static equivalents.
- Show more moves focus or announces the newly revealed results.
- Loading, empty, error, and success states are visible for every catalog action.

## Testing

### API and domain

- catalog schema validation;
- icon and license validation;
- import dry-run output;
- transactional, idempotent import;
- retirement without destructive deletion;
- canonical-source membership isolation;
- immutable agent-version enforcement;
- explicit version updates;
- variant provenance and independence;
- deterministic ranking and each fallback level;
- manual playbook creation without scheduler pickup;
- explicit conversion from manual to recurring mode; and
- historical report version pinning.

### Web

- ghost source card is first;
- Starter picks and Your library are visually and semantically separate;
- sample reports are labeled and cannot be mistaken for user reports;
- one-time guidance stops after interaction and respects reduced motion;
- source creation offers optional agent selection with Skip;
- Best matches mixes owned and curated agents with labels and reasons;
- Show more reveals and focuses the next result set;
- agent cards expose only approved compact content;
- Curate your own opens the AI-driven curator;
- public agents cannot be edited in place;
- Create a variant starts from the selected published version; and
- keyboard, loading, empty, error, and retry flows remain usable.

### AI curation

- source context produces a nearly complete opening proposal;
- zero questions are allowed when the proposal is already sufficient;
- no flow asks more than two essential questions;
- explicit user direction overrides source or base-agent context;
- final confirmation remains editable; and
- variant creation does not mutate or dynamically inherit from its base.

## Delivery Phases

### Phase 1: Domain foundation and catalog tooling

- shared source memberships;
- immutable agent versions and memberships;
- curated publication metadata;
- Phosphor-first icon assets;
- validate, preview, dry-run, and import commands; and
- initial curated source, agent, and demo bundle.

### Phase 2: Library redesign

- remove forced welcome assistant;
- Start here, sample report, and Your library hierarchy;
- ghost-card guidance; and
- optional post-source agent selection.

### Phase 3: Agent selection and shortened curation

- deterministic Best matches;
- compact agent cards;
- Show more behavior;
- AI-only creation entry;
- shortened proposal-first curation; and
- immutable public agent and Create a variant flows.

### Phase 4: Public discovery

Reuse the catalog model and APIs for a public or signed-in marketplace only after the in-product discovery experience is proven.

## Out of Scope

- copying catalog resources into every new account;
- automatic recurring schedules;
- runtime AI ranking of catalog agents;
- live inheritance from public agents;
- in-place editing of published versions;
- a non-technical Catalog Studio;
- runtime third-party icon fetching; and
- a public marketplace in the initial release.

## Success Criteria

- A new account understands what the product does without completing onboarding.
- Starter content never appears to be user-owned before it is saved.
- A user can save a source, choose or curate an agent, and start a first report without configuring a recurring schedule.
- Public source ingestion is not duplicated per user.
- Public agent behavior is reproducible by version.
- Creating a variant never mutates or silently follows its base.
- Catalog imports are reviewable, deterministic, idempotent, and non-destructive.
- Agent cards are materially quieter than the current cards while preserving enough information to choose confidently.
