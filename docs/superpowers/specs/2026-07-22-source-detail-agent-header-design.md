# Source detail agent header

## Goal

Remove duplicated agent-management presentation from a source detail view while
preserving the existing follow workflow.

## UI

- Remove the detail-only "Agents" section, including linked-agent avatars,
  per-agent removal controls, and its inline add-agent button.
- Keep "Watched by" as the sole detail-page presentation of linked agents.
- Add the existing circular dashed add-agent button to the source-detail header,
  next to the "Analyze new content" action.
- The button keeps the existing `library.addAgent` tooltip and accessible label.

## Behavior

- Clicking the header add-agent button calls
  `onFollowSource(selectedSource, event)`.
- The existing wizard remains responsible for preselecting the source and its
  linked agents, adding agents, and removing agents.
- No APIs, state model, or follow-wizard behavior changes.

## Validation

- Update the existing source-detail UI test to locate the header add-agent
  control and verify that it opens the preselected follow wizard.
- Run the focused test and the web production build.
