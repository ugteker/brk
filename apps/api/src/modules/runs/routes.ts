import type { FastifyInstance } from 'fastify';
import type { RunsRepository } from './repository';

export interface RunsRoutesDeps {
  runsRepository: Pick<RunsRepository, 'listRunDetailsForAgent' | 'getArtifactContent'>;
}

export async function registerRunsRoutes(app: FastifyInstance, deps: RunsRoutesDeps) {
  app.get('/api/agents/:agentId/runs', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const runs = await deps.runsRepository.listRunDetailsForAgent(agentId);
    return reply.status(200).send(runs);
  });

  app.get('/api/agents/:agentId/runs/:runId/artifacts/:artifactId/download', async (req, reply) => {
    const { agentId, runId, artifactId } = req.params as { agentId: string; runId: string; artifactId: string };
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
