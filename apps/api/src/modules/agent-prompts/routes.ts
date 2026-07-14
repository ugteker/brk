import type { FastifyInstance } from 'fastify';
import type { PromptRepository } from '../prompts/repository';
import type { ReportRepository } from '../reports/repository';
import type { CreatePromptVersionInput } from '../prompts/types';
import type { AgentRepositoryLike } from '../agents/routes';
import type { MailerLike } from '../auth/mailer';
import type { DomainAccessResolver } from '../access/permissions';
import { sendReportNotification } from '../agents/notifications';

export interface AgentPromptRoutesDeps {
  promptRepository: Pick<PromptRepository, 'savePromptVersion' | 'getLatestPromptVersion'>;
  reportRepository: Pick<
    ReportRepository,
    'getLatestRunReport' | 'listReportsForAgent' | 'getReportById' | 'listSignalHistoryForSymbol'
  >;
  agentRepository?: Pick<AgentRepositoryLike, 'getAgent'>;
  mailer?: MailerLike;
  accessResolver?: Pick<DomainAccessResolver, 'resolve'>;
}

async function requireAgentAccess(
  deps: AgentPromptRoutesDeps,
  request: { userId?: string; userRole?: 'user' | 'admin' },
  agentId: string,
  action: 'read' | 'edit'
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
    action
  });
  if (!decision.allowed) {
    return { ok: false as const, statusCode: 403, code: 'forbidden', message: 'Agent access denied' };
  }

  return { ok: true as const };
}

export async function registerAgentPromptRoutes(app: FastifyInstance, deps: AgentPromptRoutesDeps) {
  app.get('/api/agents/:agentId/reports', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(deps, req, agentId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const reports = await deps.reportRepository.listReportsForAgent(agentId);
    return reply.status(200).send(reports);
  });

  app.get('/api/agents/:agentId/report/latest', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(deps, req, agentId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
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
    const access = await requireAgentAccess(deps, req, agentId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const history = await deps.reportRepository.listSignalHistoryForSymbol(agentId, symbol);
    return reply.status(200).send(history);
  });

  // Manual "re-send" action for the Reports view: requires explicit recipients because
  // notification recipients are now playbook-owned, not agent-owned.
  app.post('/api/agents/:agentId/reports/:reportId/resend-notification', async (req, reply) => {
    const { agentId, reportId } = req.params as { agentId: string; reportId: string };
    const access = await requireAgentAccess(deps, req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }

    const agent = await deps.agentRepository?.getAgent(agentId);
    if (!agent) {
      return reply.status(404).send({ code: 'not_found', message: 'Agent not found' });
    }

    const report = await deps.reportRepository.getReportById(reportId);
    if (!report || report.agentId !== agentId) {
      return reply.status(404).send({ code: 'not_found', message: 'Report not found for this agent' });
    }

    const body = (req.body ?? {}) as { recipients?: string[] };
    const recipients = Array.isArray(body.recipients)
      ? body.recipients.map((value) => String(value).trim()).filter((value) => value.length > 0)
      : [];
    if (recipients.length === 0) {
      return reply.status(400).send({ code: 'playbook_recipients_required', message: 'Provide playbook recipients to resend this report' });
    }

    await sendReportNotification(deps.mailer, agent, report, [], recipients);
    return reply.status(200).send({ status: 'sent', recipientCount: recipients.length });
  });

  app.get('/api/agents/:agentId/prompt/latest', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(deps, req, agentId, 'read');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
    const promptVersion = await deps.promptRepository.getLatestPromptVersion(agentId);
    if (!promptVersion) {
      return reply.status(404).send({ code: 'not_found', message: 'No system prompt configured for this agent yet' });
    }
    return reply.status(200).send(promptVersion);
  });

  app.post('/api/agents/:agentId/prompt', async (req, reply) => {
    const { agentId } = req.params as { agentId: string };
    const access = await requireAgentAccess(deps, req, agentId, 'edit');
    if (!access.ok) {
      return reply.status(access.statusCode).send({ code: access.code, message: access.message });
    }
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
