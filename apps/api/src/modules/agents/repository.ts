import type { PrismaClient } from '@prisma/client';
import { computeNextRun } from '../schedules/compute-next-run';
import { DEFAULT_CHARACTER_TYPE } from './types';
import type {
  Agent,
  AgentListItem,
  AgentShareRecord,
  CloneAgentResult,
  CreateAgentInput,
  MarketplaceAgentListItem,
  PromptConfig,
  PublishAgentInput,
  RecentRun,
  ScheduleInput,
  ShareAgentInput
} from './types';

type AgentDb = Pick<
  PrismaClient,
  | 'agent'
  | 'agentSource'
  | 'agentSchedule'
  | 'agentRun'
  | 'agentPromptVersion'
  | 'agentRunArtifact'
  | 'agentRunReport'
  | 'agentSignal'
  | 'playbook'
  | 'accessGrant'
  | 'marketplacePublication'
  | '$transaction'
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

function parsePromptConfig(json: string | null | undefined): PromptConfig {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
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
    characterType: row.characterType ?? DEFAULT_CHARACTER_TYPE,
    promptConfig: parsePromptConfig(row.promptConfigJson),
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
        characterType: input.characterType ?? DEFAULT_CHARACTER_TYPE,
        promptConfigJson: JSON.stringify(input.promptConfig ?? {}),
        status: input.active === false ? 'disabled' : 'active',
        preferencesJson: JSON.stringify(input.preferences ?? {}),
        ...(input.sources && input.sources.length > 0
          ? {
              sources: {
                create: input.sources.map((s) => ({
                  type: s.type,
                  value: s.value,
                  frequencyMinutes: s.frequencyMinutes ?? 60,
                  maxItems: s.maxItems ?? 1
                }))
              }
            }
          : {}),
        ...(input.schedule
          ? {
              schedules: {
                create: scheduleCreateData(input.schedule, now)
              }
            }
          : {})
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
      await tx.accessGrant.deleteMany({ where: { OR: [{ agentId }, { granteeAgentId: agentId }] } });
      await tx.playbook.deleteMany({ where: { agentId } });
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
          ...(patch.characterType !== undefined ? { characterType: patch.characterType } : {}),
          ...(patch.promptConfig !== undefined ? { promptConfigJson: JSON.stringify(patch.promptConfig) } : {}),
          ...(patch.active !== undefined ? { status: patch.active ? 'active' : 'disabled' } : {}),
          ...(patch.preferences !== undefined ? { preferencesJson: JSON.stringify(patch.preferences) } : {})
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

  async shareAgent(agentId: string, grantedByUserId: string, input: ShareAgentInput): Promise<void> {
    await this.db.accessGrant.create({
      data: {
        grantedByUserId,
        granteeUserId: input.granteeUserId,
        resourceType: 'agent',
        resourceId: agentId,
        permission: input.permission,
        agentId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });
  }

  async listAgentShares(agentId: string): Promise<AgentShareRecord[]> {
    const rows = await this.db.accessGrant.findMany({
      where: {
        resourceType: 'agent',
        resourceId: agentId,
        granteeUserId: { not: null }
      },
      select: {
        id: true,
        grantedByUserId: true,
        granteeUserId: true,
        permission: true,
        expiresAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return rows.map((row) => ({
      id: row.id,
      grantedByUserId: row.grantedByUserId,
      granteeUserId: row.granteeUserId as string,
      permission: row.permission as AgentShareRecord['permission'],
      expiresAt: row.expiresAt,
      createdAt: row.createdAt
    }));
  }

  async revokeAgentShare(agentId: string, grantId: string): Promise<void> {
    const result = await this.db.accessGrant.deleteMany({
      where: {
        id: grantId,
        resourceType: 'agent',
        resourceId: agentId
      }
    });
    if (result.count === 0) {
      throw new Error('not_found');
    }
  }

  async publishAgent(agentId: string, publisherUserId: string, input: PublishAgentInput): Promise<MarketplaceAgentListItem> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new Error('not_found');
    }

    const existing = await this.db.marketplacePublication.findFirst({
      where: { resourceType: 'agent', resourceId: agentId, retiredAt: null }
    });

    const publication = existing
      ? await this.db.marketplacePublication.update({
          where: { id: existing.id },
          data: {
            publisherUserId,
            title: input.title,
            summary: input.summary ?? '',
            visibility: input.visibility ?? 'public',
            status: 'published',
            publishedAt: new Date(),
            retiredAt: null
          }
        })
      : await this.db.marketplacePublication.create({
          data: {
            publisherUserId,
            resourceType: 'agent',
            resourceId: agentId,
            agentId,
            title: input.title,
            summary: input.summary ?? '',
            visibility: input.visibility ?? 'public',
            status: 'published',
            publishedAt: new Date()
          }
        });

    return {
      publicationId: publication.id,
      agentId,
      publisherUserId: publication.publisherUserId,
      title: publication.title,
      summary: publication.summary,
      visibility: publication.visibility as MarketplaceAgentListItem['visibility'],
      publishedAt: publication.publishedAt ?? new Date(),
      agent
    };
  }

  async unpublishAgent(agentId: string): Promise<void> {
    const publication = await this.db.marketplacePublication.findFirst({
      where: {
        resourceType: 'agent',
        resourceId: agentId,
        status: 'published',
        retiredAt: null
      }
    });

    if (!publication) {
      throw new Error('not_found');
    }

    await this.db.marketplacePublication.update({
      where: { id: publication.id },
      data: { status: 'draft', retiredAt: new Date() }
    });
  }

  async listMarketplaceAgents(): Promise<MarketplaceAgentListItem[]> {
    const rows = await this.db.marketplacePublication.findMany({
      where: {
        resourceType: 'agent',
        status: 'published',
        visibility: 'public',
        retiredAt: null
      },
      include: {
        agent: {
          include: {
            sources: true,
            schedules: { orderBy: { createdAt: 'desc' }, take: 1 }
          }
        }
      },
      orderBy: { publishedAt: 'desc' }
    });

    return rows
      .filter((row) => row.agent && row.publishedAt)
      .map((row) => ({
        publicationId: row.id,
        agentId: row.resourceId,
        publisherUserId: row.publisherUserId,
        title: row.title,
        summary: row.summary,
        visibility: row.visibility as MarketplaceAgentListItem['visibility'],
        publishedAt: row.publishedAt as Date,
        agent: mapAgent(row.agent)
      }));
  }

  async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<CloneAgentResult> {
    const publication = await this.db.marketplacePublication.findFirst({
      where: {
        id: publicationId,
        resourceType: 'agent',
        status: 'published',
        visibility: 'public',
        retiredAt: null
      },
      include: {
        agent: {
          include: {
            sources: true,
            schedules: { orderBy: { createdAt: 'desc' }, take: 1 }
          }
        }
      }
    });
    if (!publication?.agent) {
      throw new Error('not_found');
    }

    const existing = await this.db.agent.findFirst({
      where: {
        ownerUserId: targetOwnerUserId,
        name: publication.agent.name
      },
      include: {
        sources: true,
        schedules: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    if (existing) {
      return { agent: mapAgent(existing), cloned: false };
    }

    const latestSchedule = publication.agent.schedules?.[0];
    const now = new Date();
    const cloned = await this.db.agent.create({
      data: {
        ownerUserId: targetOwnerUserId,
        name: publication.agent.name,
        description: publication.agent.description ?? '',
        characterType: publication.agent.characterType ?? DEFAULT_CHARACTER_TYPE,
        promptConfigJson: publication.agent.promptConfigJson ?? '{}',
        status: publication.agent.status ?? 'active',
        preferencesJson: publication.agent.preferencesJson ?? '{}',
        sources: {
          create: (publication.agent.sources ?? []).map((source: any) => ({
            type: source.type,
            value: source.value,
            frequencyMinutes: source.frequencyMinutes ?? 60,
            maxItems: source.maxItems ?? 1
          }))
        },
        ...(latestSchedule
          ? {
              schedules: {
                create: {
                  mode: latestSchedule.mode,
                  intervalMinutes: latestSchedule.intervalMinutes,
                  dailyTime: latestSchedule.dailyTime,
                  timezone: latestSchedule.timezone,
                  daysOfWeekJson: latestSchedule.daysOfWeekJson,
                  nextRunAt: scheduleFromRow(latestSchedule) ? computeNextRun(scheduleFromRow(latestSchedule)!, now) : now,
                  enabled: latestSchedule.enabled ?? true
                }
              }
            }
          : {})
      },
      include: {
        sources: true,
        schedules: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    return { agent: mapAgent(cloned), cloned: true };
  }
}
