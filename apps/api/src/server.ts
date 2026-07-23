import type { PrismaClient } from '@prisma/client';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAgentRoutes, type AgentRepositoryLike, type SourceProbeLike, type RunTriggerLike } from './modules/agents/routes';
import { registerAgentPromptRoutes, type AgentPromptRoutesDeps } from './modules/agent-prompts/routes';
import { registerRunsRoutes, type RunsRoutesDeps } from './modules/runs/routes';
import { registerAuthRoutes, type AuthRoutesDeps } from './modules/auth/routes';
import { registerAdminRoutes } from './modules/admin/routes';
import { registerSourceRoutes, type SourceRoutesDeps } from './modules/source/routes';
import { registerPlaybookRoutes, type PlaybookRoutesDeps } from './modules/playbook/routes';
import { registerDiscussionRoutes, type DiscussionRoutesDeps } from './modules/discussion/routes';
import { registerWatchlistRoutes, type WatchlistRoutesDeps } from './modules/watchlist/routes';
import { registerUsageRoutes, type UsageRoutesDeps } from './modules/usage/routes';
import { registerRealtimeRoutes, type RealtimeEventRepository } from './modules/realtime/routes';
import { registerAgentCurationRoutes, type AgentCurationFeatureDeps, type AgentCurationRoutesDeps } from './modules/agent-curation/routes';
import type { DomainAccessResolver } from './modules/access/permissions';
import { config } from './config';
import { verifySessionToken } from './modules/auth/jwt';
import { logger } from './lib/logger';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRole?: 'user' | 'admin';
  }
}

export interface ServerDeps {
  agentRepository: AgentRepositoryLike;
  agents: AgentPromptRoutesDeps;
  runs?: RunsRoutesDeps;
  auth: AuthRoutesDeps;
  source?: SourceRoutesDeps;
  playbook?: PlaybookRoutesDeps;
  watchlist?: WatchlistRoutesDeps;
  usage?: UsageRoutesDeps;
  discussion?: DiscussionRoutesDeps;
  realtime?: { repository: RealtimeEventRepository };
  agentCuration?: AgentCurationFeatureDeps;
  accessResolver?: DomainAccessResolver;
  sourceProbe?: SourceProbeLike;
  runTrigger?: RunTriggerLike;
  db?: PrismaClient;
}

const PUBLIC_ROUTE_PREFIXES = ['/api/auth/'];

export async function buildServer(deps: ServerDeps) {
  // Fastify's request logger is disabled in tests to avoid drowning test output in log lines;
  // it's on by default otherwise since there was previously no way to see request activity from
  // the running API at all (only ad-hoc console.log/warn calls in a few modules).
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cookie);

  app.setErrorHandler((error, _req, reply) => {
    logger.error(`[server] Unhandled route error: ${error.message}`, error);
    if (!reply.sent) {
      reply.status(error.statusCode ?? 500).send({ code: 'internal_error', message: 'Internal server error' });
    }
  });

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (PUBLIC_ROUTE_PREFIXES.some((prefix) => req.url.startsWith(prefix))) return;

    const token = req.cookies[config.auth.cookieName];
    const payload = token ? verifySessionToken(token) : null;
    if (!payload) {
      reply.status(401).send({ code: 'unauthenticated', message: 'Sign in required' });
      return;
    }
    const user = await deps.auth.userRepository.findById(payload.userId);
    if (!user) {
      req.userId = payload.userId;
      req.userRole = 'user';
      return;
    }
    req.userId = user.id;
    req.userRole = user.role;
  });

  await registerAuthRoutes(app, deps.auth);
  await registerAgentRoutes(app, deps.agentRepository, {
    sourceProbe: deps.sourceProbe,
    mailer: deps.auth.mailer,
    runTrigger: deps.runTrigger,
    accessResolver: deps.accessResolver
  });
  await registerAgentPromptRoutes(app, {
    ...deps.agents,
    runsRepository: deps.runs?.runsRepository,
    accessResolver: deps.agents.accessResolver ?? deps.accessResolver
  });
  if (deps.agentCuration) {
    await registerAgentCurationRoutes(app, {
      ...deps.agentCuration,
      agentRepository: deps.agentRepository as unknown as AgentCurationRoutesDeps['agentRepository'],
      promptRepository: deps.agents.promptRepository as unknown as AgentCurationRoutesDeps['promptRepository'],
      accessResolver: deps.agentCuration.accessResolver ?? deps.accessResolver
    });
  }
  if (deps.runs) {
    await registerRunsRoutes(app, { ...deps.runs, accessResolver: deps.runs.accessResolver ?? deps.accessResolver });
  }
  if (deps.source) {
    await registerSourceRoutes(app, deps.source);
  }
  if (deps.playbook) {
    await registerPlaybookRoutes(app, deps.playbook);
  }
  if (deps.watchlist) {
    await registerWatchlistRoutes(app, deps.watchlist);
  }
  if (deps.usage) {
    await registerUsageRoutes(app, deps.usage);
  }
  if (deps.discussion) {
    await registerDiscussionRoutes(app, deps.discussion);
  }
  if (deps.realtime) {
    await registerRealtimeRoutes(app, deps.realtime);
  }
  // Admin user-management routes reuse the same userRepository as auth - there's no separate
  // "admin service", just extra ADMIN_EMAIL-gated endpoints on top of the existing user store.
  await registerAdminRoutes(app, { userRepository: deps.auth.userRepository, db: deps.db });
  return app;
}
