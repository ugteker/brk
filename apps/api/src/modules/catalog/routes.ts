import type { FastifyInstance } from 'fastify';
import type { CatalogRepositoryLike } from './repository';

export interface CatalogRoutesDeps {
  repository: CatalogRepositoryLike;
}

export async function registerCatalogRoutes(app: FastifyInstance, deps: CatalogRoutesDeps) {
  app.post('/api/catalog/agent-versions/:agentVersionId/use', async (req, reply) => {
    const { agentVersionId } = req.params as { agentVersionId: string };
    const input = req.body as { sourceId?: string };
    const sourceId = typeof input.sourceId === 'string' ? input.sourceId.trim() : '';
    if (sourceId.length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'sourceId is required' });
    }

    try {
      const result = await deps.repository.useAgentForSource({
        userId: req.userId!,
        sourceId,
        agentVersionId
      });
      return reply.status(result.created ? 201 : 200).send({
        playbook: result.playbook,
        created: result.created
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'source_not_in_library') {
        return reply.status(404).send({ code: 'source_not_in_library', message: 'Source not in library' });
      }
      if (error instanceof Error && error.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Agent version not found' });
      }
      throw error;
    }
  });

  app.get('/api/catalog/agent-matches', async (req, reply) => {
    const query = req.query as { sourceId?: string };
    const sourceId = typeof query.sourceId === 'string' ? query.sourceId.trim() : '';
    if (sourceId.length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'sourceId is required' });
    }

    try {
      const matches = await deps.repository.getAgentMatches({ userId: req.userId!, sourceId });
      return reply.status(200).send(matches);
    } catch (error) {
      if (error instanceof Error && error.message === 'source_not_in_library') {
        return reply.status(404).send({ code: 'source_not_in_library', message: 'Source not in library' });
      }
      throw error;
    }
  });

  app.get('/api/catalog', async (req, reply) => {
    const query = req.query as { locale?: string };
    const locale = typeof query.locale === 'string' && query.locale.trim().length > 0 ? query.locale.trim().toLowerCase() : 'en';
    const catalog = await deps.repository.getCatalog({ userId: req.userId!, locale });
    return reply.status(200).send(catalog);
  });

  app.post('/api/catalog/agent-versions/:agentVersionId/update', async (req, reply) => {
    const { agentVersionId } = req.params as { agentVersionId: string };
    const input = req.body as { fromAgentVersionId?: string; updateManualPlaybooks?: boolean };
    const fromAgentVersionId = typeof input.fromAgentVersionId === 'string' ? input.fromAgentVersionId.trim() : '';
    if (fromAgentVersionId.length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'fromAgentVersionId is required' });
    }

    try {
      const result = await deps.repository.updateSavedAgentVersion({
        userId: req.userId!,
        fromAgentVersionId,
        toAgentVersionId: agentVersionId,
        updateManualPlaybooks: input.updateManualPlaybooks === true
      });
      return reply.status(200).send(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid_update_target') {
        return reply.status(400).send({ code: 'invalid_update_target', message: 'Invalid update target' });
      }
      throw error;
    }
  });
}
