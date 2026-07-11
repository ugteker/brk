import type { FastifyInstance } from 'fastify';
import type { PromptRepository } from '../prompts/repository';
import type { ReportRepository } from '../reports/repository';
import type { CreatePromptVersionInput } from '../prompts/types';

export interface AgentPromptRoutesDeps {
  promptRepository: Pick<PromptRepository, 'savePromptVersion' | 'getLatestPromptVersion'>;
  reportRepository: Pick<ReportRepository, 'getLatestRunReport' | 'listReportsForAgent'>;
}

export async function registerAgentPromptRoutes(app: FastifyInstance, deps: AgentPromptRoutesDeps) {
  app.get('/api/agents/:agentId/reports', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const reports = await deps.reportRepository.listReportsForAgent(agentId);
    return reply.status(200).send(reports);
  });

  app.get('/api/agents/:agentId/report/latest', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const report = await deps.reportRepository.getLatestRunReport(agentId);
    if (!report) {
      return reply.status(404).send({ code: 'not_found', message: 'No report available for this agent yet' });
    }
    return reply.status(200).send(report);
  });

  app.get('/api/agents/:agentId/prompt/latest', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const promptVersion = await deps.promptRepository.getLatestPromptVersion(agentId);
    if (!promptVersion) {
      return reply.status(404).send({ code: 'not_found', message: 'No system prompt configured for this agent yet' });
    }
    return reply.status(200).send(promptVersion);
  });

  app.post('/api/agents/:agentId/prompt', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const input = req.body as CreatePromptVersionInput;
    if (!input?.model || !input?.systemPrompt) {
      return reply.status(400).send({ code: 'validation_error', message: 'model and systemPrompt are required' });
    }
    const saved = await deps.promptRepository.savePromptVersion(agentId, {
      model: input.model,
      systemPrompt: input.systemPrompt,
      enabled: input.enabled ?? true
    });
    return reply.status(201).send(saved);
  });
}
