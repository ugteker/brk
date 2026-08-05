---
name: Maydoz
description: A dark-first, aurora-glass workspace for personalized long-form learning.
colors:
  aurora-violet: "#722ed1"
  horizon-indigo: "#4f46e5"
  deep-slate: "hsl(225, 28%, 8%)"
  slate-surface: "hsl(225, 24%, 12%)"
  cool-paper: "hsl(230, 22%, 97%)"
  ink: "hsl(225, 40%, 12%)"
  moon-text: "hsl(220, 18%, 90%)"
  soft-border: "hsl(225, 18%, 24%)"
  leaf-green: "#5ca875"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "clamp(2rem, 3.5vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.aurora-violet}"
    textColor: "{colors.moon-text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "#7c3aed"
    textColor: "{colors.moon-text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
  navigation-active:
    backgroundColor: "{colors.aurora-violet}"
    textColor: "{colors.moon-text}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
  floating-pane:
    backgroundColor: "{colors.slate-surface}"
    textColor: "{colors.moon-text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
---

# Design System: Maydoz

## Overview

**Creative North Star: "Aurora Studyglass"**

Maydoz is a calm, dark-first research workspace. Aurora Violet and Horizon Indigo move softly through translucent navigation and floating utility surfaces, while the work itself remains on solid, legible cards. The effect is atmospheric rather than decorative: a quiet signal in a long learning session.

The system supports personalized analysis of dense material. Its visual language must feel focused, precise, and trustworthy on both desktop and mobile, with an accessible light mode that preserves the same cool, technical character. The Maydoz leaf-with-headphones mark is a binding identity asset; it joins attentive listening to organic learning.

**Key Characteristics:**
- Dark-slate research surfaces with restrained violet-blue aurora light.
- Glass reserved for navigation, drawers, popovers, and other floating utilities.
- Solid content cards and clear type for long-form comprehension.
- Capsule navigation and compact circular icon actions for quick movement.
- Motion is soft, brief, and always removable for reduced-motion users.

## Colors

The palette treats violet as a guiding light, not a screen fill: dark slate holds the work, cool paper serves light mode, and green is a small listening-and-progress signal.

### Primary
- **Aurora Violet:** Primary actions, active navigation, focus rings, and aurora glow. It is the one consistent interaction accent.
- **Horizon Indigo:** The secondary end of primary-action gradients and the cool edge of aurora glass.

### Secondary
- **Leaf Green:** Small affirmative markers and listening/status accents. Use semantically, never as a competing brand primary.

### Neutral
- **Deep Slate:** Dark-mode application ground and the preferred environment for research sessions.
- **Slate Surface:** Dark-mode cards and containers; distinct from the application ground without becoming bright.
- **Moon Text:** Primary dark-mode text with high contrast on Deep Slate and Slate Surface.
- **Cool Paper:** Light-mode page ground; keep it cool and neutral rather than cream or sand.
- **Ink:** Primary light-mode text.
- **Soft Border:** Quiet dark-mode dividers and field boundaries.

**The One Aurora Rule.** Violet and indigo may create ambient light at the edge of a surface, but full violet surfaces are reserved for active navigation and primary action. Content remains neutral and readable.

## Typography

**Display Font:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif  
**Body Font:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif  
**Label/Mono Font:** system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

**Character:** The typography is compact and contemporary rather than editorial. Tight display tracking adds intelligence to headings; generous body leading makes transcripts, reports, and operational detail comfortable to scan.

### Hierarchy
- **Display** (600, `clamp(2rem, 3.5vw, 2.75rem)`, 1.1): Authentication and major workflow headlines.
- **Headline** (600, Ant Design heading scale, 1.2): Section and page titles.
- **Title** (600, 16-20px, 1.3): Cards, dialogs, and actionable groups.
- **Body** (400, 14px, 1.6): Reports, source descriptions, helper copy, and long-form explanation.
- **Label** (600, 12px, 1.4, `0.2em`): Sparse uppercase wayfinding labels such as a next action; do not use for ordinary body copy.

**The Scan-Then-Read Rule.** Start with a concise headline and secondary context. Dense source material belongs behind progressive disclosure, not in compressed card summaries.

## Layout

The application uses a centered desktop container capped at 1280px with 16px side padding, then shifts to one-column content and a fixed bottom navigation on small screens. Page and header padding use `clamp(12px, 3vw, 24px)`, keeping wide displays calm while preserving mobile breathing room.

Content grids begin at one column and expand to two columns at the `sm` breakpoint (640px). The header wraps rather than overflows; desktop navigation is a centered capsule rail, while mobile exposes three primary destinations in the persistent bottom bar. Modal widths preserve a 12px viewport gutter, and long modal workflows use a sticky action area.

