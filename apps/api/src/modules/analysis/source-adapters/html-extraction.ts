import * as cheerio from 'cheerio';

/**
 * Strips scripts/styles/tags from an HTML document and collapses whitespace, producing plain
 * readable text. Used both as the final content-extraction step and as a fallback when no
 * specific CSS selector is available or configured.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the plain text content of a CSS selector match within an HTML document. Falls back to
 * the whole document's stripped text if the selector is missing, invalid, or matches nothing.
 */
export function extractText(html: string, selector?: string | null): string {
  if (!selector) return stripHtml(html);

  try {
    const $ = cheerio.load(html);
    const matched = $(selector);
    if (matched.length === 0) return stripHtml(html);
    return matched
      .text()
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return stripHtml(html);
  }
}

/**
 * Extracts absolute URLs for every element matched by a CSS selector's `href` attribute,
 * resolving relative links against the given base URL. Returns an empty array (rather than
 * throwing) if the selector is invalid or matches nothing.
 */
export function extractLinks(html: string, selector: string, baseUrl: string): string[] {
  try {
    const $ = cheerio.load(html);
    const links: string[] = [];
    $(selector).each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        links.push(new URL(href, baseUrl).toString());
      } catch {
        // ignore malformed hrefs
      }
    });
    return links;
  } catch {
    return [];
  }
}
