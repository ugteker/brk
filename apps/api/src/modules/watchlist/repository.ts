import type { PrismaClient } from '@prisma/client';

export interface WatchlistEntryRecord {
  id: string;
  userId: string;
  symbol: string;
  createdAt: Date;
}

export interface WatchlistRepositoryLike {
  list(userId: string): Promise<WatchlistEntryRecord[]>;
  add(userId: string, symbol: string): Promise<WatchlistEntryRecord>;
  remove(userId: string, symbol: string): Promise<void>;
  /** All watchlist entries (across every user) matching any of the given symbols. */
  listWatchersForSymbols(symbols: string[]): Promise<WatchlistEntryRecord[]>;
}

/** Symbols are stored normalized (trimmed, uppercase) so AAPL/aapl/ aapl are one entry. */
export function normalizeWatchlistSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function mapEntry(row: { id: string; userId: string; symbol: string; createdAt: Date }): WatchlistEntryRecord {
  return { id: row.id, userId: row.userId, symbol: row.symbol, createdAt: row.createdAt };
}

export class WatchlistRepository implements WatchlistRepositoryLike {
  constructor(private readonly db: Pick<PrismaClient, 'watchlistEntry'>) {}

  async list(userId: string): Promise<WatchlistEntryRecord[]> {
    const rows = await this.db.watchlistEntry.findMany({ where: { userId }, orderBy: { symbol: 'asc' } });
    return rows.map(mapEntry);
  }

  async add(userId: string, symbol: string): Promise<WatchlistEntryRecord> {
    const normalized = normalizeWatchlistSymbol(symbol);
    // Upsert so double-clicking a follow button can't error on the unique constraint.
    const row = await this.db.watchlistEntry.upsert({
      where: { userId_symbol: { userId, symbol: normalized } },
      create: { userId, symbol: normalized },
      update: {}
    });
    return mapEntry(row);
  }

  async remove(userId: string, symbol: string): Promise<void> {
    await this.db.watchlistEntry.deleteMany({ where: { userId, symbol: normalizeWatchlistSymbol(symbol) } });
  }

  async listWatchersForSymbols(symbols: string[]): Promise<WatchlistEntryRecord[]> {
    if (symbols.length === 0) return [];
    const rows = await this.db.watchlistEntry.findMany({
      where: { symbol: { in: symbols.map(normalizeWatchlistSymbol) } }
    });
    return rows.map(mapEntry);
  }
}

export class InMemoryWatchlistRepository implements WatchlistRepositoryLike {
  entries: WatchlistEntryRecord[] = [];
  private seq = 0;

  async list(userId: string): Promise<WatchlistEntryRecord[]> {
    return this.entries.filter((e) => e.userId === userId).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  async add(userId: string, symbol: string): Promise<WatchlistEntryRecord> {
    const normalized = normalizeWatchlistSymbol(symbol);
    const existing = this.entries.find((e) => e.userId === userId && e.symbol === normalized);
    if (existing) return existing;
    this.seq += 1;
    const entry: WatchlistEntryRecord = { id: `watch-${this.seq}`, userId, symbol: normalized, createdAt: new Date() };
    this.entries.push(entry);
    return entry;
  }

  async remove(userId: string, symbol: string): Promise<void> {
    const normalized = normalizeWatchlistSymbol(symbol);
    this.entries = this.entries.filter((e) => !(e.userId === userId && e.symbol === normalized));
  }

  async listWatchersForSymbols(symbols: string[]): Promise<WatchlistEntryRecord[]> {
    const wanted = new Set(symbols.map(normalizeWatchlistSymbol));
    return this.entries.filter((e) => wanted.has(e.symbol));
  }
}
