import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { UserRepositoryLike } from '../auth/repository';
import type { AuthUser, UserRecord } from '../auth/types';
import { toAuthUser } from '../auth/types';

export interface AdminRoutesDeps {
  userRepository: UserRepositoryLike;
  db?: Pick<PrismaClient, 'agent' | 'agentPromptVersion' | 'agentRun' | 'agentRunReport' | 'agentSignal' | 'source' | 'playbook' | 'playbookSource' | '$transaction'>;
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
  const { userRepository, db } = deps;

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
          name: '📅 Demo Playbook — Weekly',
          description: 'Sample weekly playbook (created by seed).',
          mode: 'daily',
          dailyTime: '08:00',
          timezone: 'UTC',
          nextRunAt: new Date(now.getTime() + 86400000),
          enabled: true,
          notificationsEnabled: false,
          recipientsJson: '[]',
          language: 'en',
          sources: {
            create: [{ sourceId: source.id, position: 0 }]
          }
        }
      });

      // 5. Create completed run
      const run = await tx.agentRun.create({
        data: {
          agentId: agent.id,
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
