/**
 * Per-user cursor persistence for the global realtime SSE stream.
 *
 * The cursor is the highest realtime event id the browser has processed for the current
 * user. It is namespaced by user id so switching accounts on the same browser never leaks
 * a resume position across users, and is monotonic so an out-of-order write can never make
 * the client re-request events it has already applied.
 */

export function cursorStorageKey(userId: string): string {
  return `chattrader:realtime-cursor:${userId}`;
}

/** Reads the persisted cursor for a user. Returns 0 when absent or malformed. */
export function readCursor(storage: Storage, userId: string): number {
  const raw = storage.getItem(cursorStorageKey(userId));
  if (raw === null) return 0;
  if (!/^\d+$/.test(raw)) return 0;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return value;
}

/** Persists a cursor for a user, but only ever advances it — never regresses to a lower id. */
export function writeCursor(storage: Storage, userId: string, eventId: number): void {
  const current = readCursor(storage, userId);
  if (eventId <= current) return;
  storage.setItem(cursorStorageKey(userId), String(eventId));
}

/** Builds the authenticated global realtime stream URL for the given resume cursor. */
export function streamUrl(userId: string, cursor: number): string {
  void userId;
  return `/api/realtime/stream?cursor=${cursor}`;
}
