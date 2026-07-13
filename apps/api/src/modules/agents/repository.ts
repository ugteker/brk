import type { PrismaClient } from '@prisma/client';
import { computeNextRun } from '../schedules/compute-next-run';
import type { Agent, AgentListItem, CreateAgentInput, RecentRun, ScheduleInput } from './types';

type AgentDb = Pick<
  PrismaClient,
  'agent' | 'agentSource' | 'agentSchedule' | 'agentRun' | 'agentPromptVersion' | 'agentRunArtifact' | 'agentRunReport' | 'agentSignal' | '$transaction'
>;
type SourceRow = { type: string; value: string; frequencyMinutes?: number; maxItems?: number };
type ScheduleRow = {
  mode?: string;
  intervalMinutes?: number | null;
  dailyTime?: string | null;
  timezone?: string | null;
  daysOfWeekJson?: string | null;
};

function parsePreferences(json: string | null | undefined): Record<string, string[]> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function parseRecipients(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function parseDaysOfWeek(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function scheduleFromRow(row: ScheduleRow | undefined | null): ScheduleInput | null {
  if (!row) return null;
  if (row.mode === 'weekly') {
    return {
      mode: 'weekly',
      daysOfWeek: parseDaysOfWeek(row.daysOfWeekJson),
      dailyTime: row.dailyTime ?? '07:30',
      timezone: row.timezone ?? 'UTC'
    };
  }
  if (row.mode === 'daily') {
    return { mode: 'daily', dailyTime: row.dailyTime ?? '07:30', timezone: row.timezone ?? 'UTC' };
  }
  return { mode: 'interval', intervalMinutes: row.intervalMinutes ?? 60 };
}

function scheduleCreateData(schedule: ScheduleInput, now: Date) {
  return {
    mode: schedule.mode,
    intervalMinutes: schedule.mode === 'interval' ? schedule.intervalMinutes : null,
    dailyTime: schedule.mode === 'daily' || schedule.mode === 'weekly' ? schedule.dailyTime : null,
    timezone: schedule.mode === 'daily' || schedule.mode === 'weekly' ? schedule.timezone : null,
    daysOfWeekJson: schedule.mode === 'weekly' ? JSON.stringify(schedule.daysOfWeek) : null,
    nextRunAt: computeNextRun(schedule, now),
    enabled: true
  };
}

function mapAgent(row: any): Agent {
  const sourceRows = (row.sources ?? []) as SourceRow[];
  const latestSchedule = (row.schedules ?? [])[0] as ScheduleRow | undefined;

  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    description: row.description ?? '',
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sources: sourceRows.map((s) => ({
      type: s.type as Agent['sources'][number]['type'],
      value: s.value,
      frequencyMinutes: s.frequencyMinutes ?? 60,
      maxItems: s.maxItems ?? 1
    })),
    preferences: parsePreferences(row.preferencesJson),
    recipients: parseRecipients(row.recipientsJson),
    schedule: scheduleFromRow(latestSchedule)
  };
}

export class AgentRepository {
  constructor(private readonly db: AgentDb) {}

  async listAgents(ownerUserId?: string): Promise<AgentListItem[]> {
    const rows = await this.db.agent.findMany({
      where: ownerUserId ? { ownerUserId } : {},
      include: {
        sources: true,
        schedules: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { runs: true, runReports: true } },
        runReports: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return rows.map((agent: any) => ({
      ...mapAgent(agent),
      runCount: agent._count?.runs ?? 0,
      reportCount: agent._count?.runReports ?? 0,
      latestReportAt: agent.runReports?.[0]?.createdAt ?? null
    }));
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    const agent = await this.db.agent.findUnique({
      where: { id: agentId },
      include: { sources: true, schedules: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });
    if (!agent) return null;

    return mapAgent(agent);
  }

  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    const now = new Date();
    const created = await this.db.agent.create({
      data: {
        ownerUserId,
        name: input.name,
        description: input.description ?? '',
        status: input.active === false ? 'disabled' : 'active',
        preferencesJson: JSON.stringify(input.preferences ?? {}),
        recipientsJson: JSON.stringify(input.recipients ?? []),
        sources: {
          create: input.sources.map((s) => ({
            type: s.type,
            value: s.value,
            frequencyMinutes: s.frequencyMinutes ?? 60,
            maxItems: s.maxItems ?? 1
          }))
        },
        schedules: {
          create: scheduleCreateData(input.schedule, now)
        }
      },
      include: { sources: true, schedules: true }
    });

    return mapAgent(created);
  }

  async disableAgent(agentId: string): Promise<void> {
    await this.db.agent.update({
      where: { id: agentId },
      data: { status: 'disabled' }
    });
  }

  async enableAgent(agentId: string): Promise<void> {
    await this.db.agent.update({
      where: { id: agentId },
      data: { status: 'active' }
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const reports = await tx.agentRunReport.findMany({ where: { agentId }, select: { id: true } });
      const reportIds = reports.map((r: { id: string }) => r.id);
      if (reportIds.length > 0) {
        await tx.agentSignal.deleteMany({ where: { agentRunReportId: { in: reportIds } } });
      }
      await tx.agentRunReport.deleteMany({ where: { agentId } });
      await tx.agentRunArtifact.deleteMany({ where: { agentId } });
      await tx.agentRun.deleteMany({ where: { agentId } });
      await tx.agentPromptVersion.deleteMany({ where: { agentId } });
      await tx.agentSchedule.deleteMany({ where: { agentId } });
      await tx.agentSource.deleteMany({ where: { agentId } });
      await tx.agent.delete({ where: { id: agentId } });
    });
  }

  async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
    const now = new Date();

    const updated = await this.db.$transaction(async (tx: any) => {
      if (patch.sources) {
        await tx.agentSource.deleteMany({ where: { agentId } });
        await tx.agentSource.createMany({
          data: patch.sources.map((s) => ({
            agentId,
            type: s.type,
            value: s.value,
            frequencyMinutes: s.frequencyMinutes ?? 60,
            maxItems: s.maxItems ?? 1
          }))
        });
      }

      if (patch.schedule) {
        await tx.agentSchedule.deleteMany({ where: { agentId } });
        await tx.agentSchedule.create({
          data: { agentId, ...scheduleCreateData(patch.schedule, now) }
        });
      }

      return tx.agent.update({
        where: { id: agentId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.active !== undefined ? { status: patch.active ? 'active' : 'disabled' } : {}),
          ...(patch.preferences !== undefined ? { preferencesJson: JSON.stringify(patch.preferences) } : {}),
          ...(patch.recipients !== undefined ? { recipientsJson: JSON.stringify(patch.recipients) } : {})
        },
        include: { sources: true, schedules: { orderBy: { createdAt: 'desc' }, take: 1 } }
      });
    });

    return mapAgent(updated);
  }

  async listRecentRuns(ownerUserId: string, limit: number): Promise<RecentRun[]> {
    const rows = await this.db.agentRun.findMany({
      where: { agent: { ownerUserId } },
      include: { agent: { select: { name: true } } },
      orderBy: { scheduledFor: 'desc' },
      take: limit
    });

    return rows.map((run: any) => ({
      id: run.id,
      agentId: run.agentId,
      agentName: run.agent.name,
      status: run.status,
      scheduledFor: run.scheduledFor,
      finishedAt: run.finishedAt ?? null
    }));
  }
}
