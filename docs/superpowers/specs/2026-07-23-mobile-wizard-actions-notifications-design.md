# Mobile Wizard Actions and Notifications Design

## Goal

Make wizard navigation feel lightweight and consistent on mobile, preserve conventional desktop controls, and make the notification bell respond reliably to the first touch.

## Mobile Wizard Actions

- Remove the full-width footer background, gradient, border, and framed appearance.
- Keep the action container sticky only below the `768px` breakpoint.
- Render independent circular `48x48px` icon buttons above the content:
  - Back remains fixed to the left.
  - Continue or Save remains fixed to the right.
  - Intermediate actions use a right arrow.
  - Final create/save actions use a checkmark.
- Use the existing purple primary color for the forward action.
- Give each button a restrained shadow so it remains visible over varying content without adding a toolbar surface.
- Include bottom safe-area spacing for mobile devices.
- Preserve accessible names and loading/disabled states without changing control dimensions.

## Desktop Wizard Actions

- Keep labeled Ant Design buttons.
- Keep actions in the normal document flow.
- Do not apply sticky positioning, full-width scrims, or mobile-only circular sizing.
- Preserve Back on the left and the primary action on the right.

## First Agent-Selection Step

When a preselected source opens directly on agent selection, the Save action is the right-side primary action. It must not inherit left alignment from an empty Back-action group.

## Standalone Agent Curator

- Render standalone create and improve flows inside an Ant Design `Modal`.
- Apply `agent-curator-modal mobile-fullscreen-modal` so mobile uses the same page-like shell as agent selection.
- Keep the modal header fixed, the modal body as the only scroll container, and curator actions sticky on mobile.
- Keep the desktop dialog constrained to `720px` and independently scrollable.

## Mobile Notification Bell

The Ant Design `Popover` must own a direct interactive trigger. `TouchSafeTooltip` currently sits between the popover and button; on coarse-pointer devices it clones its child without forwarding the event props injected by `Popover`, so the first touch cannot open the notification content.

The bell button will become the direct popover child. The button retains its accessible label and badge. Notification content, unread count, dismissal behavior, and desktop interaction remain unchanged.

## Regression Coverage

- Assert mobile wizard actions have no scrim or footer background.
- Assert sticky positioning is defined only in the mobile media query.
- Assert desktop action markup does not contain unconditional sticky utilities.
- Assert the agent-selection primary action is in a right-aligned action group.
- Assert the standalone curator uses `agent-curator-modal mobile-fullscreen-modal`.
- Assert the bell popover has a direct button/badge trigger rather than a touch-tooltip intermediary.
- Run the web smoke suite and production build.
