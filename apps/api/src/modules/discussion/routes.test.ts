import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerDiscussionRoutes } from './routes';
import type { DiscussionRepositoryLike } from './repository';

const discRow = {
  id: 'd1', ownerUserId: 'u1', name: 'Test', description: '', format: 'free_form' as const,
  formatConfig: {}, scheduleJson: null, syntheticSourceId: null,
  createdAt: new Date(), updatedAt: new Date(), participants: []
};
const runRow = {
  id: 'r1', discussionId: 'd1', status: 'pending' as const, triggeredBy: 'manual' as const,
  errorMessage: null, startedAt: null, completedAt: null, syntheticSourceItemId: null, audioUrl: null,
  createdAt: new Date(), turns: []
};

function mockRepo(overrides: Partial<DiscussionRepositoryLike> = {}): DiscussionRepositoryLike {
  return {
    createDiscussion: vi.fn().mockResolvedValue(discRow),
    getDiscussion: vi.fn().mockResolvedValue(discRow),
    listDiscussions: vi.fn().mockResolvedValue([discRow]),
    updateDiscussion: vi.fn().mockResolvedValue(discRow),
    deleteDiscussion: vi.fn().mockResolvedValue(undefined),
    setSyntheticSourceId: vi.fn().mockResolvedValue(undefined),
    createRun: vi.fn().mockResolvedValue(runRow),
    getRunWithTurns: vi.fn().mockResolvedValue(runRow),
    listRuns: vi.fn().mockResolvedValue([runRow]),
    updateRun: vi.fn().mockResolvedValue(undefined),
    createTurn: vi.fn().mockResolvedValue({ id: 't1', turnIndex: 0 }),
    updateTurnAudioUrl: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as any;
}

async function buildApp(
  repoOverrides: Partial<DiscussionRepositoryLike> = {},
  extraDeps: { reportRepository?: any; latestReportLimit?: number; artifactRepository?: any } = {}
) {
  const app = Fastify();
  await app.register(cookie);
  app.addHook('onRequest', async (req) => { req.userId = 'u1'; req.userRole = 'user'; });
  await registerDiscussionRoutes(app, { discussionRepository: mockRepo(repoOverrides), ...extraDeps });
  return app;
}

describe('Discussion routes', () => {
  it('GET /api/discussions returns 200 with list', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/discussions' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it('POST /api/discussions returns 400 with < 2 participants', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/discussions',
      payload: { name: 'Test', format: 'free_form', participants: [{ agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 }] }
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/discussions returns 201 with 2+ participants', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/discussions',
      payload: { name: 'Test', format: 'free_form', participants: [
        { agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 },
        { agentId: 'a2', role: 'speaker', voiceId: 'echo', speakerOrder: 1 }
      ]}
    });
    expect(res.statusCode).toBe(201);
  });

  it('GET /api/discussions/:id returns 200 for owner', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/discussions/d1' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /api/discussions/:id returns 404 for non-owner', async () => {
    const app = await buildApp({ getDiscussion: vi.fn().mockResolvedValue({ ...discRow, ownerUserId: 'other' }) });
    const res = await app.inject({ method: 'GET', url: '/api/discussions/d1' });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /api/discussions/:id returns 204', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/discussions/d1' });
    expect(res.statusCode).toBe(204);
  });

  it('POST /api/discussions/:id/runs returns 202', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(202);
  });

  it('GET /api/discussions/:id/runs/:runId returns 200', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/discussions/d1/runs/r1' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/discussions/:id/runs/:runId/audio returns 501 when tts not configured', async () => {
    const app = await buildApp({
      getRunWithTurns: vi.fn().mockResolvedValue({ ...runRow, status: 'done' })
    });
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs/r1/audio' });
    expect(res.statusCode).toBe(501);
  });

  it('GET /api/discussions/capabilities reports tts=false without a TTS client', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/discussions/capabilities' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ tts: false, ttsProviders: [] });
  });

  it('GET /api/discussions/capabilities reports tts=true when client and storage are wired', async () => {
    const app = Fastify();
    await app.register(cookie);
    app.addHook('onRequest', async (req) => { req.userId = 'u1'; req.userRole = 'user'; });
    await registerDiscussionRoutes(app, {
      discussionRepository: mockRepo(),
      ttsClient: { renderTurn: vi.fn() },
      ttsStorage: { save: vi.fn() }
    });
    const res = await app.inject({ method: 'GET', url: '/api/discussions/capabilities' });
    expect(res.statusCode).toBe(200);
    // Legacy single-client wiring: TTS works but no named providers are advertised.
    expect(JSON.parse(res.body)).toEqual({ tts: true, ttsProviders: [] });
  });

  it('POST /api/discussions/:id/runs returns 422 when a participant resolves no reports', async () => {
    const discWithParticipant = {
      ...discRow,
      participants: [{ id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0, reportIds: [] }]
    };
    const reportRepository = {
      listReportsForAgent: vi.fn().mockResolvedValue([]),
      getReportById: vi.fn().mockResolvedValue(null)
    };
    const app = await buildApp({ getDiscussion: vi.fn().mockResolvedValue(discWithParticipant) }, { reportRepository });
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('no_report_resolved');
  });

  it('POST /api/discussions/:id/runs returns 202 when every participant resolves at least one report', async () => {
    const discWithParticipant = {
      ...discRow,
      participants: [{ id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0, reportIds: [] }]
    };
    const reportRepository = {
      listReportsForAgent: vi.fn().mockResolvedValue([{ id: 'r1', agentId: 'a1', agentRunId: 'run1', createdAt: new Date() }]),
      getReportById: vi.fn().mockResolvedValue(null)
    };
    const app = await buildApp({ getDiscussion: vi.fn().mockResolvedValue(discWithParticipant) }, { reportRepository });
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(202);
  });

  it('POST /api/discussions/:id/runs skips report validation for free-grounded discussions', async () => {
    const freeDisc = {
      ...discRow,
      formatConfig: { grounding: { mode: 'free' } },
      participants: [{ id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0, reportIds: [] }]
    };
    const reportRepository = {
      listReportsForAgent: vi.fn().mockResolvedValue([]),
      getReportById: vi.fn().mockResolvedValue(null)
    };
    const app = await buildApp({ getDiscussion: vi.fn().mockResolvedValue(freeDisc) }, { reportRepository });
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(202);
    expect(reportRepository.listReportsForAgent).not.toHaveBeenCalled();
  });

  it('GET /api/discussions/transcript-options returns parsed options and skips empty artifacts', async () => {
    const artifactRepository = {
      listRecentEvidenceArtifacts: vi.fn().mockResolvedValue([
        {
          id: 'art1', agentId: 'a1', sourceRef: 'https://example.com/ep1',
          payloadJson: JSON.stringify({ content: 'Full episode transcript text', title: 'Episode 1', itemId: 'item1' }),
          createdAt: new Date()
        },
        { id: 'art2', agentId: 'a1', sourceRef: 'https://example.com/ep2', payloadJson: '{}', createdAt: new Date() }
      ])
    };
    const app = await buildApp({}, { artifactRepository });
    const res = await app.inject({ method: 'GET', url: '/api/discussions/transcript-options' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ artifactId: 'art1', title: 'Episode 1', preview: 'Full episode transcript text' });
    expect(artifactRepository.listRecentEvidenceArtifacts).toHaveBeenCalledWith('u1', 50);
  });

  it('GET /api/discussions/transcript-options returns empty list when repo not wired', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/discussions/transcript-options' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('POST /api/discussions returns 400 for a material-grounded discussion with an empty pool', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/discussions',
      payload: {
        name: 'Test', format: 'free_form',
        formatConfig: { grounding: { mode: 'material', reportIds: [], artifactIds: [] } },
        participants: [
          { agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 },
          { agentId: 'a2', role: 'speaker', voiceId: 'echo', speakerOrder: 1 }
        ]
      }
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/discussions returns 201 for a material-grounded discussion with any agent\'s report in the pool', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST', url: '/api/discussions',
      payload: {
        name: 'Test', format: 'free_form',
        formatConfig: { grounding: { mode: 'material', reportIds: ['report-from-any-agent'] } },
        participants: [
          { agentId: 'a1', role: 'speaker', voiceId: 'alloy', speakerOrder: 0 },
          { agentId: 'a2', role: 'speaker', voiceId: 'echo', speakerOrder: 1 }
        ]
      }
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/discussions/:id/runs returns 422 for a material-grounded discussion whose pool is empty', async () => {
    const materialDisc = {
      ...discRow,
      formatConfig: { grounding: { mode: 'material', reportIds: [], artifactIds: [] } },
      participants: [{ id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0, reportIds: [] }]
    };
    const reportRepository = {
      listReportsForAgent: vi.fn().mockResolvedValue([]),
      getReportById: vi.fn().mockResolvedValue(null)
    };
    const app = await buildApp({ getDiscussion: vi.fn().mockResolvedValue(materialDisc) }, { reportRepository });
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).code).toBe('no_material_selected');
    // Material mode never consults per-participant report resolution.
    expect(reportRepository.listReportsForAgent).not.toHaveBeenCalled();
  });

  it('POST /api/discussions/:id/runs returns 202 for a material-grounded discussion with a non-empty pool', async () => {
    const materialDisc = {
      ...discRow,
      formatConfig: { grounding: { mode: 'material', artifactIds: ['art1'] } },
      participants: [{ id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0, reportIds: [] }]
    };
    const app = await buildApp({ getDiscussion: vi.fn().mockResolvedValue(materialDisc) });
    const res = await app.inject({ method: 'POST', url: '/api/discussions/d1/runs', payload: {} });
    expect(res.statusCode).toBe(202);
  });
});
