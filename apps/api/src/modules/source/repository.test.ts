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
});
