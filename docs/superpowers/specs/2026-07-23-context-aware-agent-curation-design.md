# Context-Aware Agent Curation

## Goal

Use the source selected before agent creation to make the curator's opening proposal more relevant without coupling the resulting agent to that source.

## Behavior

When a curation session starts with a selected source, the curator uses the source context to shape only:

- its initial agent proposal;
- its opening explanation; and
- its first follow-up question or suggested replies.

After that opening, the conversation is driven by the user's messages. The selected source remains advisory context, not a constraint. The user can steer the curator toward a different purpose without changing a setting or restarting the wizard.

When no source is selected, the curator starts from the user's stated intent and behaves as it does today.

## User Interface

When source context influenced the opening, show a subtle, non-interactive label near the proposal:

> Inspired by: `<source name>`

Do not add an opt-out step, toggle, or mode selector. The normal conversation input is the escape hatch: explicit user direction always overrides the source-inspired proposal.

The label must not imply that the source is attached to the agent. Agents remain independent and reusable across sources.

## Curation Rules

1. Source-derived details may be used to suggest an appropriate analytical character, audience, tone, or output shape.
2. The curator must not present inferred source details as user requirements.
3. The curator must not lock profile fields based on source context.
4. Explicit user instructions and corrections always take precedence.
5. The finalized agent profile must describe a reusable analytical role, not depend on the selected source's identity unless the user explicitly requests that specialization.
6. Source context must not influence later turns unless the user refers back to it.

## Data Flow

1. The source-first flow passes a compact source context when creating the curation session.
2. The curator generates the initial proposal using that context.
3. The UI displays the source name in the `Inspired by:` label.
4. Subsequent curation turns use the conversation and current profile draft as the primary context.
5. Finalization creates or updates only the agent profile. Source attachment remains the responsibility of the playbook flow.

## Error and Fallback Behavior

- Missing or incomplete source metadata must not prevent curation from starting.
- If the source context cannot support a meaningful proposal, the curator should use a neutral opening rather than invent details.
- If the source is removed or unavailable after session creation, the existing conversation and draft remain valid.

## Acceptance Criteria

- A selected source produces a visibly source-relevant opening proposal.
- The opening displays `Inspired by: <source name>`.
- No additional wizard step or source-influence control is introduced.
- A user's first freeform correction can redirect the agent without friction.
- Source-derived values are never treated as user-locked profile fields.
- The resulting agent can be reused with unrelated sources unless the user explicitly specialized it.
- Starting curation without a source continues to work.

## Testing

- Service tests verify that source context can influence the initial proposal but does not override explicit user direction.
- Service tests verify that later turns do not rely on source context unless the user refers to it.
- UI tests verify that the `Inspired by:` label appears only when the opening used a selected source.
- Existing source-free creation and agent-update flows remain covered.
