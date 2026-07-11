import type { FastifyInstance } from 'fastify';
import { validateCreateAgentInput } from './validation';
import type { Agent, CreateAgentInput, RecentRun } from './types';

export interface AgentRepositoryLike {
  createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent>;
  updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent>;
  disableAgent(agentId: string): Promise<void>;
  enableAgent(agentId: string): Promise<void>;
  deleteAgent(agentId: string): Promise<void>;
  listAgents(ownerUserId: string): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  listRecentRuns(ownerUserId: string, limit: number): Promise<RecentRun[]>;
}

export async function registerAgentRoutes(app: FastifyInstance, repo: AgentRepositoryLike) {
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
    return reply.status(201).send(agent);
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
