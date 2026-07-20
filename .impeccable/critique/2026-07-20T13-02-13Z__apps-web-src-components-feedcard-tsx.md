---
target: FeedCard.tsx
total_score: 23
p0_count: 1
p1_count: 3
timestamp: 2026-07-20T13-02-13Z
slug: apps-web-src-components-feedcard-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No freshness signal beyond raw date; no loading/skeleton state |
| 2 | Match System / Real World | 3 | AudioOutlined icon on "Discuss" button — audio ≠ conversation |
| 3 | User Control and Freedom | 2 | No dismiss, bookmark, or mark-as-read; whole-card click prevents text selection |
| 4 | Consistency and Standards | 3 | Accent color system is coherent; AntD Tags + Tailwind classes fight each other |
| 5 | Error Prevention | 3 | Click propagation correctly stopped on child buttons; partial data handled by fallbacks |
| 6 | Recognition Rather Than Recall | 3 | Persona emoji+label helps; metadata chips (entities, keywords) have no affordance label |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no quick actions, exclusively tap/click |
| 8 | Aesthetic and Minimalist Design | 2 | Up to 15+ visible elements per card; two absolute ban violations |
| 9 | Error Recovery | 1 | No visible state when report data is partial; fallback is silent |
| 10 | Help and Documentation | 2 | No tooltips on scores; Discuss icon is unexplained |
| **Total** | | **23/40** | **Needs significant work** |

## Anti-Patterns Verdict

**LLM assessment**: The card does not read as generic AI output — the accent color system, blurred-fill hero, and persona chip are purposeful and competent. The main slop risks come from inside the card: the focus callout uses the small-caps uppercase eyebrow pattern (`text-[10px] font-semibold uppercase tracking-wider`) for its label, which is the exact eyebrow trope flagged in the absolute bans. It just happens to live inside a callout rather than above a page section — same pattern, smaller canvas. The information density is also accumulative slop: the card was clearly built field-by-field as the data model grew, and no one went back to ask "which three things does a user actually need to see in the feed?"

**Deterministic scan**: Detector returned 0 findings (`exit 0`). The automated scanner does not currently catch Tailwind-composed utility patterns in TSX files, so the border-l and uppercase patterns below were not flagged. The scan is not a false negative — it confirms the card has no raw HTML anti-pattern strings.

## Overall Impression

The card is better-than-default. The hero blurred-fill treatment, the accent color system tied to semantic emphasis, and the persona chip are all genuine product thinking. But it has two absolute ban violations baked into its most-used element (the focus callout), and the information model has grown without being edited. The result is a card that can show 15 distinct UI elements simultaneously — a badge, hero, character avatar, two labels, date, headline, a full callout block, 8 chips, 3 signals, 4 action affordances — which turns every card into a wall of information rather than a single scannable signal. The single biggest opportunity: **strip the focus callout to its essence and fix its anti-pattern border**, then prune the metadata chip count.

## What's Working

1. **Accent color as semantic signal** — The `getReportAccent()` system mapping emphasis/result_type to violet/rose/amber/emerald is elegant. The user can triage by color in a feed without reading every card. This is the card's sharpest idea.

2. **Hero blurred-fill treatment** — `blur-xl opacity-60` background layer under an object-contain primary image gives the card atmospheric depth without distortion. The synthetic source gradient fallback is also polished.

3. **Persona chip identity** — The `CHARACTER_TYPE_ICON_BG` system with emoji + rounded-xl chip means each character type has a distinct visual identity. The user knows who produced the insight at a glance.

## Priority Issues

**[P0] Focus callout uses the absolute-banned side-stripe border**
- **What**: `border border-l-[4px]` on the focus callout box. This is the exact pattern: a colored border-left greater than 1px as an accent on a content block.
- **Why it matters**: Violates the absolute ban. Appears on the majority of cards (any card with a recommendation, risk, open question, or takeaway). The stripe is decorative — the accent color already exists on the badge and chip; the stripe adds no semantic value.
- **Fix**: Replace with a full border + tinted background (the `bg-violet-50 dark:bg-violet-950/40` is already there — lean on that) and remove the `border-l-[4px]`. Add a small leading icon (a directional arrow, a flag, or a dot) to replace the visual marker role the stripe was playing.
- **Suggested command**: `/impeccable polish`

**[P1] Focus callout label is the eyebrow anti-pattern**
- **What**: `text-[10px] font-semibold uppercase tracking-wider` on the focus label (renders as `RECOMMENDATION`, `KEY TAKEAWAY`, `RISK ALERT`). This is the small-caps tracked eyebrow pattern, embedded in a card callout.
- **Why it matters**: The absolute ban exists because this pattern signals "AI scaffolded this UI." Inside a callout it's less obvious, but it still reads as a reflex label rather than a considered hierarchy choice. At 10px it's also below a readable size threshold.
- **Fix**: Replace with a small colored dot or icon + short sentence-case label (`Recommendation`, `Key risk`). Drop tracking-wider and uppercase entirely. Use `text-[11px] font-semibold` in the accent color.
- **Suggested command**: `/impeccable polish`

