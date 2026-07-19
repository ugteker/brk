# Feed Card Insight-First Implementation Plan

**Goal:** Replace the current compact Feed row with the approved, domain-neutral “Insight first” report card.

**Design decisions:**

- Show the agent, source context, timestamp, result type, headline, short summary, and no more than three metadata chips.
- Use `report.common.card_presentation` only to select supported content; it never supplies markup or controls layout.
- Resolve the exact playbook from `AgentRun.playbookId`. When it has exactly one source and that source has `metadata.coverImageUrl`, render a shallow source-image strip. Do not show a placeholder or choose an arbitrary image for multi-source playbooks.
- Use `headline` and `short_summary` with `summary` fallbacks for legacy reports.
- Render the textual confidence label only when the agent included `confidence` in `supporting_fields` and the score is at least 50. Scores 70–100 map to “high”; 50–69 to “medium”.
- Show the agent character rather than its user-defined name. Render a safe, directly clickable episode/article reference only when the report contains an evidence-backed HTTP(S) `source_reference`.
- Preserve existing financial signal chips as a character-specific supplement, but never require them for the card to be meaningful.
- Click behavior remains unchanged: open the report in its playbook.
- Add every new display string to English and German locale files.

## Files

- Modify: `apps/web/src/pages/AgentsPage.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`
- Modify: `apps/web/src/i18n/locales/de.json`

## Implementation

1. Resolve a single source from the report playbook when its `sourceIds` contains exactly one source; use its existing cover URL as an optional source strip.
2. Derive content from normalized report metadata with legacy fallbacks, respecting the allowed `card_presentation` fields.
3. Replace the old summary row with the approved card hierarchy and keep its existing report-opening click handler.
4. Add translated labels for result types, confidence, source context, and opening the report.
5. Build the web application. Tests are intentionally not run per the established user preference.

**Status:** Complete. The Feed uses the report's persisted `AgentRun.playbookId` end-to-end, so source context, cover image, click navigation, and detail filtering all refer to the same playbook. The selected final layout is Option B: a prominent focus block for recommendations, risks, open questions, or the key takeaway.
