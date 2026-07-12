import { describe, expect, it } from 'vitest';
import {
  InMemorySourceCrawlConfigRepository,
  SourceCrawlConfigRepository,
  canReinspect,
  nextReinspectionState
} from './crawl-config-repository';
import type { SourceCrawlConfigState } from '../analysis/types';

function createFakeDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const key = (agentId: string, sourceValue: string) => `${agentId}::${sourceValue}`;

  return {
    agentSourceCrawlConfig: {
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

const baseState: SourceCrawlConfigState = {
  agentId: 'agent-1',
  sourceValue: 'https://example.com/blog',
  siteType: 'listing_page',
  config: {
    siteType: 'listing_page',
    itemLinkSelector: 'a.entry-title',
    itemIdHint: 'url_path',
    contentSelector: 'article',
    paginationSelector: null,
    confidence: 0.9
  },
  inspectedAt: '2026-07-01T00:00:00.000Z',
  inspectionModel: 'claude-sonnet-4-5',
  confidence: 0.9,
  lastReinspectionAt: null,
  reinspectionCount24h: 0
};

describe('SourceCrawlConfigRepository', () => {
  it('returns null when no config exists yet', async () => {
    const repo = new SourceCrawlConfigRepository(createFakeDb() as never);
    expect(await repo.getConfig('agent-1', 'https://example.com/blog')).toBeNull();
  });

  it('persists and round-trips a config via create then update', async () => {
    const repo = new SourceCrawlConfigRepository(createFakeDb() as never);

    await repo.saveConfig(baseState);
    const first = await repo.getConfig('agent-1', 'https://example.com/blog');
    expect(first?.siteType).toBe('listing_page');
    expect(first?.config).toEqual(baseState.config);

    await repo.saveConfig({ ...baseState, reinspectionCount24h: 1, lastReinspectionAt: '2026-07-02T00:00:00.000Z' });
    const second = await repo.getConfig('agent-1', 'https://example.com/blog');
    expect(second?.reinspectionCount24h).toBe(1);
    expect(second?.lastReinspectionAt).toBe('2026-07-02T00:00:00.000Z');
  });
});

describe('InMemorySourceCrawlConfigRepository', () => {
  it('stores and retrieves configs keyed by agent and source', async () => {
    const repo = new InMemorySourceCrawlConfigRepository();
    await repo.saveConfig(baseState);

    expect(await repo.getConfig('agent-1', 'https://example.com/blog')).toEqual(baseState);
    expect(await repo.getConfig('agent-2', 'https://example.com/blog')).toBeNull();
  });
});

describe('canReinspect', () => {
  it('allows reinspection when no config exists yet', () => {
    expect(canReinspect(null)).toBe(true);
  });

  it('allows reinspection when never reinspected before', () => {
    expect(canReinspect(baseState)).toBe(true);
  });

  it('denies reinspection when the cap (1) was already used within the last 24h', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    const state = { ...baseState, lastReinspectionAt: '2026-07-10T06:00:00.000Z', reinspectionCount24h: 1 };
    expect(canReinspect(state, now)).toBe(false);
  });

  it('allows reinspection again once the prior 24h window has elapsed', () => {
    const now = new Date('2026-07-11T12:00:01.000Z');
    const state = { ...baseState, lastReinspectionAt: '2026-07-10T12:00:00.000Z', reinspectionCount24h: 1 };
    expect(canReinspect(state, now)).toBe(true);
  });
});

describe('nextReinspectionState', () => {
  it('starts the counter at 1 for a first-ever reinspection', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    const result = nextReinspectionState(baseState, now);
    expect(result.reinspectionCount24h).toBe(1);
    expect(result.lastReinspectionAt).toBe(now.toISOString());
  });

  it('increments the counter within the same 24h window', () => {
    const now = new Date('2026-07-10T18:00:00.000Z');
    const state = { ...baseState, lastReinspectionAt: '2026-07-10T06:00:00.000Z', reinspectionCount24h: 1 };
    const result = nextReinspectionState(state, now);
    expect(result.reinspectionCount24h).toBe(2);
  });

  it('resets the counter to 1 once the prior window has elapsed', () => {
    const now = new Date('2026-07-12T00:00:00.000Z');
    const state = { ...baseState, lastReinspectionAt: '2026-07-10T06:00:00.000Z', reinspectionCount24h: 1 };
    const result = nextReinspectionState(state, now);
    expect(result.reinspectionCount24h).toBe(1);
  });
});
