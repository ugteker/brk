import type { FastifyInstance } from 'fastify';
import { validateCreateAgentInput } from './validation';
import type { Agent, AgentListItem, CreateAgentInput, RecentRun } from './types';
import type { SourceConfig } from '../analysis/types';
import type { SourceProbeResult } from '../analysis/source-adapters/smart-crawler';
import type { MailerLike } from '../auth/mailer';
import { sendAgentChangeConfirmation } from './notifications';

export interface AgentRepositoryLike {
  createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent>;
  updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent>;
  disableAgent(agentId: string): Promise<void>;
  enableAgent(agentId: string): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  listAgents(ownerUserId: string): Promise<AgentListItem[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  listRecentRuns(ownerUserId: string, limit: number): Promise<RecentRun[]>;
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
}

export async function registerAgentRoutes(app: FastifyInstance, repo: AgentRepositoryLike, options: AgentRoutesOptions = {}) {
  const { sourceProbe, mailer, runTrigger } = options;

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

    const agent = await repo.createAgent('admin-user-id', input);
    await sendAgentChangeConfirmation(mailer, agent, 'created');
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

  app.get('/api/agents', async () => repo.listAgents('admin-user-id'));

  app.get('/api/agents/runs/recent', async (req) => {
    const { limit } = req.query as { limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 3;
    return repo.listRecentRuns('admin-user-id', Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 3);
  });

  app.get('/api/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const agent = await repo.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
    return reply.status(200).send(agent);
  });

  app.patch('/api/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const patch = req.body as Partial<CreateAgentInput>;
    try {
      const agent = await repo.updateAgent(agentId, patch);
      await sendAgentChangeConfirmation(mailer, agent, 'updated');
      return reply.status(200).send(agent);
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.post('/api/agents/:agentId/disable', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    try {
      await repo.disableAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });

  app.post('/api/agents/:agentId/enable', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
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
    const agent = await repo.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
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
    try {
      await repo.deleteAgent(agentId);
      return reply.status(204).send();
    } catch {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }
  });
}
