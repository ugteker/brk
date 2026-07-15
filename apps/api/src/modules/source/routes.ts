import type { FastifyInstance } from 'fastify';
import type { SourceConfig } from '../analysis/types';
import type { SourceProbeResult } from '../analysis/source-adapters/smart-crawler';
import type { DomainAccessResolver } from '../access/permissions';
import type { SourceRepositoryLike } from './repository';
import type { CreateSourceInput, PublishSourceInput, ShareSourceInput, UpdateSourceInput } from './types';

export interface SourceProbeLike {
  probeSource(source: SourceConfig, previewLimit?: number): Promise<SourceProbeResult>;
}

export interface SourceRoutesDeps {
  sourceRepository: SourceRepositoryLike;
  accessResolver: DomainAccessResolver;
  sourceProbe?: SourceProbeLike;
}

function isSupportedSourceType(value: unknown): value is SourceConfig['type'] {
  return value === 'web_urls' || value === 'podcast_feeds' || value === 'youtube_videos';
}

async function requireSourceAccess(
  deps: SourceRoutesDeps,
  request: { userId?: string; userRole?: 'user' | 'admin' },
  sourceId: string,
  action: 'read' | 'update' | 'delete'
) {
  const source = await deps.sourceRepository.getSource(sourceId);
  if (!source) {
    return { ok: false as const, statusCode: 404, code: 'not_found', message: 'Source not found' };
  }

  const decision = await deps.accessResolver.resolve({
    actorUserId: request.userId!,
    actorRole: request.userRole ?? 'user',
    resourceType: 'source',
    resourceId: sourceId,
    action
  });

  if (!decision.allowed) {
    return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Source access denied' };
  }

  return { ok: true as const, source, reason: decision.reason };
}

export async function registerSourceRoutes(app: FastifyInstance, deps: SourceRoutesDeps) {
  app.post('/api/sources', async (req, reply) => {
    const input = req.body as Partial<CreateSourceInput>;
    if (!isSupportedSourceType(input.type) || typeof input.value !== 'string' || input.value.trim().length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'A source type and non-empty value are required' });
    }
    const created = await deps.sourceRepository.createSource(req.userId!, {
      type: input.type,
      value: input.value,
      status: input.status,
      config: input.config,
      metadata: input.metadata
    });
    return reply.status(201).send(created);
  });

  app.get('/api/sources', async (req, reply) => {
    const rows = await deps.sourceRepository.listSources(req.userRole === 'admin' ? undefined : req.userId!);
    return reply.status(200).send(rows);
  });

  app.get('/api/sources/:sourceId', async (req, reply) => {
    const { sourceId } = req.params as { sourceId: string };
    const access = await requireSourceAccess(deps, req, sourceId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    return reply.status(200).send(access.source);
  });

  app.patch('/api/sources/:sourceId', async (req, reply) => {
    const { sourceId } = req.params as { sourceId: string };
    const patch = req.body as UpdateSourceInput;
    const access = await requireSourceAccess(deps, req, sourceId, 'update');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const updated = await deps.sourceRepository.updateSource(sourceId, patch);
    return reply.status(200).send(updated);
  });

  app.delete('/api/sources/:sourceId', async (req, reply) => {
    const { sourceId } = req.params as { sourceId: string };
    const access = await requireSourceAccess(deps, req, sourceId, 'delete');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    try {
      await deps.sourceRepository.deleteSource(sourceId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Source not found' });
    }
  });

  app.post('/api/sources/:sourceId/share', async (req, reply) => {
    const { sourceId } = req.params as { sourceId: string };
    const input = req.body as Partial<ShareSourceInput>;
    const access = await requireSourceAccess(deps, req, sourceId, 'update');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (typeof input.granteeUserId !== 'string' || input.granteeUserId.trim().length === 0 || typeof input.permission !== 'string') {
      return reply.status(400).send({ code: 'validation_error', message: 'granteeUserId and permission are required' });
    }
    await deps.sourceRepository.shareSource(sourceId, req.userId!, {
      granteeUserId: input.granteeUserId,
      permission: input.permission as ShareSourceInput['permission'],
      expiresAt: input.expiresAt
    });
    return reply.status(204).send();
  });

  app.post('/api/sources/:sourceId/publish', async (req, reply) => {
    const { sourceId } = req.params as { sourceId: string };
    const input = req.body as Partial<PublishSourceInput>;
    const access = await requireSourceAccess(deps, req, sourceId, 'update');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can publish' });
    }
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'title is required' });
    }
    const published = await deps.sourceRepository.publishSource(sourceId, req.userId!, {
      title: input.title,
      summary: input.summary,
      visibility: input.visibility
    });
    return reply.status(201).send(published);
  });

  app.post('/api/sources/:sourceId/unpublish', async (req, reply) => {
    const { sourceId } = req.params as { sourceId: string };
    const access = await requireSourceAccess(deps, req, sourceId, 'update');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can unpublish' });
    }
    try {
      await deps.sourceRepository.unpublishSource(sourceId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Published marketplace source not found' });
    }
  });

  app.get('/api/sources/marketplace', async (_req, reply) => {
    const rows = await deps.sourceRepository.listMarketplaceSources();
    return reply.status(200).send(rows);
  });

  app.post('/api/sources/marketplace/:publicationId/clone', async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };
    try {
      const cloned = await deps.sourceRepository.cloneFromMarketplace(publicationId, req.userId!);
      return reply.status(cloned.cloned ? 201 : 200).send(cloned);
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Marketplace source not found' });
    }
  });

  app.post('/api/sources/probe', async (req, reply) => {
    if (!deps.sourceProbe) {
      return reply.status(503).send({ code: 'probe_unavailable', message: 'Source probing is not available' });
    }
    const body = req.body as Partial<SourceConfig>;
    if (!isSupportedSourceType(body.type) || typeof body.value !== 'string' || body.value.trim().length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'A source type and non-empty value are required' });
    }
    const maxItems = typeof body.maxItems === 'number' && Number.isFinite(body.maxItems) ? body.maxItems : undefined;
    const probe = await deps.sourceProbe.probeSource({ type: body.type, value: body.value, maxItems });
    return reply.status(200).send(probe);
  });
}
