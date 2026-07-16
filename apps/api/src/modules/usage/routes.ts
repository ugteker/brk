import type { FastifyInstance } from 'fastify';
import type { UsageService } from './budget';

export interface UsageRoutesDeps {
  usageService: Pick<UsageService, 'getUsageSummary' | 'setBudget'>;
}

const MAX_BUDGET_USD = 1_000_000;

export async function registerUsageRoutes(app: FastifyInstance, deps: UsageRoutesDeps): Promise<void> {
  app.get('/api/usage', async (req, reply) => {
    const summary = await deps.usageService.getUsageSummary(req.userId!);
    return reply.status(200).send(summary);
  });

  app.patch('/api/usage/budget', async (req, reply) => {
    const body = (req.body ?? {}) as { budgetUsd?: unknown };
    const raw = body.budgetUsd;
    let budgetUsd: number | null;
    if (raw === null || raw === undefined) {
      budgetUsd = null;
    } else if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw <= MAX_BUDGET_USD) {
      budgetUsd = raw;
    } else {
      return reply
        .status(400)
        .send({ code: 'validation_error', message: 'budgetUsd must be a positive number or null (unlimited)' });
    }
    await deps.usageService.setBudget(req.userId!, budgetUsd);
    const summary = await deps.usageService.getUsageSummary(req.userId!);
    return reply.status(200).send(summary);
  });
}
