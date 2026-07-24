import { describe, expect, it, vi } from 'vitest';
import { SourceRepository } from './repository';

describe('SourceRepository', () => {
  it('refreshes changed feed cover metadata while preserving existing library card fields', async () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    const rows = [
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'podcast_feeds',
        value: 'https://example.com/feed.xml',
        status: 'active',
        configJson: JSON.stringify({
          libraryCard: {
            title: 'Market Pulse',
            coverImageUrl: null,
            itemCount: 2,
            previewItems: [{ title: 'Episode 1', link: 'https://example.com/1', pubDate: null }]
          },
          custom: true
        }),
        createdAt: now,
        updatedAt: now
      },
      {
        id: 'source-2',
        ownerUserId: 'user-2',
        type: 'podcast_feeds',
        value: 'https://example.com/feed.xml',
        status: 'active',
        configJson: JSON.stringify({
          libraryCard: {
            title: 'Already Fresh',
            coverImageUrl: 'https://cdn.example.com/new-cover.jpg',
            previewItems: []
          }
        }),
        createdAt: now,
        updatedAt: now
      }
    ];
    const update = vi.fn(async ({ data }: { data: { configJson: string } }) => ({ ...rows[0], configJson: data.configJson }));
    const tx = { source: { update } };
    const db = {
      source: {
        findMany: vi.fn(async () => rows)
      },
      $transaction: vi.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const realtime = { append: vi.fn(async () => {}) };
    const repository = new SourceRepository(db as never, realtime);

    const updated = await repository.refreshCoverImageUrl('podcast_feeds', 'https://example.com/feed.xml', 'https://cdn.example.com/new-cover.jpg');

    expect(updated).toBe(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'source-1' },
      data: {
        configJson: JSON.stringify({
          libraryCard: {
            title: 'Market Pulse',
            coverImageUrl: 'https://cdn.example.com/new-cover.jpg',
            itemCount: 2,
            previewItems: [{ title: 'Episode 1', link: 'https://example.com/1', pubDate: null }]
          },
          custom: true
        })
      }
    });
    expect(realtime.append).toHaveBeenCalledWith(tx, { userId: 'user-1', topic: 'source.changed', entityId: 'source-1' });
  });

  it('preserves synthetic material fields (audioCount, hasAudio) on the library card metadata', async () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    const db = {
      source: {
        findUnique: vi.fn(async () => ({
          id: 'source-syn',
          ownerUserId: 'user-1',
          type: 'synthetic_discussion',
          value: 'synthetic_discussion:d1',
          status: 'active',
          configJson: JSON.stringify({
            discussionId: 'd1',
            libraryCard: {
              title: 'Bull vs Bear',
              itemCount: 2,
              audioCount: 1,
              previewItems: [
                { title: 'Bull vs Bear — 2026-07-22', link: 'discussion-run:r1', pubDate: null, hasAudio: true },
                { title: 'Bull vs Bear — 2026-07-21', link: 'discussion-run:r0', pubDate: null, hasAudio: false }
              ]
            }
          }),
          createdAt: now,
          updatedAt: now
        }))
      }
    };
    const repository = new SourceRepository(db as never);

    const source = await repository.getSource('source-syn');

    expect(source?.metadata.audioCount).toBe(1);
    expect(source?.metadata.previewItems).toEqual([
      expect.objectContaining({ link: 'discussion-run:r1', hasAudio: true }),
      expect.objectContaining({ link: 'discussion-run:r0', hasAudio: false })
    ]);
  });

  it('saves one canonical source without cloning it', async () => {
    const rows = [
      {
        id: 'owned-source',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://owned.example.com',
        status: 'active',
        configJson: JSON.stringify({ libraryCard: { title: 'Owned', coverImageUrl: null, previewItems: [] } }),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const db = {
      source: {
        findMany: vi.fn(async () => rows),
        create: vi.fn(async () => rows[0])
      },
      userLibrarySource: {
        upsert: vi.fn(async () => ({ userId: 'user-2', sourceId: 'source-1' }))
      },
      $transaction: vi.fn(async (fn: any) => fn({ source: db.source, userLibrarySource: db.userLibrarySource }))
    } as any;

    const realtime = { append: vi.fn(async () => {}) };
    const repository = new SourceRepository(db as never, realtime);

    // attempt to save same canonical source twice
    await (repository as any).saveSource('user-2', 'source-1');
    await (repository as any).saveSource('user-2', 'source-1');

    expect(db.source.create).not.toHaveBeenCalled();
    expect(db.userLibrarySource.upsert).toHaveBeenCalledTimes(2);
  });

  it('lists owned and saved canonical sources for a user', async () => {
    const owned = {
      id: 'owned-source',
      ownerUserId: 'user-2',
      type: 'web_urls',
      value: 'https://owned.example.com',
      status: 'active',
      configJson: JSON.stringify({ libraryCard: { title: 'Owned', coverImageUrl: null, previewItems: [] } }),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z')
    };
    const saved = {
      id: 'saved-source',
      ownerUserId: 'user-1',
      type: 'web_urls',
      value: 'https://saved.example.com',
      status: 'active',
      configJson: JSON.stringify({ libraryCard: { title: 'Saved', coverImageUrl: null, previewItems: [] } }),
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z')
    };

    const db = {
      source: {
        findMany: vi.fn(async ({ where }: any) => {
          // listSources should fetch owned and map saved memberships to canonical sources
          if (where?.ownerUserId) return [owned];
          return [owned, saved];
        }),
        findUnique: vi.fn(async (q: any) => (q.where?.id === 'saved-source' ? saved : null))
      },
      userLibrarySource: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.userId === 'user-2') return [{ userId: 'user-2', sourceId: 'saved-source' }];
          return [];
        })
      }
    } as any;

    const repository = new SourceRepository(db as never);

    const result = await repository.listSources('user-2');
    expect(result.map((s) => s.id)).toEqual(['saved-source', 'owned-source']);
  });

  it('batches saved source lookup with a single findMany when available', async () => {
    const owned = {
      id: 'owned-source',
      ownerUserId: 'user-2',
      type: 'web_urls',
      value: 'https://owned.example.com',
      status: 'active',
      configJson: JSON.stringify({ libraryCard: { title: 'Owned', coverImageUrl: null, previewItems: [] } }),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z')
    };
    const saved = {
      id: 'saved-source',
      ownerUserId: 'user-1',
      type: 'web_urls',
      value: 'https://saved.example.com',
      status: 'active',
      configJson: JSON.stringify({ libraryCard: { title: 'Saved', coverImageUrl: null, previewItems: [] } }),
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-02T00:00:00.000Z')
    };

    const findMany = vi.fn(async ({ where }: any) => {
      if (where?.ownerUserId) return [owned];
      if (where?.id?.in) return [saved];
      return [];
    });

    const db = {
      source: { findMany },
      userLibrarySource: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.userId === 'user-2') return [{ userId: 'user-2', sourceId: 'saved-source' }];
          return [];
        })
      }
    } as any;

    const repository = new SourceRepository(db as never);

    const result = await repository.listSources('user-2');
    // the DB findMany should have been called; ensure one call used an id.in filter
    expect(findMany).toHaveBeenCalled();
    const usedInFilter = findMany.mock.calls.some((call: any[]) => call[0]?.where?.id?.in instanceof Array);
    expect(usedInFilter).toBe(true);
    expect(result.map((s) => s.id)).toEqual(['saved-source', 'owned-source']);
  });
});
