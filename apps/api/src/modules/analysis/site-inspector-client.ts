import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeMessagesClient } from './claude-client';
import { extractJsonFromResponseText } from './claude-client';
import type { SiteProfile } from './types';

/**
 * Fixed dedicated model used for structural site-inspection calls, independent of whatever model
 * an individual agent is configured to use for trading analysis — this is a technical/structural
 * classification task, not a trading judgment task, so it should not vary per-agent.
 */
export const SITE_INSPECTION_MODEL = 'claude-sonnet-4-5';

const MAX_HTML_CHARS = 20_000;

const SYSTEM_PROMPT = `You are a structural HTML analysis assistant. You are given a URL and a
(possibly truncated) HTML snapshot of that page. Your job is to determine how to deterministically
extract content from this site on future visits — you will NOT be asked to analyze or summarize
the content itself.

Decide whether the page is:
- "listing_page": a page that primarily lists/links to individual items (e.g. blog posts, podcast
  episodes, articles) that live at their own URLs.
- "single_page": a single article/page whose own content is the unit of interest (no meaningful
  sub-item links to enumerate).

Respond with ONLY a JSON object matching this exact shape, no prose outside the JSON:
{
  "siteType": "listing_page" | "single_page",
  "itemLinkSelector": string | null,
  "itemIdHint": string | null,
  "contentSelector": string,
  "paginationSelector": string | null,
  "confidence": number
}

Rules:
- "itemLinkSelector" MUST be a CSS selector matching anchor elements linking to individual items,
  and MUST be non-null when siteType is "listing_page".
- "itemIdHint" is a short hint of how to derive a stable id from an item link (e.g. "url_path"),
  or null if not applicable.
- "contentSelector" is a CSS selector for the main readable content: for "listing_page", this
  applies once on an individual item's own page; for "single_page", this applies to the given page
  itself. Use a conservative, broad selector (e.g. "article", "main", "body") if you are unsure.
- "paginationSelector" is a CSS selector for a "next/older" link, or null if none is visible.
- "confidence" is your own self-assessed confidence in this analysis, from 0 to 1.`;

/**
 * Validates and narrows an arbitrary parsed JSON value into a well-formed SiteProfile. Returns
 * null if the shape is invalid or incomplete, so callers can safely fall back to generic
 * single-page handling rather than trusting a malformed AI response.
 */
export function validateSiteProfile(value: unknown): SiteProfile | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;

  if (candidate.siteType !== 'listing_page' && candidate.siteType !== 'single_page') return null;
  if (typeof candidate.contentSelector !== 'string' || candidate.contentSelector.trim().length === 0) return null;
  if (typeof candidate.confidence !== 'number' || Number.isNaN(candidate.confidence)) return null;
  if (candidate.confidence < 0 || candidate.confidence > 1) return null;

  const itemLinkSelector = typeof candidate.itemLinkSelector === 'string' ? candidate.itemLinkSelector : null;
  if (candidate.siteType === 'listing_page' && !itemLinkSelector) return null;

  const itemIdHint = typeof candidate.itemIdHint === 'string' ? candidate.itemIdHint : null;
  const paginationSelector = typeof candidate.paginationSelector === 'string' ? candidate.paginationSelector : null;

  return {
    siteType: candidate.siteType,
    itemLinkSelector,
    itemIdHint,
    contentSelector: candidate.contentSelector,
    paginationSelector,
    confidence: candidate.confidence
  };
}

export class SiteInspectorClient {
  private readonly client: ClaudeMessagesClient;

  constructor(options: { apiKey?: string; client?: ClaudeMessagesClient } = {}) {
    this.client = options.client ?? (new Anthropic({ apiKey: options.apiKey }) as unknown as ClaudeMessagesClient);
  }

  /**
   * Performs a one-time structural inspection of a non-feed source. Returns null (rather than
   * throwing) on any failure to parse/validate the response, so callers can fall back to generic
   * whole-page handling.
   */
  async inspect(url: string, html: string): Promise<SiteProfile | null> {
    const truncatedHtml = html.slice(0, MAX_HTML_CHARS);

    try {
      const response = await this.client.messages.create({
        model: SITE_INSPECTION_MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `URL: ${url}\n\nHTML snapshot:\n${truncatedHtml}` }]
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock?.text) return null;

      const parsed = JSON.parse(extractJsonFromResponseText(textBlock.text)) as unknown;
      return validateSiteProfile(parsed);
    } catch {
      return null;
    }
  }
}
