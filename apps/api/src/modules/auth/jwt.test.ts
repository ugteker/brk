import { describe, expect, it } from 'vitest';
import { signSessionToken, verifySessionToken } from './jwt';

describe('session tokens', () => {
  it('signs and verifies a valid token', () => {
    const token = signSessionToken({ userId: 'user-1' });
    const payload = verifySessionToken(token);
    expect(payload?.userId).toBe('user-1');
  });

  it('returns null for a malformed token', () => {
    expect(verifySessionToken('not-a-real-token')).toBeNull();
  });
});
