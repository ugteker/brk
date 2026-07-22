import { describe, expect, it } from 'vitest';
import { withConnectionLimit } from './db-url';

describe('withConnectionLimit', () => {
  it('appends ?connection_limit=1 to a plain url', () => {
    expect(withConnectionLimit('file:./dev.db')).toBe('file:./dev.db?connection_limit=1');
  });

  it('appends &connection_limit=1 when url already has a query string', () => {
    expect(withConnectionLimit('file:./dev.db?mode=memory')).toBe(
      'file:./dev.db?mode=memory&connection_limit=1'
    );
  });

  it('returns url unchanged when connection_limit is already present', () => {
    const url = 'file:./dev.db?connection_limit=5';
    expect(withConnectionLimit(url)).toBe(url);
  });

  it('returns undefined unchanged', () => {
    expect(withConnectionLimit(undefined)).toBeUndefined();
  });
});
