/**
 * Sniffs whether fetched content is a valid RSS or Atom feed document, regardless of the
 * source's configured `type` in the wizard. Detection is based on the presence of the feed
 * format's root element (`<rss>` for RSS 2.0, `<feed>` for Atom) rather than trusting the
 * configured source type, since a source's actual shape can differ from (or change relative to)
 * what was configured, and can change over time.
 */
export function isFeedDocument(content: string): boolean {
  const trimmed = content.trimStart();
  if (!trimmed) return false;

  // Quick reject: not XML-like at all.
  if (!trimmed.startsWith('<')) return false;

  return /<rss[\s>]/i.test(trimmed) || /<feed[\s>]/i.test(trimmed) || /<rdf:rdf[\s>]/i.test(trimmed);
}
