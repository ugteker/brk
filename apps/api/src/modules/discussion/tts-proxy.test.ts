import { describe, expect, it } from 'vitest';
import { createTtsProxyDispatcher } from './tts-proxy';

describe('createTtsProxyDispatcher', () => {
  it('returns undefined when proxy URL is empty', () => {
    expect(createTtsProxyDispatcher(undefined)).toBeUndefined();
    expect(createTtsProxyDispatcher('')).toBeUndefined();
  });

  it('returns undefined for invalid proxy URL values', () => {
    expect(createTtsProxyDispatcher('not-a-url')).toBeUndefined();
  });

  it('creates a dispatcher for valid proxy URLs', () => {
    const dispatcher = createTtsProxyDispatcher('http://user:pass@127.0.0.1:8888');
    expect(dispatcher).toBeDefined();
  });
});