**The Solid Work Rule.** Flowing app content stays on stable, solid surfaces. Glass belongs to layers that float above that work, never to every card in a scrollable feed.

## Elevation & Depth

Maydoz uses a hybrid depth model. Default cards are quiet and tonal; navigation, drawers, popovers, and dropdowns use blurred aurora glass with a fine violet border. Elevated state comes from diffuse shadows and an inset highlight rather than heavy black drop shadows. Hovering a special card can lift it by 2px with a restrained violet glow.

### Shadow Vocabulary
- **Header Rest:** `0 4px 16px rgba(0,0,0,0.3)` in dark mode and `0 2px 10px rgba(15,23,42,0.06)` in light mode.
- **Header Scrolled:** `0 8px 24px rgba(0,0,0,0.5)` in dark mode and `0 8px 24px rgba(15,23,42,0.10)` in light mode.
- **Aurora Float:** `inset 0 1px 0 rgba(255,255,255,0.3), 0 12px 36px rgba(91,33,182,0.35)` for dark floating glass.
- **Aurora Hover:** `0 0 22px rgba(139,92,246,0.35), 0 8px 28px rgba(114,46,209,0.14)` for explicit interactive cards.

**The Lift-on-Intent Rule.** Elevation responds to focus, hover, scroll, or a temporary next action. It is not a substitute for hierarchy.

## Shapes

Corners are gently rounded: 6px for small details, 8px for standard Ant Design controls, and 12px for larger glass or conversational surfaces. Navigation rails, active tabs, status chips, icon actions, and mobile wizard controls are fully pill-shaped. Borders are thin and quiet; glass surfaces use a low-contrast violet edge to separate translucent layers.

**The Capsule Rule.** Use full pills for compact controls that move, filter, or signal state. Do not turn broad content cards into capsules.

## Components

### Buttons

Buttons are calm and precise, with clear semantic priority.

- **Shape:** Standard actions use an 8px radius; circular icon actions and navigational controls use the pill radius.
- **Primary:** Aurora Violet-to-Horizon Indigo gradient, white text, a subtle inset highlight, and a restrained violet glow.
- **Hover / Focus:** Hover brightens the gradient and increases the aura. Focus must retain the primary-color ring supplied by Ant Design.
- **Secondary / Ghost:** Use Ant Design's neutral default treatments so primary emphasis stays rare.

### Chips

- **Style:** Compact tags use the pill radius and semantic Ant Design colors.
- **State:** Green and red remain report/signal semantics. Violet identifies an active or discussion-related state, not generic decoration.

### Cards / Containers

- **Corner Style:** 8px standard cards; 12px for conversational and floating panes.
- **Background:** Solid card surfaces in normal content flow. Cool white in light mode; Slate Surface in dark mode.
- **Shadow Strategy:** Flat at rest; Aurora Hover only on intentionally interactive or next-step cards.
- **Border:** Soft neutral borders for solid cards; fine violet borders for glass.
- **Internal Padding:** 12px on mobile cards and 16px or more on desktop.

### Inputs / Fields

- **Style:** Ant Design fields with an 8px radius and quiet container/border tokens.
- **Focus:** Primary violet focus treatment; do not replace it with arbitrary accent colors.
- **Mobile:** Controls use 16px text below 768px to prevent mobile-browser zoom.

### Navigation

- **Style:** Desktop navigation sits inside a blurred aurora-glass capsule. The active route becomes a luminous internal capsule; inactive labels remain subdued.
- **Mobile:** Three primary routes stay fixed in an aurora-glass bottom bar with icon-plus-label controls and safe-area padding.
- **Actions:** Bell and account actions are compact circular buttons, keeping the header operational rather than crowded.

### Aurora Glass

Floating utilities use violet and pale-blue radial gradients over a translucent base, 20px blur, saturation boost, a fine violet outline, and an inset highlight. Use it for popovers, dropdowns, drawers, mobile navigation, and header rails.

## Do's and Don'ts

### Do:
- **Do** use Aurora Violet for the primary action, active route, and focus language.
- **Do** keep report cards, source lists, and dense reading surfaces solid and high-contrast.
- **Do** preserve dark mode as a first-class theme through Ant Design's theme algorithm and matching surface tokens.
- **Do** keep mobile form controls at 16px or larger and honor `prefers-reduced-motion`.
- **Do** use the leaf-with-headphones logo unchanged as the Maydoz identity anchor.

### Don't:
- **Don't** reintroduce finance, crypto, trading-terminal, or aggressive gamified dashboard aesthetics into general product UI.
- **Don't** place every panel behind glass or every interaction behind a glow.
- **Don't** use hero-metric cards as a default dashboard pattern.
- **Don't** turn semantic report colors into arbitrary decoration.
- **Don't** use long text buttons when a familiar icon action is clearer.
