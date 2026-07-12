import type { PrismaClient } from '@prisma/client';
import type { AgentRunRecord, RunStore } from './run-queue.service';

type RunDb = Pick<PrismaClient, 'agentSchedule' | 'agentRun'>;

export class PrismaRunStore implements RunStore {
  constructor(private readonly db: RunDb) {}

  async getDueSchedules(now: Date) {
    return this.db.agentSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      select: { agentId: true, nextRunAt: true, enabled: true }
    });
  }

  async upsertQueuedRun(agentId: string, scheduledFor: Date): Promise<void> {
    await this.db.agentRun.upsert({
      where: { agentId_scheduledFor: { agentId, scheduledFor } },
      update: {},
      create: { agentId, scheduledFor, status: 'queued', retryCount: 0 }
    });
  }

  async claimNextQueuedRun(workerId: string): Promise<AgentRunRecord | null> {
    const queued = await this.db.agentRun.findFirst({
      where: { status: 'queued' },
      orderBy: { scheduledFor: 'asc' }
    });
    if (!queued) return null;

    const claimed = await this.db.agentRun.update({
      where: { id: queued.id },
      data: { status: 'running', workerId, startedAt: new Date() }
    });

    return {
      id: claimed.id,
      agentId: claimed.agentId,
      scheduledFor: claimed.scheduledFor,
      status: claimed.status as AgentRunRecord['status'],
      workerId: claimed.workerId ?? undefined,
      retryCount: claimed.retryCount,
      errorCode: claimed.errorCode ?? undefined,
      errorMessage: claimed.errorMessage ?? undefined,
      startedAt: claimed.startedAt ?? undefined,
      finishedAt: claimed.finishedAt ?? undefined
    };
  }

  async completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.db.agentRun.update({
      where: { id: runId },
      data: {
        status,
        errorCode,
        errorMessage,
        finishedAt: new Date()
      }
    });
  }
}
