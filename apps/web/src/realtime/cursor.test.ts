import { describe, expect, it } from 'vitest';
import { cursorStorageKey, readCursor, streamUrl, writeCursor } from './cursor';

/** Minimal in-memory Storage-shaped fake — never touches window.localStorage. */
function createFakeStorage(initial: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    }
  };
}

describe('cursorStorageKey', () => {
  it('namespaces the key by user id', () => {
    expect(cursorStorageKey('user-1')).toBe('chattrader:realtime-cursor:user-1');
  });
});

describe('readCursor', () => {
  it('returns a valid persisted decimal cursor', () => {
    const storage = createFakeStorage({ 'chattrader:realtime-cursor:user-1': '42' });
    expect(readCursor(storage, 'user-1')).toBe(42);
  });

  it('returns 0 when the value is absent', () => {
    const storage = createFakeStorage();
    expect(readCursor(storage, 'user-1')).toBe(0);
  });

  it('returns 0 when the value is malformed', () => {
    const storage = createFakeStorage({ 'chattrader:realtime-cursor:user-1': 'not-a-number' });
    expect(readCursor(storage, 'user-1')).toBe(0);
  });

  it('returns 0 when the value is negative', () => {
    const storage = createFakeStorage({ 'chattrader:realtime-cursor:user-1': '-5' });
    expect(readCursor(storage, 'user-1')).toBe(0);
  });

  it('returns 0 when the value is a decimal, not an integer', () => {
    const storage = createFakeStorage({ 'chattrader:realtime-cursor:user-1': '4.2' });
    expect(readCursor(storage, 'user-1')).toBe(0);
  });
});

describe('writeCursor', () => {
  it('persists the cursor for a user with no prior value', () => {
    const storage = createFakeStorage();
    writeCursor(storage, 'user-1', 10);
    expect(readCursor(storage, 'user-1')).toBe(10);
  });

  it('advances the cursor when the new id is higher', () => {
    const storage = createFakeStorage({ 'chattrader:realtime-cursor:user-1': '10' });
    writeCursor(storage, 'user-1', 20);
    expect(readCursor(storage, 'user-1')).toBe(20);
  });

  it('never overwrites a higher stored id with a lower event id', () => {
    const storage = createFakeStorage({ 'chattrader:realtime-cursor:user-1': '20' });
    writeCursor(storage, 'user-1', 10);
    expect(readCursor(storage, 'user-1')).toBe(20);
  });

  it('keeps distinct users isolated', () => {
    const storage = createFakeStorage();
    writeCursor(storage, 'user-1', 5);
    writeCursor(storage, 'user-2', 99);
    expect(readCursor(storage, 'user-1')).toBe(5);
    expect(readCursor(storage, 'user-2')).toBe(99);
  });
});

describe('streamUrl', () => {
  it('builds the realtime stream URL with the given cursor', () => {
    expect(streamUrl('user-1', 42)).toBe('/api/realtime/stream?cursor=42');
  });

  it('defaults to cursor 0 when starting fresh', () => {
    expect(streamUrl('user-1', 0)).toBe('/api/realtime/stream?cursor=0');
  });
});
