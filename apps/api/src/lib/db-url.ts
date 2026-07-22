/**
 * Appends `connection_limit=1` to a Prisma datasource URL when not already
 * present. Pinning the pool to a single connection per process ensures that
 * PRAGMA statements (e.g. busy_timeout) applied at startup reliably cover the
 * one connection Prisma will ever use; horizontal concurrency is achieved via
 * node:cluster processes rather than per-process connection pools.
 */
export function withConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]connection_limit=/i.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=1`;
}
