import { logger } from './logger';

export interface SqlitePragmaClient {
  $queryRawUnsafe(sql: string): Promise<unknown>;
}

// WAL lets concurrent readers coexist with one writer — required once several
// cluster processes share the same SQLite file. journal_mode is persisted in
// the db file; busy_timeout is per-connection, so every process must set it.
// busy_timeout is reliable here because db.ts pins the Prisma pool to a single
// connection per process (connection_limit=1), so this PRAGMA covers the only
// connection the process will ever use.
// PRAGMA failures (e.g. exotic filesystems) are non-fatal: we log and keep the
// default journal mode rather than crash the process.
export async function applySqlitePragmas(
  db: SqlitePragmaClient,
  log: { warn(msg: string): void } = logger
): Promise<void> {
  try {
    await db.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
    await db.$queryRawUnsafe('PRAGMA busy_timeout=5000;');
  } catch (err) {
    log.warn(`[db] failed to apply SQLite pragmas (continuing with defaults): ${err instanceof Error ? err.message : String(err)}`);
  }
}
