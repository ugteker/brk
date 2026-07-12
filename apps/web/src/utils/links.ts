/**
 * Returns true when `value` looks like an http(s) URL. Not every source ref / citation is a URL
 * (e.g. podcast timestamp refs like `ep1@10:12`), so callers use this to decide whether to render
 * a clickable link or leave the value as plain text.
 */
export function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}
