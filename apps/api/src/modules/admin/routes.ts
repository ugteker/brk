import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { UserRepositoryLike } from '../auth/repository';
import type { AuthUser, UserRecord } from '../auth/types';
import { toAuthUser } from '../auth/types';

export interface AdminAgentRepositoryLike {
  disableAgent(agentId: string): Promise<void>;
  enableAgent(agentId: string): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
}

export interface AdminRoutesDeps {
  userRepository: UserRepositoryLike;
  db?: Pick<PrismaClient, 'agent' | 'agentPromptVersion' | 'agentRun' | 'agentRunReport' | 'agentSignal' | 'source' | 'sourceItem' | 'playbook' | 'discussion' | 'discussionRun' | 'discussionParticipant' | '$transaction'>;
  agentRepository?: AdminAgentRepositoryLike;
}

export interface AdminUserView extends AuthUser {
  locked: boolean;
}

function toAdminUserView(user: UserRecord): AdminUserView {
  return { ...toAuthUser(user), locked: user.locked };
}

/**
 * Registers admin-only user management routes (list/lock/unlock/delete). Access is restricted to
 * users; access is granted to accounts with the persisted admin role.
 */
export async function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps) {
  const { userRepository, db, agentRepository } = deps;

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/admin/')) return;

    if (!req.userId) {
      return reply.status(401).send({ code: 'unauthenticated', message: 'Sign in required' });
    }
    if (req.userRole !== 'admin') {
      return reply.status(403).send({ code: 'forbidden', message: 'Admin access required' });
    }
  });

  app.get('/api/admin/users', async () => {
    const users = await userRepository.listUsers();
    return users.map(toAdminUserView);
  });

  app.post('/api/admin/users/:userId/lock', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (userId === req.userId) {
      return reply.status(400).send({ code: 'cannot_lock_self', message: 'You cannot lock your own account' });
    }
    try {
      const user = await userRepository.setLocked(userId, true);
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.post('/api/admin/users/:userId/unlock', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    try {
      const user = await userRepository.setLocked(userId, false);
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.post('/api/admin/users/:userId/promote', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    try {
      const user = await userRepository.setRole(userId, 'admin');
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.post('/api/admin/users/:userId/demote', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (userId === req.userId) {
      return reply.status(400).send({ code: 'cannot_demote_self', message: 'You cannot demote your own account' });
    }
    try {
      const user = await userRepository.setRole(userId, 'user');
      return reply.status(200).send(toAdminUserView(user));
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.delete('/api/admin/users/:userId', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (userId === req.userId) {
      return reply.status(400).send({ code: 'cannot_delete_self', message: 'You cannot delete your own account' });
    }
    try {
      await userRepository.deleteUser(userId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'User not found' });
    }
  });

  app.get('/api/admin/agents/overview', async (_req, reply) => {
    if (!db) {
      return reply.status(503).send({ code: 'unavailable', message: 'Agent overview not available in this environment' });
    }

    const now = Date.now();
    const since30d = new Date(now - 30 * 86_400_000);
    const since24h = new Date(now - 86_400_000);

    const [agents, playbooks, runs30d, lastRuns, reportTotals, reports30d, needsReview, discussionParticipants, users] = await Promise.all([
      (db as any).agent.findMany({
        select: { id: true, name: true, characterType: true, status: true, ownerUserId: true, createdAt: true }
      }),
      (db as any).playbook.findMany({ select: { agentId: true, sourceId: true } }),
      (db as any).agentRun.findMany({
        where: { createdAt: { gte: since30d } },
        select: { agentId: true, status: true, createdAt: true, startedAt: true, finishedAt: true },
        orderBy: { createdAt: 'desc' }
      }),
      (db as any).agentRun.findMany({
        distinct: ['agentId'],
        orderBy: { createdAt: 'desc' },
        select: { agentId: true, status: true, createdAt: true }
      }),
      (db as any).agentRunReport.groupBy({ by: ['agentId'], _count: { _all: true } }),
      (db as any).agentRunReport.groupBy({
        by: ['agentId'],
        where: { createdAt: { gte: since30d } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true }
      }),
      (db as any).agentRunReport.groupBy({
        by: ['agentId'],
        where: { needsHumanReview: true },
        _count: { _all: true }
      }),
      (db as any).discussionParticipant.findMany({
        where: { active: true },
        select: { agentId: true, discussionId: true }
      }),
      userRepository.listUsers()
    ]);

    const emailByUserId = new Map<string, string>(users.map((u: UserRecord) => [u.id, u.email]));
    const lastRunByAgent = new Map<string, { status: string; createdAt: Date }>(
      lastRuns.map((r: any) => [r.agentId, r])
    );
    const reportTotalByAgent = new Map<string, number>(reportTotals.map((r: any) => [r.agentId, r._count._all]));
    const reports30dByAgent = new Map<string, any>(reports30d.map((r: any) => [r.agentId, r]));
    const needsReviewByAgent = new Map<string, number>(needsReview.map((r: any) => [r.agentId, r._count._all]));

    const discussionsByAgent = new Map<string, Set<string>>();
    for (const dp of discussionParticipants) {
      if (!discussionsByAgent.has(dp.agentId)) discussionsByAgent.set(dp.agentId, new Set());
      discussionsByAgent.get(dp.agentId)!.add(dp.discussionId);
    }

    const playbookCountByAgent = new Map<string, number>();
    const sourcesByAgent = new Map<string, Set<string>>();
    for (const pb of playbooks) {
      playbookCountByAgent.set(pb.agentId, (playbookCountByAgent.get(pb.agentId) ?? 0) + 1);
      if (!sourcesByAgent.has(pb.agentId)) sourcesByAgent.set(pb.agentId, new Set());
      if (pb.sourceId) sourcesByAgent.get(pb.agentId)!.add(pb.sourceId);
    }

    const runs30dByAgent = new Map<string, any[]>();
    for (const run of runs30d) {
      if (!runs30dByAgent.has(run.agentId)) runs30dByAgent.set(run.agentId, []);
      runs30dByAgent.get(run.agentId)!.push(run);
    }

    const agentRows = agents.map((agent: any) => {
      const runs = runs30dByAgent.get(agent.id) ?? [];
      const completed = runs.filter((r) => r.status === 'completed').length;
      const failed = runs.filter((r) => r.status === 'failed').length;
      const report30 = reports30dByAgent.get(agent.id);
      const last = lastRunByAgent.get(agent.id);
      return {
        id: agent.id,
        name: agent.name,
        characterType: agent.characterType,
        status: agent.status,
        ownerEmail: emailByUserId.get(agent.ownerUserId) ?? agent.ownerUserId,
        createdAt: agent.createdAt,
        playbookCount: playbookCountByAgent.get(agent.id) ?? 0,
        sourceCount: sourcesByAgent.get(agent.id)?.size ?? 0,
        discussionCount: discussionsByAgent.get(agent.id)?.size ?? 0,
        runs30d: runs.length,
        completed30d: completed,
        failed30d: failed,
        recentRunStatuses: runs.slice(0, 10).map((r) => r.status),
        lastRunAt: last?.createdAt ?? null,
        lastRunStatus: last?.status ?? null,
        reportsTotal: reportTotalByAgent.get(agent.id) ?? 0,
        reports30d: report30?._count._all ?? 0,
        inputTokens30d: report30?._sum.inputTokens ?? 0,
        outputTokens30d: report30?._sum.outputTokens ?? 0,
        costUsd30d: report30?._sum.estimatedCostUsd ?? 0,
        needsReviewCount: needsReviewByAgent.get(agent.id) ?? 0
      };
    });

    const totalCompleted = runs30d.filter((r: any) => r.status === 'completed').length;
    const totalFailed = runs30d.filter((r: any) => r.status === 'failed').length;
    const finished = totalCompleted + totalFailed;
    const durations = runs30d
      .filter((r: any) => r.startedAt && r.finishedAt)
      .map((r: any) => new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime());

    return {
      totals: {
        agents: agents.length,
        activeAgents: agents.filter((a: any) => a.status === 'active').length,
        runs30d: runs30d.length,
        successRate30d: finished > 0 ? totalCompleted / finished : null,
        failed24h: runs30d.filter((r: any) => r.status === 'failed' && new Date(r.createdAt) >= since24h).length,
        reports30d: agentRows.reduce((sum: number, a: any) => sum + a.reports30d, 0),
        inputTokens30d: agentRows.reduce((sum: number, a: any) => sum + a.inputTokens30d, 0),
        outputTokens30d: agentRows.reduce((sum: number, a: any) => sum + a.outputTokens30d, 0),
        costUsd30d: agentRows.reduce((sum: number, a: any) => sum + a.costUsd30d, 0),
        needsReviewCount: agentRows.reduce((sum: number, a: any) => sum + a.needsReviewCount, 0),
        avgRunMs30d: durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : null
      },
      agents: agentRows
    };
  });

  app.get('/api/admin/reports/overview', async (_req, reply) => {
    if (!db) {
      return reply.status(503).send({ code: 'unavailable', message: 'Reports overview not available in this environment' });
    }

    const since30d = new Date(Date.now() - 30 * 86_400_000);

    const [agents, reports30d, latestReports, needsReviewTotal, users] = await Promise.all([
      (db as any).agent.findMany({ select: { id: true, name: true, ownerUserId: true } }),
      (db as any).agentRunReport.findMany({
        where: { createdAt: { gte: since30d } },
        select: { readAt: true, needsHumanReview: true, inputTokens: true, outputTokens: true, estimatedCostUsd: true }
      }),
      (db as any).agentRunReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          agentId: true,
          summary: true,
          model: true,
          needsHumanReview: true,
          readAt: true,
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsd: true,
          createdAt: true
        }
      }),
      (db as any).agentRunReport.count({ where: { needsHumanReview: true } }),
      userRepository.listUsers()
    ]);

    const emailByUserId = new Map<string, string>(users.map((u: UserRecord) => [u.id, u.email]));
    const agentById = new Map<string, any>(agents.map((a: any) => [a.id, a]));

    const inputTokens30d = reports30d.reduce((sum: number, r: any) => sum + (r.inputTokens ?? 0), 0);
    const outputTokens30d = reports30d.reduce((sum: number, r: any) => sum + (r.outputTokens ?? 0), 0);
    const unread30d = reports30d.filter((r: any) => !r.readAt).length;

    return {
      totals: {
        reports30d: reports30d.length,
        unread30d,
        unreadRate30d: reports30d.length > 0 ? unread30d / reports30d.length : null,
        needsReviewTotal,
        inputTokens30d,
        outputTokens30d,
        costUsd30d: reports30d.reduce((sum: number, r: any) => sum + (r.estimatedCostUsd ?? 0), 0),
        avgTokensPerReport30d:
          reports30d.length > 0 ? Math.round((inputTokens30d + outputTokens30d) / reports30d.length) : null
      },
      reports: latestReports.map((r: any) => {
        const agent = agentById.get(r.agentId);
        return {
          id: r.id,
          agentName: agent?.name ?? r.agentId,
          ownerEmail: agent ? emailByUserId.get(agent.ownerUserId) ?? agent.ownerUserId : '',
          summary: r.summary,
          model: r.model,
          needsHumanReview: r.needsHumanReview,
          read: r.readAt != null,
          tokens: (r.inputTokens ?? 0) + (r.outputTokens ?? 0),
          costUsd: r.estimatedCostUsd ?? 0,
          createdAt: r.createdAt
        };
      })
    };
  });

  app.get('/api/admin/sources/overview', async (_req, reply) => {
    if (!db) {
      return reply.status(503).send({ code: 'unavailable', message: 'Sources overview not available in this environment' });
    }

    const since30d = new Date(Date.now() - 30 * 86_400_000);
    const staleCutoff = new Date(Date.now() - 14 * 86_400_000);

    const [sources, items30d, lastItems, playbooks, users] = await Promise.all([
      (db as any).source.findMany({
        select: { id: true, type: true, value: true, status: true, ownerUserId: true, createdAt: true }
      }),
      (db as any).sourceItem.groupBy({
        by: ['sourceId'],
        where: { createdAt: { gte: since30d } },
        _count: { _all: true }
      }),
      (db as any).sourceItem.findMany({
        distinct: ['sourceId'],
        orderBy: { createdAt: 'desc' },
        select: { sourceId: true, createdAt: true }
      }),
      (db as any).playbook.findMany({ select: { sourceId: true, agentId: true } }),
      userRepository.listUsers()
    ]);

    const emailByUserId = new Map<string, string>(users.map((u: UserRecord) => [u.id, u.email]));
    const items30dBySource = new Map<string, number>(items30d.map((i: any) => [i.sourceId, i._count._all]));
    const lastItemBySource = new Map<string, Date>(lastItems.map((i: any) => [i.sourceId, i.createdAt]));

    const agentsBySource = new Map<string, Set<string>>();
    for (const pb of playbooks) {
      if (!pb.sourceId) continue;
      if (!agentsBySource.has(pb.sourceId)) agentsBySource.set(pb.sourceId, new Set());
      agentsBySource.get(pb.sourceId)!.add(pb.agentId);
    }

    const sourceRows = sources.map((s: any) => {
      const lastItemAt = lastItemBySource.get(s.id) ?? null;
      return {
        id: s.id,
        type: s.type,
        value: s.value,
        status: s.status,
        ownerEmail: emailByUserId.get(s.ownerUserId) ?? s.ownerUserId,
        createdAt: s.createdAt,
        agentCount: agentsBySource.get(s.id)?.size ?? 0,
        items30d: items30dBySource.get(s.id) ?? 0,
        lastItemAt,
        stale: lastItemAt == null || new Date(lastItemAt) < staleCutoff
      };
    });

    const byType: Record<string, number> = {};
    for (const s of sources) {
      byType[s.type] = (byType[s.type] ?? 0) + 1;
    }

    return {
      totals: {
        sources: sources.length,
        activeSources: sources.filter((s: any) => s.status === 'active').length,
        byType,
        items30d: items30d.reduce((sum: number, i: any) => sum + i._count._all, 0),
        staleSources: sourceRows.filter((s: any) => s.stale).length,
        unfollowedSources: sourceRows.filter((s: any) => s.agentCount === 0).length
      },
      sources: sourceRows
    };
  });

  app.get('/api/admin/discussions/overview', async (_req, reply) => {
    if (!db) {
      return reply.status(503).send({ code: 'unavailable', message: 'Discussions overview not available in this environment' });
    }

    const since30d = new Date(Date.now() - 30 * 86_400_000);

    const [discussions, runs, users] = await Promise.all([
      (db as any).discussion.findMany({
        select: {
          id: true,
          name: true,
          format: true,
          ownerUserId: true,
          createdAt: true,
          participants: { select: { id: true }, where: { active: true } }
        }
      }),
      (db as any).discussionRun.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          discussionId: true,
          status: true,
          createdAt: true,
          audioUrl: true,
          _count: { select: { turns: true } }
        }
      }),
      userRepository.listUsers()
    ]);

    const emailByUserId = new Map<string, string>(users.map((u: UserRecord) => [u.id, u.email]));

    const runsByDiscussion = new Map<string, any[]>();
    for (const run of runs) {
      if (!runsByDiscussion.has(run.discussionId)) runsByDiscussion.set(run.discussionId, []);
      runsByDiscussion.get(run.discussionId)!.push(run);
    }

    const discussionRows = discussions.map((d: any) => {
      const dRuns = runsByDiscussion.get(d.id) ?? [];
      const last = dRuns[0] ?? null;
      return {
        id: d.id,
        name: d.name,
        format: d.format,
        ownerEmail: emailByUserId.get(d.ownerUserId) ?? d.ownerUserId,
        createdAt: d.createdAt,
        participantCount: d.participants.length,
        runsTotal: dRuns.length,
        failedRuns: dRuns.filter((r: any) => r.status === 'failed').length,
        turnsTotal: dRuns.reduce((sum: number, r: any) => sum + r._count.turns, 0),
        audioRuns: dRuns.filter((r: any) => r.audioUrl != null).length,
        lastRunAt: last?.createdAt ?? null,
        lastRunStatus: last?.status ?? null
      };
    });

    const runs30d = runs.filter((r: any) => new Date(r.createdAt) >= since30d);

    return {
      totals: {
        discussions: discussions.length,
        runs30d: runs30d.length,
        failedRuns30d: runs30d.filter((r: any) => r.status === 'failed').length,
        turns30d: runs30d.reduce((sum: number, r: any) => sum + r._count.turns, 0),
        audioRuns30d: runs30d.filter((r: any) => r.audioUrl != null).length
      },
      discussions: discussionRows
    };
  });

  app.post('/api/admin/agents/:agentId/pause', async (req, reply) => {
    if (!agentRepository) {
      return reply.status(503).send({ code: 'unavailable', message: 'Agent management not available in this environment' });
    }
    const { agentId } = req.params as { agentId: string };
    try {
      await agentRepository.disableAgent(agentId);
      return { ok: true };
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.post('/api/admin/agents/:agentId/resume', async (req, reply) => {
    if (!agentRepository) {
      return reply.status(503).send({ code: 'unavailable', message: 'Agent management not available in this environment' });
    }
    const { agentId } = req.params as { agentId: string };
    try {
      await agentRepository.enableAgent(agentId);
      return { ok: true };
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.delete('/api/admin/agents/:agentId', async (req, reply) => {
    if (!agentRepository) {
      return reply.status(503).send({ code: 'unavailable', message: 'Agent management not available in this environment' });
    }
    const { agentId } = req.params as { agentId: string };
    try {
      await agentRepository.deleteAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.post('/api/admin/seed-demo', async (req, reply) => {
    if (!db) {
      return reply.status(503).send({ code: 'unavailable', message: 'Demo seed not available in this environment' });
    }
    const userId = req.userId!;

    const DEMO_SOURCE_VALUE = 'https://feeds.megaphone.fm/WWO4571423572';
    const DEMO_MARKER = 'chattrader-demo-seed-v1';

    // Check if demo data already exists for this user
    const existing = await (db as any).source.findFirst({
      where: { ownerUserId: userId, value: DEMO_SOURCE_VALUE }
    });
    if (existing) {
      return reply.status(409).send({ code: 'already_exists', message: 'Demo data already seeded for this account' });
    }

    const now = new Date();

    await (db as any).$transaction(async (tx: any) => {
      // 1. Create source
      const source = await tx.source.create({
        data: {
          ownerUserId: userId,
          type: 'podcast_feeds',
          value: DEMO_SOURCE_VALUE,
          status: 'active',
          configJson: JSON.stringify({
            libraryCard: {
              title: '📻 We Study Billionaires — Demo',
              coverImageUrl: 'https://megaphone.imgix.net/podcasts/effd9620-ae5c-11ea-a77b-23ef82a3ef03/image/uploads_2F1655841820823-lvbq5szex6-6f8736a35b3a88e3a0e5a4da9e8e27d6_2FWSBCoverArt-Final.jpg',
              itemCount: 600,
              previewItems: [
                { title: 'TIP700: Warren Buffett\'s 2024 Shareholder Letter', link: DEMO_SOURCE_VALUE, pubDate: '2025-02-28' },
                { title: 'TIP699: Berkshire Hathaway Deep Dive', link: DEMO_SOURCE_VALUE, pubDate: '2025-02-21' }
              ]
            },
            [DEMO_MARKER]: true
          })
        }
      });

      // 2. Create agent
      const agent = await tx.agent.create({
        data: {
          ownerUserId: userId,
          name: '📊 Demo Analyst — Balanced',
          description: 'Sample AI analyst (finance expert, balanced). Created by seed.',
          characterType: 'finance_expert',
          promptConfigJson: JSON.stringify({ riskLevel: 'medium', reportDetailLevel: 'standard', character: 'balanced-analyst' }),
          status: 'active',
          preferencesJson: '{}'
        }
      });

      // 3. Create prompt version
      const promptVersion = await tx.agentPromptVersion.create({
        data: {
          agentId: agent.id,
          version: 1,
          model: 'claude-sonnet-4-5',
          systemPrompt: 'You are a balanced equity analyst. Identify long/short signals from financial content with clear rationale and source citations.',
          enabled: true
        }
      });

      // 4. Create playbook
      const playbook = await tx.playbook.create({
        data: {
          agentId: agent.id,
          sourceId: source.id,
          name: '📅 Demo Playbook — Weekly',
          description: 'Sample weekly playbook (created by seed).',
          mode: 'daily',
          dailyTime: '08:00',
          timezone: 'UTC',
          nextRunAt: new Date(now.getTime() + 86400000),
          enabled: true,
          notificationsEnabled: false,
          recipientsJson: '[]',
          language: 'en'
        }
      });

      // 5. Create completed run
      const run = await tx.agentRun.create({
        data: {
          agentId: agent.id,
          sourceId: source.id,
          playbookId: playbook.id,
          scheduledFor: new Date(now.getTime() - 86400000),
          status: 'completed',
          phase: 'done',
          startedAt: new Date(now.getTime() - 86400000),
          finishedAt: new Date(now.getTime() - 86400000 + 45000)
        }
      });

      // 6. Create sample report with signals
      const reportJson = {
        common: {
          summary: '🎙️ This week\'s "We Study Billionaires" covers Berkshire\'s annual letter, Buffett\'s Apple/BofA position updates, and macro themes around energy and consumer staples. Multiple high-conviction long signals emerge.',
          key_takeaways: [
            'Buffett trimmed Apple but maintains ~$150B position — still bullish long-term',
            'Energy and consumer staples named as inflation hedges for 2025',
            'BofA position held intact despite rate cycle uncertainty'
          ],
          sources_used: ['We Study Billionaires Podcast — Ep. TIP700'],
          citations: ['00:12:34 — Apple position commentary', '00:28:10 — BofA rationale', '00:41:55 — Energy sector call']
        },
        section: {
          character_type: 'finance_expert',
          market_summary: 'Macro tailwinds favor value and energy. Buffett\'s letter signals continued confidence in US equities despite trimming high-conviction names. Watch consumer staples as defensive play.',
          signals: [
            { symbol: 'BRK.B', side: 'long', confidence: 92, rationale: 'Buffett buybacks continue; large cash pile ready for opportunistic deployment.', citations: ['00:08:20', '00:15:40'] },
            { symbol: 'AAPL', side: 'long', confidence: 78, rationale: 'Trim was tactical, not conviction-driven. Long-term ecosystem moat intact.', citations: ['00:12:34'] },
            { symbol: 'BAC', side: 'long', confidence: 71, rationale: 'BofA position held — signals continued confidence in US banking normalization.', citations: ['00:28:10'] },
            { symbol: 'XOM', side: 'long', confidence: 65, rationale: 'Energy named as inflation hedge for 2025 in Buffett\'s letter macro comments.', citations: ['00:41:55'] },
            { symbol: 'INTC', side: 'short', confidence: 58, rationale: 'No mention in letter; sector rotation away from legacy semis noted.', citations: ['00:50:10'] }
          ]
        }
      };

      await tx.agentRunReport.create({
        data: {
          agentId: agent.id,
          sourceId: source.id,
          agentRunId: run.id,
          promptVersionId: promptVersion.id,
          summary: '🎙️ This week\'s "We Study Billionaires" covers Berkshire\'s annual letter, Buffett\'s Apple/BofA position updates, and macro themes around energy and consumer staples.',
          reportJson: JSON.stringify(reportJson),
          needsHumanReview: false,
          sourceWarningsJson: '[]',
          model: 'claude-sonnet-4-5',
          promptVersionNumber: 1,
          inputTokens: 12400,
          outputTokens: 980,
          estimatedCostUsd: 0.052,
          signals: {
            create: reportJson.section.signals.map((s) => ({
              symbol: s.symbol,
              side: s.side,
              confidence: s.confidence,
              rationale: s.rationale,
              citationsJson: JSON.stringify(s.citations)
            }))
          }
        }
      });
    });

    return reply.status(201).send({ ok: true, message: 'Demo data seeded successfully' });
  });
}
