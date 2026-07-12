import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAgentRoutes, type AgentRepositoryLike, type SourceProbeLike, type RunTriggerLike } from './modules/agents/routes';
import { registerAgentPromptRoutes, type AgentPromptRoutesDeps } from './modules/agent-prompts/routes';
import { registerRunsRoutes, type RunsRoutesDeps } from './modules/runs/routes';
import { registerAuthRoutes, type AuthRoutesDeps } from './modules/auth/routes';
import { registerAdminRoutes } from './modules/admin/routes';
import { config } from './config';
import { verifySessionToken } from './modules/auth/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

export interface ServerDeps {
  agentRepository: AgentRepositoryLike;
  agents: AgentPromptRoutesDeps;
  runs?: RunsRoutesDeps;
  auth: AuthRoutesDeps;
  sourceProbe?: SourceProbeLike;
  runTrigger?: RunTriggerLike;
}

const PUBLIC_ROUTE_PREFIXES = ['/api/auth/'];

export async function buildServer(deps: ServerDeps) {
  // Fastify's request logger is disabled in tests to avoid drowning test output in log lines;
  // it's on by default otherwise since there was previously no way to see request activity from
  // the running API at all (only ad-hoc console.log/warn calls in a few modules).
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cookie);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (PUBLIC_ROUTE_PREFIXES.some((prefix) => req.url.startsWith(prefix))) return;

    const token = req.cookies[config.auth.cookieName];
    const payload = token ? verifySessionToken(token) : null;
    if (!payload) {
      reply.status(401).send({ code: 'unauthenticated', message: 'Sign in required' });
      return;
    }
    req.userId = payload.userId;
  });

  await registerAuthRoutes(app, deps.auth);
  await registerAgentRoutes(app, deps.agentRepository, {
    sourceProbe: deps.sourceProbe,
    mailer: deps.auth.mailer,
    runTrigger: deps.runTrigger
  });
  await registerAgentPromptRoutes(app, deps.agents);
  if (deps.runs) {
    await registerRunsRoutes(app, deps.runs);
  }
  // Admin user-management routes reuse the same userRepository as auth - there's no separate
  // "admin service", just extra ADMIN_EMAIL-gated endpoints on top of the existing user store.
  await registerAdminRoutes(app, { userRepository: deps.auth.userRepository });
  return app;
}
