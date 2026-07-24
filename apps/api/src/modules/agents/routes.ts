import type { FastifyInstance } from 'fastify';
import { validateCreateAgentInput, validatePatchAgentInput, validateCreateAgentVersionInput } from './validation';
import type {
  Agent,
  AgentListItem,
  AgentShareRecord,
  CloneAgentResult,
  CreateAgentInput,
  CreateAgentVersionInput,
  MarketplaceAgentListItem,
  PublishAgentInput,
  RecentRun,
  ShareAgentInput
} from './types';
import type { SourceConfig } from '../analysis/types';
import type { SourceProbeResult } from '../analysis/source-adapters/smart-crawler';
import type { MailerLike } from '../auth/mailer';
import { sendAgentChangeConfirmation } from './notifications';
import type { DomainAccessResolver } from '../access/permissions';

export interface AgentRepositoryLike {
  createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent>;
  updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent>;
  disableAgent(agentId: string): Promise<void>;
  enableAgent(agentId: string): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  listAgents(ownerUserId?: string): Promise<AgentListItem[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  listRecentRuns(ownerUserId: string, limit: number): Promise<RecentRun[]>;
  shareAgent(agentId: string, grantedByUserId: string, input: ShareAgentInput): Promise<void>;
  listAgentShares(agentId: string): Promise<AgentShareRecord[]>;
  revokeAgentShare(agentId: string, grantId: string): Promise<void>;
  publishAgent(agentId: string, publisherUserId: string, input: PublishAgentInput): Promise<MarketplaceAgentListItem>;
  unpublishAgent(agentId: string): Promise<void>;
  listMarketplaceAgents(): Promise<MarketplaceAgentListItem[]>;
  cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<CloneAgentResult>;

  // Versioning and saved-agent memberships
  createAgentVersion(agentId: string, input: CreateAgentVersionInput): Promise<{ id: string; agentId: string; version: number }>;
  saveAgentVersion(userId: string, agentVersionId: string): Promise<void>;
  removeSavedAgentVersion(userId: string, agentVersionId: string): Promise<void>;
}

export interface SourceProbeLike {
  probeSource(source: SourceConfig, previewLimit?: number): Promise<SourceProbeResult>;
}

export interface RunEpisodeSelection {
  sourceType: SourceConfig['type'];
  sourceValue: string;
  itemLink: string;
}

export interface RunTriggerLike {
  triggerRun(agentId: string, options?: { forcedEpisode?: RunEpisodeSelection }): Promise<{ status: string; errorCode?: string }>;
}

export interface AgentRoutesOptions {
  sourceProbe?: SourceProbeLike;
  mailer?: MailerLike;
  runTrigger?: RunTriggerLike;
  accessResolver?: DomainAccessResolver;
}

export async function registerAgentRoutes(app: FastifyInstance, repo: AgentRepositoryLike, options: AgentRoutesOptions = {}) {
  const { sourceProbe, mailer, runTrigger, accessResolver } = options;

  async function requireAgentAccess(
    request: { userId?: string; userRole?: 'user' | 'admin' },
    agentId: string,
    action: 'read' | 'edit' | 'delete' | 'run'
  ) {
    const agent = await repo.getAgent(agentId);
    if (!agent) {
      return { ok: false as const, statusCode: 404, code: 'not_found', message: 'Agent not found' };
    }

    if (!accessResolver) {
      const allowed = request.userRole === 'admin' || request.userId === agent.ownerUserId;
      if (!allowed) {
        return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Agent access denied' };
      }
      return { ok: true as const, agent, reason: request.userRole === 'admin' ? 'admin' : 'owner' as const };
    }

    const decision = await accessResolver.resolve({
      actorUserId: request.userId!,
      actorRole: request.userRole ?? 'user',
      resourceType: 'agent',
      resourceId: agentId,
      action
    });
    if (!decision.allowed) {
      return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Agent access denied' };
    }

    return { ok: true as const, agent, reason: decision.reason };
  }

  async function requireOwnerOrAdminForShareManagement(request: { userId?: string; userRole?: 'user' | 'admin' }, agentId: string) {
    const access = await requireAgentAccess(request, agentId, 'edit');
    if (!access.ok) return access;
    if (access.reason === 'grant') {
      return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Only owner/admin can manage shares' };
    }
    return access;
  }

  app.post('/api/agents', async (req, reply) => {
    const input = req.body as CreateAgentInput;
    const validation = validateCreateAgentInput(input);
    if (!validation.ok) {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'Invalid agent configuration',
        fieldErrors: validation.errors
      });
    }

    const agent = await repo.createAgent(req.userId!, input);
    // Don't block the response on sending the confirmation email - it never
    // throws (errors are caught/logged internally), but without a connection
    // timeout on a misbehaving/unreachable SMTP host this could otherwise
    // hang the request well past nginx's own proxy timeout.
    void sendAgentChangeConfirmation(mailer, agent, 'created', []);
    return reply.status(201).send(agent);
  });

  app.post('/api/agents/sources/probe', async (req, reply) => {
    if (!sourceProbe) {
      return reply.status(503).send({ code: 'probe_unavailable', message: 'Source probing is not available' });
    }

    const body = req.body as Partial<SourceConfig>;
    if (
      (body.type !== 'web_urls' && body.type !== 'podcast_feeds' && body.type !== 'youtube_videos') ||
      typeof body.value !== 'string' ||
      body.value.trim().length === 0
    ) {
      return reply.status(400).send({ code: 'validation_error', message: 'A source type and non-empty value are required' });
    }

    const maxItems = typeof body.maxItems === 'number' && Number.isFinite(body.maxItems) ? body.maxItems : undefined;
    const result = await sourceProbe.probeSource({ type: body.type, value: body.value, maxItems });
    return reply.status(200).send(result);
  });

  app.get('/api/agents', async (req) => repo.listAgents(req.userRole === 'admin' ? undefined : req.userId!));

  app.get('/api/agents/marketplace', async (_req, reply) => {
    const rows = await repo.listMarketplaceAgents();
    return reply.status(200).send(rows);
  });

  app.post('/api/agents/marketplace/:publicationId/clone', async (req, reply) => {
    const { publicationId } = req.params as { publicationId: string };
    try {
      const cloned = await repo.cloneFromMarketplace(publicationId, req.userId!);
      return reply.status(cloned.cloned ? 201 : 200).send(cloned);
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Marketplace agent not found' });
    }
  });

  app.get('/api/agents/runs/recent', async (req) => {
    const { limit } = req.query as { limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 3;
    return repo.listRecentRuns(req.userId!, Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 3);
  });

  app.get('/api/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    return reply.status(200).send(access.agent);
  });

  app.patch('/api/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const patch = req.body as Partial<CreateAgentInput>;
    const access = await requireAgentAccess(req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const validation = validatePatchAgentInput(access.agent, patch);
    if (!validation.ok) {
      return reply.status(400).send({
        code: 'validation_error',
        message: 'Invalid agent configuration',
        fieldErrors: validation.errors
      });
    }
    try {
      const agent = await repo.updateAgent(agentId, patch);
      void sendAgentChangeConfirmation(mailer, agent, 'updated', []);
      return reply.status(200).send(agent);
    } catch (err: any) {
      if (err && err.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
      }
      if (err && err.message === 'immutable_agent_version') {
        return reply.status(409).send({ code: 'immutable_agent_version', message: 'Agent version is immutable' });
      }
      throw err;
    }
  });

  // Create a new immutable agent version (edits to execution/prompt fields create versions)
  app.post('/api/agents/:agentId/versions', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can create versions' });
    }
    const input = req.body as CreateAgentVersionInput;
    const validation = validateCreateAgentVersionInput(input);
    if (!validation.ok) {
      return reply.status(400).send({ code: 'validation_error', message: 'Invalid version', fieldErrors: validation.errors });
    }
    try {
      const created = await repo.createAgentVersion(agentId, input);
      // notify owner of new version using a full agent projection; the notification function is a no-op when there are no recipients
      const agent = await repo.getAgent(agentId);
      if (agent) void sendAgentChangeConfirmation(mailer, agent, 'updated', []);
      return reply.status(201).send(created);
    } catch (err: any) {
      if (err && err.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
      }
      if (err && err.message === 'immutable_agent_version') {
        return reply.status(409).send({ code: 'immutable_agent_version', message: 'Agent version is immutable' });
      }
      throw err;
    }
  });

  // Save a published agent version into the user's library (public versions save by membership)
  app.post('/api/agent-versions/:agentVersionId/save', async (req, reply) => {
    const { agentVersionId } = req.params as { agentVersionId: string };
    try {
      await repo.saveAgentVersion(req.userId!, agentVersionId);
      return reply.status(204).send();
    } catch (err: any) {
      if (err && err.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Agent version not found' });
      }
      throw err;
    }
  });

  // Remove a saved agent version from the user's library
  app.delete('/api/agent-versions/:agentVersionId/save', async (req, reply) => {
    const { agentVersionId } = req.params as { agentVersionId: string };
    try {
      await repo.removeSavedAgentVersion(req.userId!, agentVersionId);
      return reply.status(204).send();
    } catch (err: any) {
      if (err && err.message === 'not_found') {
        return reply.status(404).send({ code: 'not_found', message: 'Saved agent not found' });
      }
      throw err;
    }
  });

  app.post('/api/agents/:agentId/disable', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    try {
      await repo.disableAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.post('/api/agents/:agentId/enable', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    try {
      await repo.enableAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  const EPISODIC_SOURCE_TYPES: SourceConfig['type'][] = ['podcast_feeds', 'youtube_videos'];
  // Sneak-preview count for the manual-run episode picker - deliberately larger than the wizard's
  // PREVIEW_ITEM_COUNT (5), per the "last 10 episodes" requirement for this feature.
  const EPISODE_OPTIONS_LIMIT = 10;

  app.get('/api/agents/:agentId/episode-options', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const agent = await repo.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
    if (!sourceProbe) {
      return reply.status(503).send({ code: 'probe_unavailable', message: 'Episode preview is not available' });
    }

    const episodicSources = agent.sources.filter((source) => EPISODIC_SOURCE_TYPES.includes(source.type));
    const perSource = await Promise.all(
      episodicSources.map(async (source) => {
        const probe = await sourceProbe.probeSource(source, EPISODE_OPTIONS_LIMIT);
        return (probe.previewItems ?? [])
          .filter((item) => item.link)
          .map((item) => ({
            sourceType: source.type,
            sourceValue: source.value,
            title: item.title,
            link: item.link as string,
            pubDate: item.pubDate
          }));
      })
    );

    const combined = perSource
      .flat()
      .sort((a, b) => {
        const aTime = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const bTime = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, EPISODE_OPTIONS_LIMIT);

    return reply.status(200).send(combined);
  });

  app.post('/api/agents/:agentId/run', async (req, reply) => {
    if (!runTrigger) {
      return reply.status(503).send({ code: 'run_trigger_unavailable', message: 'Manual runs are not available' });
    }

    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'run');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }

    const body = (req.body ?? {}) as Partial<RunEpisodeSelection>;
    const forcedEpisode =
      body.sourceType && body.sourceValue && body.itemLink
        ? { sourceType: body.sourceType, sourceValue: body.sourceValue, itemLink: body.itemLink }
        : undefined;

    const result = await runTrigger.triggerRun(agentId, forcedEpisode ? { forcedEpisode } : undefined);
    return reply.status(200).send(result);
  });

  app.delete('/api/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'delete');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    try {
      await repo.deleteAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.post('/api/agents/:agentId/shares', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireOwnerOrAdminForShareManagement(req, agentId);
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }

    const input = req.body as Partial<ShareAgentInput>;
    if (
      typeof input.granteeUserId !== 'string' ||
      input.granteeUserId.trim().length === 0 ||
      (input.permission !== 'read' && input.permission !== 'edit' && input.permission !== 'delete')
    ) {
      return reply.status(400).send({ code: 'validation_error', message: 'granteeUserId and valid permission are required' });
    }

    await repo.shareAgent(agentId, req.userId!, {
      granteeUserId: input.granteeUserId,
      permission: input.permission,
      expiresAt: input.expiresAt
    });
    return reply.status(204).send();
  });

  app.post('/api/agents/:agentId/publish', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can publish' });
    }
    const input = req.body as Partial<PublishAgentInput>;
    if (typeof input.title !== 'string' || input.title.trim().length === 0) {
      return reply.status(400).send({ code: 'validation_error', message: 'title is required' });
    }
    const published = await repo.publishAgent(agentId, req.userId!, {
      title: input.title,
      summary: input.summary,
      visibility: input.visibility
    });
    return reply.status(201).send(published);
  });

  app.post('/api/agents/:agentId/unpublish', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    if (access.reason === 'grant') {
      return reply.status(403).send({ code: 'forbidden', message: 'Only owner/admin can unpublish' });
    }
    try {
      await repo.unpublishAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Published marketplace agent not found' });
    }
  });

  app.get('/api/agents/:agentId/shares', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireOwnerOrAdminForShareManagement(req, agentId);
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    return reply.status(200).send(await repo.listAgentShares(agentId));
  });

  app.delete('/api/agents/:agentId/shares/:grantId', async (req, reply) => {
    const { agentId, grantId } = req.params as { agentId: string; grantId: string };
    const access = await requireOwnerOrAdminForShareManagement(req, agentId);
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }

    try {
      await repo.revokeAgentShare(agentId, grantId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent share not found' });
    }
  });
}
