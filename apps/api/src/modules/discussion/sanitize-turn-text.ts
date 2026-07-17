const FENCED_CODE_BLOCK_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/** Field names, checked in priority order, that plausibly hold spoken/conversational text if
 * a discussion turn's raw response turns out to be JSON despite the DISCUSSION_MODE_INSTRUCTION
 * override. Includes both generic chat-response field names and the report-pipeline's own
 * schema fields (see analysis/claude-client.ts's buildResponseFormatInstructions) - in case
 * Claude falls back to its baked-in single-agent report JSON shape instead of a plain message. */
const TOP_LEVEL_TEXT_FIELDS = ['content', 'text', 'message', 'response', 'dialogue', 'speech', 'summary'];
const SECTION_TEXT_FIELDS = ['market_summary', 'lesson_explanation', 'argument_reflection'];

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
 * Defensive safety net for discussion turn text: even with DISCUSSION_MODE_INSTRUCTION telling
 * Claude this is a live conversation (not a JSON report), Claude occasionally still ignores
 * formatting instructions - the same behavior already observed and handled for the single-agent
 * report pipeline (see extractJsonFromResponseText in analysis/claude-client.ts). If a turn's raw
 * response looks like JSON (bare or fenced in a markdown code block), this extracts the most
 * plausible spoken-text field instead of saving the raw JSON blob as the turn's visible content.
 * Falls back to the original raw text, trimmed, when it isn't JSON or no plausible field is found
 * - never throws, so a turn is never lost over an unrecognized shape.
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

  return trimmed;
}
