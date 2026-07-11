import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('hashes a password and verifies the correct plaintext against it', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');

    const matches = await verifyPassword('correct-horse-battery-staple', hash);
    expect(matches).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    const matches = await verifyPassword('wrong-password', hash);
    expect(matches).toBe(false);
  });
});
