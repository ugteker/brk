import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { registerAgentRoutes, type AgentRepositoryLike } from './modules/agents/routes';
import { registerAgentPromptRoutes, type AgentPromptRoutesDeps } from './modules/agent-prompts/routes';
import { registerAuthRoutes, type AuthRoutesDeps } from './modules/auth/routes';
import { config } from './config';
import { verifySessionToken } from './modules/auth/jwt';

export interface ServerDeps {
  agentRepository: AgentRepositoryLike;
  agents: AgentPromptRoutesDeps;
  auth: AuthRoutesDeps;
}

const PUBLIC_ROUTE_PREFIXES = ['/api/auth/'];

export async function buildServer(deps: ServerDeps) {
  const app = Fastify();
  await app.register(cookie);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (PUBLIC_ROUTE_PREFIXES.some((prefix) => req.url.startsWith(prefix))) return;

    const token = req.cookies[config.auth.cookieName];
    const payload = token ? verifySessionToken(token) : null;
    if (!payload) {
      reply.status(401).send({ code: 'unauthenticated', message: 'Sign in required' });
    }
  });

  await registerAuthRoutes(app, deps.auth);
  await registerAgentRoutes(app, deps.agentRepository);
  await registerAgentPromptRoutes(app, deps.agents);
  return app;
}