**[P1] Information density — the card tries to be a report, not a card**
- **What**: A single card can simultaneously render: result-type badge, hero image, character avatar, character label, personality label, source title, date, headline, focus callout (label + paragraph), up to 8 metadata chips (relevance score, confidence, time horizon, 3 keywords, 2 entities, novelty), up to 3 trading signals, source link button, episode link button, discuss button, and view-run link. That's 15+ distinct UI elements.
- **Why it matters**: A feed card's job is fast triage, not deep reading. When everything is present, nothing is primary. The user has to parse the whole card to decide whether to open it.
- **Fix**: Cap visible chips to 3 max (the most semantically rich: accent chip, confidence, one keyword). Move novelty + entities + remaining keywords behind a subtle `+N more` indicator. Consider making the focus callout opt-in (collapsed by default, expanded on hover or tap), keeping the headline as the only text content on the closed card.
- **Suggested command**: `/impeccable distill`

**[P1] Accent bar (critical emphasis) is a second side-stripe violation**
- **What**: `absolute inset-y-0 left-0 z-20 w-1 bg-violet-500/rose-500` — a full-height 4px colored stripe at the card's left edge, visible on `emphasis === 'critical'` cards.
- **Why it matters**: Same absolute ban as the focus callout: border-left greater than 1px as a colored accent. At z-index 20 it sits above the hero image, which makes it feel tacked on.
- **Fix**: For critical emphasis, express urgency differently: a top-edge color band (full-width, 3px), or a colored overlay tint on the hero, or a badge change (rose badge instead of violet). Something that marks the whole card as elevated, not just its left edge.
- **Suggested command**: `/impeccable polish`

**[P2] Wrong icon on Discuss action — AudioOutlined ≠ discussion**
- **What**: The "Discuss" button uses `AudioOutlined` (a microphone icon) in both the footer and referenced elsewhere in the codebase.
- **Why it matters**: AudioOutlined communicates voice recording or playback. Discussion communicates conversation or thread. A user seeing a microphone next to "Discuss" will hesitate — is this voice chat? Is it a podcast episode? The affordance mismatch creates a micro-moment of uncertainty on every card.
- **Fix**: Replace with `MessageOutlined` or `CommentOutlined` from `@ant-design/icons`, or a speech-bubble SVG if a custom icon set is in use. Reserve AudioOutlined for audio playback actions.
- **Suggested command**: `/impeccable clarify`

## Persona Red Flags

**The Finance Professional (power user scanning 20+ cards/day)**:
- The metadata chips add noise rather than signal — a relevance score of 87 and a confidence of "high" both need interpretation time. In a scan session, decoding chips is work. This user wants the key signal visible without effort.
- No "mark read" or "save for later" — the only action after scanning is "open full report" or "move on." There's no lightweight acknowledgment affordance.
- The date shows as a locale-formatted date string (`7/20/2026`), not a relative time (`2 hours ago`). In a feed, relative time is the natural register.

**The Occasional Reviewer (checks in weekly, lower context)**:
- The `RECOMMENDATION` eyebrow label and dense chip row create the impression that interpretation is required before the card makes sense. This user needs the headline to be self-sufficient — and often it is, but the surrounding elements undercut that confidence.
- No visual indication that the entire card is clickable. The hover lift effect communicates interactivity but only after mouse-over — no pointer cursor, no underline, no visual affordance at rest.

## Minor Observations

- Date format should be relative (`2 hours ago`, `Yesterday`) not locale date. The `i18n.language` toLocaleDateString produces output like `7/20/2026` which is unintuitive in a feed context.
- `t('library.coverUnavailable')` is borrowed from the library i18n namespace in a feed component. The key should live in the `feedCard` namespace.
- When both `onOpenSource` and `episodeReference` are present the left footer cluster can overflow on narrow cards — the `truncate` on the source title handles it, but the episode button could push the discuss/view cluster below on very narrow viewports.
- The `cursor-pointer` implied by `hoverable` on the Ant Design Card may be inconsistent with the inner buttons, which already have pointer cursors. The nested `onClick` with `event.stopPropagation()` is correct but a tab-key user lands on the outer card with no visible indication it opens anything.
- Trading signals (▲ AAPL) use directional arrows and Ant Design `color="green/red"` tags — these render fine but are underdeveloped for a finance-focused card. Even a subtle sparkline placeholder would communicate more intent.
