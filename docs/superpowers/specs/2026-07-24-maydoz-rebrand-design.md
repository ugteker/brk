# Maydoz Website Rebrand Design

## Goal

Rebrand the user-facing website from ChatTrader to Maydoz and reposition the product around podcast, video, and web content rather than trading.

## Brand Treatment

- Convert `apps/web/logo/maydoz-logo.jpg` into a true transparent PNG by removing the checkerboard background while preserving the green mark and anti-aliased edges.
- Move the production-ready asset into the web application's public assets.
- Pair the logo with the Maydoz wordmark in the authenticated app header and desktop login brand panel.
- Use a compact logo and wordmark treatment on the mobile login layout.
- Update the browser page title to Maydoz.

## Login Marketing

Hero:

> Listen less. Know more.

Subtitle:

> Maydoz agents turn podcasts, videos, and the web into insights made for you.

Supporting feature bullets will describe source tracking, agent analysis, and personalized insights without trading language or vendor names.

## Website Copy

- Replace user-visible ChatTrader references in the web application with Maydoz.
- Update English and German source descriptions and authentication copy consistently.
- Avoid vendor-specific names in new marketing copy.
- Keep internal package names, deployment paths, historical documents, and backend email branding outside this website-focused change.

## Behavior and Accessibility

- Preserve existing navigation, authentication flows, responsive breakpoints, and keyboard behavior.
- Give logo images meaningful alt text.
- Size the transparent asset responsively without distortion or a visible background box in light or dark themes.

## Validation

- Build the web application.
- Run the existing web smoke tests.
- Confirm no user-visible ChatTrader references remain in active web source files.
- Visually confirm the transparent logo on the desktop login panel, mobile login layout, and authenticated header.
