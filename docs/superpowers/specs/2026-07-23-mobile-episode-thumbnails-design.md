# Mobile Episode Thumbnails Design

## Goal

Make episode lists on the mobile library detail view compact and easy to scan without changing the desktop presentation.

## Mobile Layout

- Keep each episode in a horizontal row.
- Render a fixed `72x48px` 16:9 thumbnail on the left.
- Prevent the image from growing to the available container width.
- Place title and publication date in the content column.
- Place episode actions in a compact row below title and date.
- Align the thumbnail to the top of the content column.
- Preserve `object-cover`, rounded corners, and the existing muted fallback styling.

## Desktop Layout

- Keep the existing `64x44px` thumbnail.
- Keep title, metadata, and actions in the current horizontal desktop arrangement.

## Regression Coverage

- Assert the episode list item is horizontal by default.
- Assert the mobile image is exactly `72x48px`.
- Assert desktop image dimensions remain `64x44px`.
- Assert mobile actions are inside the content column and desktop actions return to the outer row.
- Run web smoke tests and the production build.
