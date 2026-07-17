const FENCED_CODE_BLOCK_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/** Field names, checked in priority order, that plausibly hold spoken/conversational text if
 * a discussion turn's raw response turns out to be JSON despite the DISCUSSION_MODE_INSTRUCTION
 * override. Includes both generic chat-response field names and the report-pipeline's own
 * schema fields (see analysis/claude-client.ts's buildResponseFormatInstructions) - in case
 * Claude falls back to its baked-in single-agent report JSON shape instead of a plain message. */
const TOP_LEVEL_TEXT_FIELDS = ['content', 'text', 'message', 'response', 'dialogue', 'speech', 'summary'];
const SECTION_TEXT_FIELDS = ['market_summary', 'lesson_explanation', 'argument_reflection'];

/** Minimum character length AND word count for a string to be harvested as readable prose
 * in the deep-walk fallback (avoids picking up short identifiers like "AAPL" or "HIGH"). */
const PROSE_MIN_CHARS = 30;
const PROSE_MIN_WORDS = 4;

function findStringField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Recursively walks any JSON value and collects strings that are long enough and word-rich
 * enough to be considered conversational prose. Used as a last-resort fallback when none of
 * the known field-name lookups match - handles arbitrary analysis JSON shapes (e.g. objects
 * with "trend_analysis", "key_movements", "primary_observation" top-level keys) without
 * needing to enumerate every possible field name.
 */
function collectProseStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const v = value.trim();
    if (v.length >= PROSE_MIN_CHARS && v.split(/\s+/).length >= PROSE_MIN_WORDS) {
      out.push(v);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectProseStrings(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectProseStrings(v, out);
    }
  }
}

/**
 * Defensive safety net for discussion turn text: even with DISCUSSION_MODE_INSTRUCTION telling
 * Claude this is a live conversation (not a JSON report), Claude occasionally still ignores
 * formatting instructions - the same behavior already observed and handled for the single-agent
 * report pipeline (see extractJsonFromResponseText in analysis/claude-client.ts). If a turn's raw
 * response looks like JSON (bare or fenced in a markdown code block), this extracts the most
 * plausible spoken-text field instead of saving the raw JSON blob as the turn's visible content.
 *
 * Extraction order:
 *   1. Known top-level spoken-text field names (content, text, message, …)
 *   2. common.summary / section.market_summary (mirrors the single-agent report shape)
 *   3. Deep recursive walk: collect all prose-like strings (≥30 chars, ≥4 words), sort
 *      longest-first, and join the top-5 with double newlines — handles arbitrary nested
 *      shapes like { trend_analysis: { primary_observation: "…", key_movements: […] } }
 *   4. Falls back to the original raw text, trimmed, when nothing prose-like is found.
 *
 * Never throws, so a turn is never lost over an unrecognized shape.
 */
export function sanitizeDiscussionTurnText(rawText: string): string {
  const trimmed = rawText.trim();

  const fenceMatch = trimmed.match(FENCED_CODE_BLOCK_PATTERN);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return trimmed;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return trimmed;
  }

  const obj = parsed as Record<string, unknown>;

  const topLevel = findStringField(obj, TOP_LEVEL_TEXT_FIELDS);
  if (topLevel) return topLevel;

  const common = obj.common;
  if (common && typeof common === 'object' && !Array.isArray(common)) {
    const commonSummary = findStringField(common as Record<string, unknown>, ['summary']);
    if (commonSummary) return commonSummary;
  }

  const section = obj.section;
  if (section && typeof section === 'object' && !Array.isArray(section)) {
    const sectionText = findStringField(section as Record<string, unknown>, SECTION_TEXT_FIELDS);
    if (sectionText) return sectionText;
  }

  // Last resort: deep-walk the entire object and collect all prose-like strings.
  // This handles arbitrary analysis JSON shapes that Claude may fall back to producing
  // (e.g. { trend_analysis: { primary_observation: "…", key_movements: […] } }).
  const proseStrings: string[] = [];
  collectProseStrings(obj, proseStrings);
  if (proseStrings.length > 0) {
    const unique = [...new Set(proseStrings)]
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);
    return unique.join('\n\n');
  }

  return trimmed;
}
