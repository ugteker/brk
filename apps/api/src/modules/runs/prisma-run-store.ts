import type { PrismaClient } from '@prisma/client';
import { computeNextRun } from '../schedules/compute-next-run';
import type { RealtimeEventWriter } from '../realtime/types';
import type { AgentRunRecord, RunPhase, RunStore } from './run-queue.service';

type RunDb = Pick<PrismaClient, 'agentRun' | 'playbook' | 'agent' | 'realtimeEvent' | '$transaction'>;

/** Used when a caller doesn't wire a real RealtimeEventWriter (e.g. legacy tests); keeps
 * mutation behavior identical while emitting no realtime events. */
const noopRealtimeEventWriter: RealtimeEventWriter = { append: async () => {} };

function parseRecipients(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is string => typeof e === 'string').map((e) => e.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export class PrismaRunStore implements RunStore {
  constructor(
    private readonly db: RunDb,
    private readonly realtime: RealtimeEventWriter = noopRealtimeEventWriter
  ) {}

  async getDueSchedules(now: Date) {
    const duePlaybooks = await this.db.playbook.findMany({
      where: { enabled: true, mode: { not: 'manual' }, nextRunAt: { lte: now } },
      select: { id: true, agentId: true, agentVersionId: true, nextRunAt: true }
    });
    return duePlaybooks.map((pb) => ({
      agentId: pb.agentId,
      agentVersionId: pb.agentVersionId ?? undefined,
      nextRunAt: pb.nextRunAt!,
      enabled: true,
      playbookId: pb.id
    }));
  }

  async upsertQueuedRun(agentId: string, scheduledFor: Date, playbookId?: string, agentVersionId?: string): Promise<void> {
    await this.db.agentRun.upsert({
      where: { agentId_scheduledFor: { agentId, scheduledFor } },
      update: {},
      create: {
        agentId,
        playbookId: playbookId ?? null,
        agentVersionId: agentVersionId ?? null,
        scheduledFor,
        status: 'queued',
        retryCount: 0
      }
    });
  }

  async claimNextQueuedRun(workerId: string): Promise<AgentRunRecord | null> {
    const queued = await this.db.agentRun.findFirst({
      where: { status: 'queued' },
      orderBy: { scheduledFor: 'asc' },
      include: {
        playbook: {
          select: {
            recipientsJson: true,
            language: true,
            notificationsEnabled: true,
            digestFrequency: true,
            maxItemsPerSource: true
          }
        }
      }
    });
    if (!queued) return null;

    const claimed = await this.db.$transaction(async (tx) => {
      const claimed = await tx.agentRun.update({
        where: { id: queued.id },
        data: { status: 'running', workerId, startedAt: new Date() }
      });
      const agent = await tx.agent.findUnique({ where: { id: claimed.agentId }, select: { ownerUserId: true } });
      if (!agent) {
        // AgentRun.agentId is a required, FK-enforced column (onDelete: Restrict), so a
        // missing agent here means the data invariant has been violated. Surface it loudly
        // instead of silently skipping the realtime event.
        throw new Error(`invariant_violation: run ${claimed.id} references missing agent ${claimed.agentId}`);
      }
      await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'run.changed', entityId: claimed.id, agentId: claimed.agentId });
      return claimed;
    });

    const playbookData = (queued as typeof queued & {
      playbook?: {
        recipientsJson: string;
        language: string;
        notificationsEnabled?: boolean;
        digestFrequency?: string;
        maxItemsPerSource?: number;
      } | null;
    }).playbook;

    return {
      id: claimed.id,
      agentId: claimed.agentId,
      agentVersionId: (claimed as { agentVersionId?: string | null }).agentVersionId ?? undefined,
      scheduledFor: claimed.scheduledFor,
      status: claimed.status as AgentRunRecord['status'],
      phase: (claimed as { phase?: string | null }).phase as RunPhase | null | undefined,
      workerId: claimed.workerId ?? undefined,
      retryCount: claimed.retryCount,
      errorCode: claimed.errorCode ?? undefined,
      errorMessage: claimed.errorMessage ?? undefined,
      startedAt: claimed.startedAt ?? undefined,
      finishedAt: claimed.finishedAt ?? undefined,
      playbookId: (claimed as { playbookId?: string | null }).playbookId ?? undefined,
      playbookRecipients: playbookData ? parseRecipients(playbookData.recipientsJson) : undefined,
      playbookLanguage: playbookData?.language ?? undefined,
      playbookNotificationsEnabled: playbookData ? (playbookData.notificationsEnabled ?? true) : undefined,
      playbookDigestFrequency: playbookData?.digestFrequency ?? undefined,
      playbookMaxItemsPerSource: playbookData?.maxItemsPerSource ?? undefined
    };
  }

  async setPhase(runId: string, phase: RunPhase): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.agentRun.update({
        where: { id: runId },
        data: { phase }
      });
      const agent = await tx.agent.findUnique({ where: { id: updated.agentId }, select: { ownerUserId: true } });
      if (!agent) {
        throw new Error(`invariant_violation: run ${updated.id} references missing agent ${updated.agentId}`);
      }
      await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'run.changed', entityId: updated.id, agentId: updated.agentId });
    });
  }

  async completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const updated = await tx.agentRun.update({
        where: { id: runId },
        data: {
          status,
          phase: null,
          errorCode,
          errorMessage,
          finishedAt: new Date()
        }
      });
      const agent = await tx.agent.findUnique({ where: { id: updated.agentId }, select: { ownerUserId: true } });
      if (!agent) {
        throw new Error(`invariant_violation: run ${updated.id} references missing agent ${updated.agentId}`);
      }
      await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'run.changed', entityId: updated.id, agentId: updated.agentId });
    });
  }

  async markPlaybookExecuted(playbookId: string): Promise<void> {
    const playbook = await this.db.playbook.findUnique({
      where: { id: playbookId },
      select: { mode: true, intervalMinutes: true, dailyTime: true, timezone: true, daysOfWeekJson: true }
    });
    if (!playbook) return;

    const schedule = (() => {
      if (playbook.mode === 'weekly') {
        return {
          mode: 'weekly' as const,
          daysOfWeek: playbook.daysOfWeekJson ? JSON.parse(playbook.daysOfWeekJson) : [],
          dailyTime: playbook.dailyTime ?? '07:30',
          timezone: playbook.timezone ?? 'UTC'
        };
      }
      if (playbook.mode === 'daily') {
        return { mode: 'daily' as const, dailyTime: playbook.dailyTime ?? '07:30', timezone: playbook.timezone ?? 'UTC' };
      }
      return { mode: 'interval' as const, intervalMinutes: playbook.intervalMinutes ?? 60 };
    })();

    await this.db.playbook.update({
      where: { id: playbookId },
      data: { nextRunAt: computeNextRun(schedule, new Date()) }
    });
  }
}
