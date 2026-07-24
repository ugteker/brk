import { describe, expect, it } from 'vitest';
import { SourceIngestionRepository } from './ingestion-repository';

function createFakeDb() {
  const sources = new Map<string, any>([
    ['source-1', { id: 'source-1', type: 'podcast_feeds', value: 'https://example.com/feed.xml' }]
  ]);
  const ingestionStates = new Map<string, any>();
  const sourceItems = new Map<string, any>();
  const sourceItemsBySourceAndLink = new Map<string, string>();
  const playbookSourceItems = new Map<string, any>();
  const playbookSources = [
    {
      playbookId: 'playbook-1',
      sourceId: 'source-1',
      source: { id: 'source-1', type: 'podcast_feeds', value: 'https://example.com/feed.xml' }
    },
    {
      playbookId: 'playbook-2',
      sourceId: 'source-1',
      source: { id: 'source-1', type: 'podcast_feeds', value: 'https://example.com/feed.xml' }
    }
  ];
  let nextSourceItemId = 1;

  const sourceKey = (sourceId: string, link: string) => `${sourceId}::${link}`;
  const consumptionKey = (playbookId: string, sourceItemId: string) => `${playbookId}::${sourceItemId}`;

  const db: any = {
    source: {
      findUnique: async ({ where }: any) => sources.get(where.id) ?? null
    },
    sourceIngestionState: {
      findUnique: async ({ where }: any) => ingestionStates.get(where.sourceId) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `state-${data.sourceId}`, ...data };
        ingestionStates.set(data.sourceId, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = { ...(ingestionStates.get(where.sourceId) ?? {}), ...data, sourceId: where.sourceId };
        ingestionStates.set(where.sourceId, row);
        return row;
      },
      upsert: async ({ where, create, update }: any) => {
        if (ingestionStates.has(where.sourceId)) {
          const row = { ...ingestionStates.get(where.sourceId), ...update };
          ingestionStates.set(where.sourceId, row);
          return row;
        }
        const row = { id: `state-${where.sourceId}`, ...create };
        ingestionStates.set(where.sourceId, row);
        return row;
      }
    },
    sourceItem: {
      upsert: async ({ where, create, update, include }: any) => {
        const key = sourceKey(where.sourceId_link.sourceId, where.sourceId_link.link);
        const existingId = sourceItemsBySourceAndLink.get(key);
        const id = existingId ?? `item-${nextSourceItemId++}`;
        const row = {
          id,
          ...(existingId ? sourceItems.get(id) : {}),
          ...(existingId ? update : create)
        };
        sourceItems.set(id, row);
        sourceItemsBySourceAndLink.set(key, id);
        if (!include?.source) return row;
        return { ...row, source: sources.get(row.sourceId) };
      },
      findMany: async ({ where, take, include }: any) => {
        const rows = [...sourceItems.values()]
          .filter((row) => row.sourceId === where.sourceId)
          .filter((row) => !playbookSourceItems.has(consumptionKey(where.playbookSourceItems.none.playbookId, row.id)))
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
          .slice(0, take);
        if (!include?.source) return rows;
        return rows.map((row) => ({ ...row, source: sources.get(row.sourceId) }));
      },
      findUnique: async ({ where, include }: any) => {
        const id = sourceItemsBySourceAndLink.get(sourceKey(where.sourceId_link.sourceId, where.sourceId_link.link));
        if (!id) return null;
        const row = sourceItems.get(id);
        if (!include?.source) return row;
        return { ...row, source: sources.get(row.sourceId) };
      }
    },
    playbookSourceItem: {
      upsert: async ({ where, create }: any) => {
        const key = consumptionKey(where.playbookId_sourceItemId.playbookId, where.playbookId_sourceItemId.sourceItemId);
        const row = playbookSourceItems.get(key) ?? { id: key, ...create };
        playbookSourceItems.set(key, row);
        return row;
      }
    },
    playbookSource: {
      findMany: async ({ where }: any) => playbookSources.filter((row) => row.playbookId === where.playbookId)
    }
  };
  db.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(db);
  return { db };
}

describe('SourceIngestionRepository', () => {
  it('lets two playbooks consume the same stored source item independently', async () => {
    const { db } = createFakeDb();
    const repository = new SourceIngestionRepository(db as never);

    await repository.completeRefresh(
      'source-1',
      [
        {
          title: 'Episode 1',
          content: 'Transcript',
          link: 'https://example.com/ep-1',
          publishedAt: new Date('2026-07-24T10:00:00.000Z'),
          contentHash: 'hash-1',
          metadata: { fidelity: 'high' }
        }
      ],
      { seenItemIds: ['episode-1'] },
      new Date('2026-07-24T10:00:00.000Z')
    );

    const first = await repository.listUnconsumed('playbook-1', 'source-1', 3);
    const second = await repository.listUnconsumed('playbook-2', 'source-1', 3);

    expect(first[0].id).toBe('item-1');
    expect(second[0].id).toBe('item-1');

    await repository.markConsumed('playbook-1', ['item-1'], new Date('2026-07-24T10:05:00.000Z'));

    expect(await repository.listUnconsumed('playbook-1', 'source-1', 3)).toEqual([]);
    expect((await repository.listUnconsumed('playbook-2', 'source-1', 3))[0].id).toBe('item-1');
  });

  it('claims a refresh once and then treats the source as fresh inside the freshness window', async () => {
    const { db } = createFakeDb();
    const repository = new SourceIngestionRepository(db as never);
    const now = new Date('2026-07-24T10:00:00.000Z');

    await expect(repository.claimRefresh('source-1', now, 30_000, 60_000)).resolves.toBe(true);
    await repository.completeRefresh('source-1', [], {}, now);

    await expect(repository.claimRefresh('source-1', new Date('2026-07-24T10:00:30.000Z'), 30_000, 60_000)).resolves.toBe(false);
    await expect(repository.claimRefresh('source-1', new Date('2026-07-24T10:01:01.000Z'), 30_000, 60_000)).resolves.toBe(true);
  });
});
