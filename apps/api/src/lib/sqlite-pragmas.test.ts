import { describe, expect, it, vi } from 'vitest';
import { applySqlitePragmas } from './sqlite-pragmas';

describe('applySqlitePragmas', () => {
  it('enables WAL and sets busy_timeout', async () => {
    const executed: string[] = [];
    const db = {
      $queryRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return [];
      }
    };

    await applySqlitePragmas(db);

    expect(executed).toEqual(['PRAGMA journal_mode=WAL;', 'PRAGMA busy_timeout=5000;']);
  });

  it('logs a warning and does not throw when a pragma fails', async () => {
    const warn = vi.fn();
    const db = {
      $queryRawUnsafe: async () => {
        throw new Error('disk I/O error');
      }
    };

    await expect(applySqlitePragmas(db, { warn })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('disk I/O error');
  });
});
