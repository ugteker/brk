import { describe, expect, it } from 'vitest';
import { InMemorySourceCursorRepository, SourceCursorRepository } from './source-cursor-repository';
import type { SourceCursorState } from '../analysis/types';

function createFakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const key = (agentId: string, sourceValue: string) => `${agentId}::${sourceValue}`;

  return {
    agentSourceCursor: {
      findUnique: async ({ where: { agentId_sourceValue } }: { where: { agentId_sourceValue: { agentId: string; sourceValue: string } } }) => {
        return rows.get(key(agentId_sourceValue.agentId, agentId_sourceValue.sourceValue)) ?? null;
      },
      upsert: async ({
        where: { agentId_sourceValue },
        create,
        update
      }: {
        where: { agentId_sourceValue: { agentId: string; sourceValue: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const k = key(agentId_sourceValue.agentId, agentId_sourceValue.sourceValue);
        const existing = rows.get(k);
        const row = existing ? { ...existing, ...update } : { ...create };
        rows.set(k, row);
        return row;
      }
    }
  };
}

const baseState: SourceCursorState = {
  agentId: 'agent-1',
  sourceValue: 'https://example.com/feed',
  strategy: 'feed_items',
  seenItemIds: ['item-1', 'item-2'],
  lastItemPublishedAt: '2026-07-01T00:00:00.000Z',
  lastContentHash: null
};

describe('SourceCursorRepository', () => {
  it('returns null when no cursor exists yet', async () => {
    const repo = new SourceCursorRepository(createFakeDb() as never);
    expect(await repo.getCursor('agent-1', 'https://example.com/feed')).toBeNull();
  });

  it('persists and round-trips a cursor via create then update', async () => {
    const repo = new SourceCursorRepository(createFakeDb() as never);

    await repo.saveCursor(baseState);
    const first = await repo.getCursor('agent-1', 'https://example.com/feed');
    expect(first?.seenItemIds).toEqual(['item-1', 'item-2']);

    await repo.saveCursor({ ...baseState, seenItemIds: ['item-1', 'item-2', 'item-3'] });
    const second = await repo.getCursor('agent-1', 'https://example.com/feed');
    expect(second?.seenItemIds).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('round-trips a content-hash cursor', async () => {
    const repo = new SourceCursorRepository(createFakeDb() as never);
    const hashState: SourceCursorState = {
      agentId: 'agent-1',
      sourceValue: 'https://example.com/page',
      strategy: 'content_hash',
      seenItemIds: [],
      lastItemPublishedAt: null,
      lastContentHash: 'abc123'
    };

    await repo.saveCursor(hashState);
    const result = await repo.getCursor('agent-1', 'https://example.com/page');
    expect(result?.lastContentHash).toBe('abc123');
    expect(result?.strategy).toBe('content_hash');
  });
});

describe('InMemorySourceCursorRepository', () => {
  it('stores and retrieves cursors keyed by agent and source', async () => {
    const repo = new InMemorySourceCursorRepository();
    await repo.saveCursor(baseState);

    expect(await repo.getCursor('agent-1', 'https://example.com/feed')).toEqual(baseState);
    expect(await repo.getCursor('agent-2', 'https://example.com/feed')).toBeNull();
  });
});
