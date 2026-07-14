import type { FastifyInstance } from 'fastify';
import type { RunsRepository } from './repository';
import type { DomainAccessResolver } from '../access/permissions';

export interface RunsRoutesDeps {
  runsRepository: Pick<RunsRepository, 'listRunDetailsForAgent' | 'getArtifactContent'>;
  accessResolver?: Pick<DomainAccessResolver, 'resolve'>;
}

async function requireAgentAccess(
  deps: RunsRoutesDeps,
  request: { userId?: string; userRole?: 'user' | 'admin' },
  agentId: string
) {
  if (!deps.accessResolver) {
    return {
      ok: false as const,
      statusCode: 500,
      code: 'access_resolver_unavailable',
      message: 'Access resolver is not configured'
    };
  }

  const decision = await deps.accessResolver.resolve({
    actorUserId: request.userId!,
    actorRole: request.userRole ?? 'user',
    resourceType: 'agent',
    resourceId: agentId,
    action: 'read'
  });

  if (!decision.allowed) {
    return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Agent access denied' };
  }

  return { ok: true as const };
}

export async function registerRunsRoutes(app: FastifyInstance, deps: RunsRoutesDeps) {
  app.get('/api/agents/:agentId/runs', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(deps, req, agentId);
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }

    const runs = await deps.runsRepository.listRunDetailsForAgent(agentId);
    return reply.status(200).send(runs);
  });

  app.get('/api/agents/:agentId/runs/:runId/artifacts/:artifactId/download', async (req, reply) => {
    const { agentId, runId, artifactId } = req.params as { agentId: string; runId: string; artifactId: string };
    const access = await requireAgentAccess(deps, req, agentId);
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }

    const artifact = await deps.runsRepository.getArtifactContent(agentId, runId, artifactId);
    if (!artifact) {
      return reply.status(404).send({ code: 'not_found', message: 'Artifact not found' });
    }

    const filename = `${artifact.sourceRef.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80) || 'artifact'}.txt`;
    return reply
      .status(200)
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(artifact.content);
  });
}
