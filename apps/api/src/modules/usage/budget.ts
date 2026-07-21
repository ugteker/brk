import type { PrismaClient } from '@prisma/client';

export interface MonthlyUsage {
  spentUsd: number;
  inputTokens: number;
  outputTokens: number;
  reportCount: number;
}

export interface UsageStoreLike {
  /** Aggregated usage across all reports of agents owned by the user since `monthStart`. */
  getMonthlyUsage(userId: string, monthStart: Date): Promise<MonthlyUsage>;
  getMonthlyBudgetUsd(userId: string): Promise<number | null>;
  setMonthlyBudgetUsd(userId: string, budgetUsd: number | null): Promise<void>;
}

/** First instant of the current calendar month (UTC) - the budget window boundary. */
export function currentMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class PrismaUsageStore implements UsageStoreLike {
  constructor(private readonly db: Pick<PrismaClient, 'agentRunReport' | 'user'>) {}

  async getMonthlyUsage(userId: string, monthStart: Date): Promise<MonthlyUsage> {
    const aggregate = await this.db.agentRunReport.aggregate({
      where: { createdAt: { gte: monthStart }, agent: { ownerUserId: userId } },
      _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
      _count: { _all: true }
    });
    return {
      spentUsd: aggregate._sum.estimatedCostUsd ?? 0,
      inputTokens: aggregate._sum.inputTokens ?? 0,
      outputTokens: aggregate._sum.outputTokens ?? 0,
      reportCount: aggregate._count._all
    };
  }

  async getMonthlyBudgetUsd(userId: string): Promise<number | null> {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { monthlyBudgetUsd: true } });
    return user?.monthlyBudgetUsd ?? null;
  }

  async setMonthlyBudgetUsd(userId: string, budgetUsd: number | null): Promise<void> {
    await this.db.user.update({ where: { id: userId }, data: { monthlyBudgetUsd: budgetUsd } });
  }
}

export class InMemoryUsageStore implements UsageStoreLike {
  budgets = new Map<string, number | null>();
  reports: Array<{ ownerUserId: string; createdAt: Date; estimatedCostUsd: number | null; inputTokens: number | null; outputTokens: number | null }> = [];

  async getMonthlyUsage(userId: string, monthStart: Date): Promise<MonthlyUsage> {
    const rows = this.reports.filter((r) => r.ownerUserId === userId && r.createdAt >= monthStart);
    return {
      spentUsd: rows.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0),
      inputTokens: rows.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
      outputTokens: rows.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
      reportCount: rows.length
    };
  }

  async getMonthlyBudgetUsd(userId: string): Promise<number | null> {
    return this.budgets.get(userId) ?? null;
  }

  async setMonthlyBudgetUsd(userId: string, budgetUsd: number | null): Promise<void> {
    this.budgets.set(userId, budgetUsd);
  }
}

export interface UsageSummary extends MonthlyUsage {
  monthStart: string;
  budgetUsd: number | null;
}

export interface BudgetCheckResult {
  allowed: boolean;
  spentUsd: number;
  budgetUsd: number | null;
}

export class UsageService {
  constructor(
    private readonly store: UsageStoreLike,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getUsageSummary(userId: string): Promise<UsageSummary> {
    const monthStart = currentMonthStart(this.now());
    const [usage, budgetUsd] = await Promise.all([
      this.store.getMonthlyUsage(userId, monthStart),
      this.store.getMonthlyBudgetUsd(userId)
    ]);
    return { ...usage, monthStart: monthStart.toISOString(), budgetUsd };
  }

  async setBudget(userId: string, budgetUsd: number | null): Promise<void> {
    await this.store.setMonthlyBudgetUsd(userId, budgetUsd);
  }

  /**
   * Gate for spending money on a new Claude analysis run. Allowed when the user has no budget
   * configured, or month-to-date estimated spend is still below it. Checked *before* the Claude
   * call, so one run may overshoot the budget slightly - the next run is then blocked.
   */
  async checkRunAllowed(userId: string): Promise<BudgetCheckResult> {
    const budgetUsd = await this.store.getMonthlyBudgetUsd(userId);
    if (budgetUsd === null) {
      return { allowed: true, spentUsd: 0, budgetUsd: null };
    }
    const usage = await this.store.getMonthlyUsage(userId, currentMonthStart(this.now()));
    return { allowed: usage.spentUsd < budgetUsd, spentUsd: usage.spentUsd, budgetUsd };
  }
}
