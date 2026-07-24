import { describe, expect, it, vi } from 'vitest';
import { SourceIngestionService } from './ingestion-service';

function createRepository() {
  const state = {
    source: { id: 'source-1', type: 'podcast_feeds' as const, value: 'https://example.com/feed.xml' },
    cursor: {} as Record<string, unknown>,
    refreshedAt: null as Date | null,
    leased: false
  };

  return {
    getSource: vi.fn(async () => state.source),
    getRefreshState: vi.fn(async () => ({ cursor: state.cursor, refreshedAt: state.refreshedAt })),
    claimRefresh: vi.fn(async (_sourceId: string, now: Date, _leaseMs: number, freshnessMs: number) => {
      if (state.leased) return false;
      if (state.refreshedAt && now.getTime() - state.refreshedAt.getTime() < freshnessMs) {
        return false;
      }
      state.leased = true;
      return true;
    }),
    completeRefresh: vi.fn(async (_sourceId: string, _items: unknown[], cursor: Record<string, unknown>, now: Date) => {
      state.cursor = cursor;
      state.refreshedAt = now;
      state.leased = false;
    }),
    releaseRefresh: vi.fn(async () => {
      state.leased = false;
    })
  };
}

describe('SourceIngestionService', () => {
  it('refreshes one canonical source once inside the freshness window', async () => {
    const repository = createRepository();
    const adapter = {
      fetch: vi.fn(async () => ({
        items: [
          {
            title: 'Episode 1',
            content: 'Transcript',
            link: 'https://example.com/ep-1',
            publishedAt: new Date('2026-07-24T10:00:00.000Z'),
            contentHash: 'hash-1',
            metadata: { fidelity: 'high' }
          }
        ],
        cursor: { seenItemIds: ['episode-1'] }
      }))
    };
    const service = new SourceIngestionService({
      repository: repository as never,
      adapters: { podcast_feeds: adapter as never }
    });
    const now = new Date('2026-07-24T10:00:00.000Z');

    await service.ensureFresh('source-1', now);
    await service.ensureFresh('source-1', new Date(now.getTime() + 30_000));

    expect(adapter.fetch).toHaveBeenCalledTimes(1);
  });

  it('releases the lease and rethrows when the adapter fetch fails', async () => {
    const repository = createRepository();
    const adapter = {
      fetch: vi.fn(async () => {
        throw new Error('upstream down');
      })
    };
    const service = new SourceIngestionService({
      repository: repository as never,
      adapters: { podcast_feeds: adapter as never }
    });

    await expect(service.ensureFresh('source-1', new Date('2026-07-24T10:00:00.000Z'))).rejects.toThrow('upstream down');
    expect(repository.releaseRefresh).toHaveBeenCalledWith('source-1');
  });

  it('bypasses freshness when a forced item link is requested', async () => {
    const repository = createRepository();
    const adapter = {
      fetch: vi.fn(async () => ({
        items: [],
        cursor: { seenItemIds: [] }
      }))
    };
    const service = new SourceIngestionService({
      repository: repository as never,
      adapters: { podcast_feeds: adapter as never }
    });
    const now = new Date('2026-07-24T10:00:00.000Z');

    await service.ensureFresh('source-1', now);
    await service.ensureFresh('source-1', new Date(now.getTime() + 5_000), { forcedItemLink: 'https://example.com/ep-1' });

    expect(adapter.fetch).toHaveBeenCalledTimes(2);
  });

  it('passes the requested canonical item limit through to feed refreshes', async () => {
    const repository = createRepository();
    const adapter = {
      fetch: vi.fn(async (_source, _cursor, options?: { limit?: number }) => ({
        items: Array.from({ length: options?.limit ?? 0 }, (_, index) => ({
          title: `Episode ${index + 1}`,
          content: `Transcript ${index + 1}`,
          link: `https://example.com/ep-${index + 1}`,
          publishedAt: new Date(`2026-07-24T10:0${index}:00.000Z`),
          contentHash: `hash-${index + 1}`,
          metadata: { fidelity: 'high' }
        })),
        cursor: { seenItemIds: ['episode-1', 'episode-2'] }
      }))
    };
    const service = new SourceIngestionService({
      repository: repository as never,
      adapters: { podcast_feeds: adapter as never }
    });

    await (service as any).ensureFresh('source-1', new Date('2026-07-24T10:00:00.000Z'), { limit: 2 });

    expect(adapter.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'source-1',
        type: 'podcast_feeds',
        value: 'https://example.com/feed.xml'
      }),
      {},
      expect.objectContaining({ limit: 2 })
    );
    expect(repository.completeRefresh).toHaveBeenCalledWith(
      'source-1',
      expect.arrayContaining([
        expect.objectContaining({ link: 'https://example.com/ep-1' }),
        expect.objectContaining({ link: 'https://example.com/ep-2' })
      ]),
      expect.any(Object),
      expect.any(Date)
    );
    expect((repository.completeRefresh.mock.calls[0]?.[1] as unknown[] | undefined)?.length).toBe(2);
  });
});
