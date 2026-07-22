import { describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { parsePositiveCursor, resolveCursor, formatSse } from './routes';
import type { RealtimeEventRepository } from './routes';

function makeRepo(overrides: Partial<RealtimeEventRepository> = {}): RealtimeEventRepository {
  return {
    oldestIdForUser: vi.fn().mockResolvedValue(null),
    listAfter: vi.fn().mockRejectedValue(new Error('test-end')),
    ...overrides,
  };
}

async function buildTestApp(repository: RealtimeEventRepository) {
  return buildServer({
    agentRepository: {
      createAgent: async () => { throw new Error('unused'); },
      updateAgent: async () => { throw new Error('unused'); },
      disableAgent: async () => {},
      enableAgent: async () => {},
      deleteAgent: async () => {},
      listAgents: async () => [],
      getAgent: async () => null,
      listRecentRuns: async () => [],
      shareAgent: async () => {},
      listAgentShares: async () => [],
      revokeAgentShare: async () => {}
    } as any,
    agents: {
      promptRepository: { savePromptVersion: async () => { throw new Error('unused'); }, getLatestPromptVersion: async () => null },
      reportRepository: {
        getLatestRunReport: async () => null,
        listReportsForAgent: async () => [],
        getReportById: async () => null,
        listSignalHistoryForSymbol: async () => []
      }
    } as any,
    auth: createTestAuthDeps(),
    realtime: { repository },
  });
}

describe('parsePositiveCursor', () => {
  it('parses zero and positive integer strings', () => {
    expect(parsePositiveCursor('0')).toBe(0);
    expect(parsePositiveCursor('42')).toBe(42);
    expect(parsePositiveCursor('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('returns null for non-string values (including arrays from repeated query params)', () => {
    expect(parsePositiveCursor(42)).toBeNull();
    expect(parsePositiveCursor(null)).toBeNull();
    expect(parsePositiveCursor(undefined)).toBeNull();
    expect(parsePositiveCursor(['4'])).toBeNull();
  });

  it('returns null for negative numbers', () => {
    expect(parsePositiveCursor('-1')).toBeNull();
  });

  it('returns null for floats', () => {
    expect(parsePositiveCursor('3.14')).toBeNull();
    expect(parsePositiveCursor('1e2')).toBeNull();
  });

  it('returns null for non-decimal strings', () => {
    expect(parsePositiveCursor('abc')).toBeNull();
    expect(parsePositiveCursor('')).toBeNull();
    expect(parsePositiveCursor(' 4')).toBeNull();
  });
});

describe('resolveCursor', () => {
  it('returns the greater of query and header values', () => {
    expect(resolveCursor('4', '8')).toBe(8);
    expect(resolveCursor('8', '4')).toBe(8);
  });

  it('returns 0 when both are absent or invalid', () => {
    expect(resolveCursor(null, null)).toBe(0);
    expect(resolveCursor('bad', 'worse')).toBe(0);
  });

  it('uses the valid value when the other is invalid', () => {
    expect(resolveCursor('5', 'bad')).toBe(5);
    expect(resolveCursor('bad', '5')).toBe(5);
  });
});

describe('formatSse', () => {
  it('produces correct SSE format with id', () => {
    const dto = { id: 42, topic: 'source.changed', entityId: 'source-1', createdAt: '2026-07-22T10:00:00.000Z' };
    const result = formatSse('change', dto, 42);
    expect(result).toBe(`id: 42\nevent: change\ndata: ${JSON.stringify(dto)}\n\n`);
  });

  it('omits the id line when id is undefined', () => {
    const result = formatSse('resync', {});
    expect(result).toBe('event: resync\ndata: {}\n\n');
  });
});

describe('realtime stream route', () => {
  it('rejects an unauthenticated stream request with 401', async () => {
    const app = await buildTestApp(makeRepo());
    const response = await app.inject({ method: 'GET', url: '/api/realtime/stream' });
    expect(response.statusCode).toBe(401);
  });

  it('uses the greater valid cursor from query and Last-Event-ID', async () => {
    // query cursor=4, Last-Event-ID=8 => listAfter(userId, 8)
    const repo = makeRepo({
      oldestIdForUser: vi.fn().mockResolvedValue(null),
      listAfter: vi.fn().mockRejectedValue(new Error('test-end')),
    });
    const app = await buildTestApp(repo);

    await app.inject({
      method: 'GET',
      url: '/api/realtime/stream?cursor=4',
      headers: { ...authCookieHeader(), 'last-event-id': '8' },
    });

    expect(repo.listAfter).toHaveBeenCalledWith('test-user', 8);
  });

  it('returns resync before normal events when cursor predates the retained feed', async () => {
    // oldest retained id=20, cursor=7 => event: resync
    const repo = makeRepo({
      oldestIdForUser: vi.fn().mockResolvedValue(20),
      listAfter: vi.fn().mockRejectedValue(new Error('test-end')),
    });
    const app = await buildTestApp(repo);

    const response = await app.inject({
      method: 'GET',
      url: '/api/realtime/stream?cursor=7',
      headers: authCookieHeader(),
    });

    expect(response.body).toContain('event: resync');
  });

  it('sets unbuffered SSE headers', async () => {
    const app = await buildTestApp(makeRepo());

    const response = await app.inject({
      method: 'GET',
      url: '/api/realtime/stream',
      headers: authCookieHeader(),
    });

    expect(response.headers['x-accel-buffering']).toBe('no');
    expect(response.headers['cache-control']).toContain('no-transform');
  });

  it('includes agentId in the emitted change event dto, alongside entityId', async () => {
    const repo = makeRepo({
      oldestIdForUser: vi.fn().mockResolvedValue(null),
      listAfter: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 1, topic: 'run.changed', entityId: 'run-1', agentId: 'agent-1', createdAt: new Date('2026-07-22T10:00:00.000Z') },
        ])
        .mockRejectedValue(new Error('test-end')),
    });
    const app = await buildTestApp(repo);

    const response = await app.inject({
      method: 'GET',
      url: '/api/realtime/stream',
      headers: authCookieHeader(),
    });

    expect(response.body).toContain('"entityId":"run-1"');
    expect(response.body).toContain('"agentId":"agent-1"');
  });

  it('emits agentId null for topics without agent ownership (e.g. source.changed)', async () => {
    const repo = makeRepo({
      oldestIdForUser: vi.fn().mockResolvedValue(null),
      listAfter: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 1, topic: 'source.changed', entityId: 'source-1', agentId: null, createdAt: new Date('2026-07-22T10:00:00.000Z') },
        ])
        .mockRejectedValue(new Error('test-end')),
    });
    const app = await buildTestApp(repo);

    const response = await app.inject({
      method: 'GET',
      url: '/api/realtime/stream',
      headers: authCookieHeader(),
    });

    expect(response.body).toContain('"agentId":null');
  });
});
