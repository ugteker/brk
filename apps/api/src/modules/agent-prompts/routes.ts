import type { FastifyInstance } from 'fastify';
import type { PromptRepository } from '../prompts/repository';
import type { ReportRepository } from '../reports/repository';
import type { CreatePromptVersionInput } from '../prompts/types';
import type { AgentRepositoryLike } from '../agents/routes';
import type { MailerLike } from '../auth/mailer';
import { sendReportNotification } from '../agents/notifications';

export interface AgentPromptRoutesDeps {
  promptRepository: Pick<PromptRepository, 'savePromptVersion' | 'getLatestPromptVersion'>;
  reportRepository: Pick<
    ReportRepository,
    'getLatestRunReport' | 'listReportsForAgent' | 'getReportById' | 'listSignalHistoryForSymbol'
  >;
  agentRepository?: Pick<AgentRepositoryLike, 'getAgent'>;
  mailer?: MailerLike;
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

  // Per-symbol signal history for the "clickable symbol -> performance view" feature: returns
  // all of this agent's reports that contain at least one signal for the given symbol, oldest
  // first, so the UI can render a chronological timeline alongside a market price chart.
  app.get('/api/agents/:agentId/signals/:symbol', async (req, reply) => {
    const { agentId, symbol } = req.params as { agentId: string; symbol: string };
    const history = await deps.reportRepository.listSignalHistoryForSymbol(agentId, symbol);
    return reply.status(200).send(history);
  });

  // Manual "re-send" action for the Reports view: emails the given report to the agent's
  // configured recipients again (or for the first time, since reports aren't auto-emailed today).
  app.post('/api/agents/:agentId/reports/:reportId/resend-notification', async (req, reply) => {
    const { agentId, reportId } = req.params as { agentId: string; reportId: string };

    const agent = await deps.agentRepository?.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }

    const report = await deps.reportRepository.getReportById(reportId);
    if (!report || report.agentId !== agentId) {
      return reply.status(404).send({ code: 'not_found', message: 'Report not found for this agent' });
    }

    if (agent.recipients.length === 0) {
      return reply.status(400).send({ code: 'no_recipients', message: 'This agent has no notification recipients configured' });
    }

    await sendReportNotification(deps.mailer, agent, report);
    return reply.status(200).send({ status: 'sent', recipientCount: agent.recipients.length });
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
