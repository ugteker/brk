import type { PrismaClient } from '@prisma/client';
import { computeNextRun } from '../schedules/compute-next-run';
import type {
  ClonePlaybookResult,
  CreatePlaybookInput,
  MarketplacePlaybookListItem,
  Playbook,
  PlaybookScheduleInput,
  PublishPlaybookInput,
  SharePlaybookInput,
  UpdatePlaybookInput
} from './types';
import type { RealtimeEventWriter } from '../realtime/types';

type PlaybookDb = Pick<PrismaClient, 'playbook' | 'playbookSource' | 'accessGrant' | 'marketplacePublication' | 'agent' | 'source' | 'realtimeEvent' | '$transaction'>;

/** Used when a caller doesn't wire a real RealtimeEventWriter (e.g. legacy tests); keeps
 * mutation behavior identical while emitting no realtime events. */
const noopRealtimeEventWriter: RealtimeEventWriter = { append: async () => {} };

function scheduleFromRow(row: any): PlaybookScheduleInput {
  if (row.mode === 'weekly') {
    return {
      mode: 'weekly',
      daysOfWeek: row.daysOfWeekJson ? JSON.parse(row.daysOfWeekJson) : [],
      dailyTime: row.dailyTime ?? '07:30',
      timezone: row.timezone ?? 'UTC'
    };
  }
  if (row.mode === 'daily') {
    return {
      mode: 'daily',
      dailyTime: row.dailyTime ?? '07:30',
      timezone: row.timezone ?? 'UTC'
    };
  }
  return {
    mode: 'interval',
    intervalMinutes: row.intervalMinutes ?? 60
  };
}

function schedulePatchData(schedule: PlaybookScheduleInput, now: Date) {
  return {
    mode: schedule.mode,
    intervalMinutes: schedule.mode === 'interval' ? schedule.intervalMinutes : null,
    dailyTime: schedule.mode === 'daily' || schedule.mode === 'weekly' ? schedule.dailyTime : null,
    timezone: schedule.mode === 'daily' || schedule.mode === 'weekly' ? schedule.timezone : null,
    daysOfWeekJson: schedule.mode === 'weekly' ? JSON.stringify(schedule.daysOfWeek) : null,
    nextRunAt: computeNextRun(schedule, now)
  };
}

function parseRecipients(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mapPlaybook(row: any): Playbook {
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    description: row.description ?? '',
    enabled: row.enabled,
    notificationsEnabled: row.notificationsEnabled ?? true,
    digestFrequency: row.digestFrequency ?? 'immediate',
    lastDigestSentAt: row.lastDigestSentAt ?? null,
    schedule: scheduleFromRow(row),
    sourceIds: (row.sources ?? []).map((sourceRow: any) => sourceRow.sourceId),
    recipients: parseRecipients(row.recipientsJson),
    executionMode: row.executionMode,
    maxSourcesPerRun: row.maxSourcesPerRun,
    maxItemsPerSource: row.maxItemsPerSource,
    followTargetType: row.followTargetType ?? null,
    followTargetKey: row.followTargetKey ?? null,
    followTargetTitle: row.followTargetTitle ?? null,
    language: row.language ?? 'en',
    lastRunAt: row.agent?.runs?.[0]?.createdAt ?? null,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export interface PlaybookRepositoryLike {
  createPlaybook(ownerUserId: string, input: CreatePlaybookInput): Promise<Playbook>;
  listPlaybooks(ownerUserId?: string): Promise<Playbook[]>;
  getPlaybook(playbookId: string): Promise<Playbook | null>;
  updatePlaybook(playbookId: string, patch: UpdatePlaybookInput): Promise<Playbook>;
  deletePlaybook(playbookId: string): Promise<void>;
  markExecuted(playbookId: string): Promise<void>;
  sharePlaybook(playbookId: string, grantedByUserId: string, input: SharePlaybookInput): Promise<void>;
  publishPlaybook(playbookId: string, publisherUserId: string, input: PublishPlaybookInput): Promise<MarketplacePlaybookListItem>;
  unpublishPlaybook(playbookId: string): Promise<void>;
  listMarketplacePlaybooks(): Promise<MarketplacePlaybookListItem[]>;
  cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<ClonePlaybookResult>;
}

export class PlaybookRepository implements PlaybookRepositoryLike {
  constructor(
    private readonly db: PlaybookDb,
    private readonly realtime: RealtimeEventWriter = noopRealtimeEventWriter
  ) {}

  async createPlaybook(_ownerUserId: string, input: CreatePlaybookInput): Promise<Playbook> {
    const now = new Date();
    const schedule = input.schedule ?? { mode: 'interval', intervalMinutes: 60 };
    const created = await this.db.playbook.create({
      data: {
        agentId: input.agentId,
        name: input.name,
        description: input.description ?? '',
        enabled: input.enabled ?? true,
        recipientsJson: JSON.stringify(input.recipients ?? []),
        executionMode: input.executionMode ?? 'latest_only',
        maxSourcesPerRun: input.maxSourcesPerRun ?? 3,
        maxItemsPerSource: input.maxItemsPerSource ?? 1,
        followTargetType: input.followTargetType ?? null,
        followTargetKey: input.followTargetKey ?? null,
        followTargetTitle: input.followTargetTitle ?? null,
        language: input.language ?? 'en',
        ...schedulePatchData(schedule, now),
        sources: {
          create: input.sourceIds.map((sourceId, index) => ({
            sourceId,
            enabled: true,
            position: index
          }))
        }
      },
      include: {
        sources: { orderBy: { position: 'asc' } },
        agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
      }
    });
    return mapPlaybook(created);
  }

  async listPlaybooks(ownerUserId?: string): Promise<Playbook[]> {
    const rows = await this.db.playbook.findMany({
      where: ownerUserId ? { agent: { ownerUserId } } : {},
      include: {
        sources: { orderBy: { position: 'asc' } },
        agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return rows.map((row) => mapPlaybook(row));
  }

  async getPlaybook(playbookId: string): Promise<Playbook | null> {
    const row = await this.db.playbook.findUnique({
      where: { id: playbookId },
      include: {
        sources: { orderBy: { position: 'asc' } },
        agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
      }
    });
    return row ? mapPlaybook(row) : null;
  }

  async updatePlaybook(playbookId: string, patch: UpdatePlaybookInput): Promise<Playbook> {
    const now = new Date();
    const updated = await this.db.$transaction(async (tx: any) => {
      if (patch.sourceIds) {
        await tx.playbookSource.deleteMany({ where: { playbookId } });
        if (patch.sourceIds.length > 0) {
          await tx.playbookSource.createMany({
            data: patch.sourceIds.map((sourceId, index) => ({
              playbookId,
              sourceId,
              enabled: true,
              position: index
            }))
          });
        }
      }

      return tx.playbook.update({
        where: { id: playbookId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          ...(patch.notificationsEnabled !== undefined ? { notificationsEnabled: patch.notificationsEnabled } : {}),
          ...(patch.digestFrequency !== undefined ? { digestFrequency: patch.digestFrequency } : {}),
          ...(patch.executionMode !== undefined ? { executionMode: patch.executionMode } : {}),
          ...(patch.maxSourcesPerRun !== undefined ? { maxSourcesPerRun: patch.maxSourcesPerRun } : {}),
          ...(patch.maxItemsPerSource !== undefined ? { maxItemsPerSource: patch.maxItemsPerSource } : {}),
          ...(patch.followTargetType !== undefined ? { followTargetType: patch.followTargetType } : {}),
          ...(patch.followTargetKey !== undefined ? { followTargetKey: patch.followTargetKey } : {}),
          ...(patch.followTargetTitle !== undefined ? { followTargetTitle: patch.followTargetTitle } : {}),
          ...(patch.language !== undefined ? { language: patch.language } : {}),
          ...(patch.recipients !== undefined ? { recipientsJson: JSON.stringify(patch.recipients) } : {}),
          ...(patch.schedule ? schedulePatchData(patch.schedule, now) : {})
        },
        include: {
          sources: { orderBy: { position: 'asc' } },
          agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
        }
      });
    });
    return mapPlaybook(updated);
  }

  async deletePlaybook(playbookId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      await tx.playbookSource.deleteMany({ where: { playbookId } });
      await tx.playbook.delete({ where: { id: playbookId } });
    });
  }

  async markExecuted(playbookId: string): Promise<void> {
    const existing = await this.getPlaybook(playbookId);
    if (!existing) {
      throw new Error('not_found');
    }
    await this.db.playbook.update({
      where: { id: playbookId },
      data: { nextRunAt: computeNextRun(existing.schedule, new Date()) }
    });
  }

  async sharePlaybook(playbookId: string, grantedByUserId: string, input: SharePlaybookInput): Promise<void> {
    await this.db.accessGrant.create({
      data: {
        grantedByUserId,
        granteeUserId: input.granteeUserId,
        resourceType: 'playbook',
        resourceId: playbookId,
        permission: input.permission,
        playbookId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
      }
    });
  }

  async publishPlaybook(playbookId: string, publisherUserId: string, input: PublishPlaybookInput): Promise<MarketplacePlaybookListItem> {
    return this.db.$transaction(async (tx: any) => {
      const row = await tx.playbook.findUnique({
        where: { id: playbookId },
        include: {
          sources: { orderBy: { position: 'asc' } },
          agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
        }
      });
      if (!row) {
        throw new Error('not_found');
      }
      const playbook = mapPlaybook(row);
      const agent = await tx.agent.findUnique({ where: { id: playbook.agentId } });

      const existing = await tx.marketplacePublication.findFirst({
        where: { resourceType: 'playbook', resourceId: playbookId, retiredAt: null }
      });

      const publication = existing
        ? await tx.marketplacePublication.update({
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
        : await tx.marketplacePublication.create({
            data: {
              publisherUserId,
              resourceType: 'playbook',
              resourceId: playbookId,
              playbookId,
              title: input.title,
              summary: input.summary ?? '',
              visibility: input.visibility ?? 'public',
              status: 'published',
              publishedAt: new Date()
            }
          });

      if (agent) {
        await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'marketplace.changed', entityId: publication.id });
      }

      return {
        publicationId: publication.id,
        playbookId,
        publisherUserId: publication.publisherUserId,
        title: publication.title,
        summary: publication.summary,
        visibility: publication.visibility as MarketplacePlaybookListItem['visibility'],
        publishedAt: publication.publishedAt ?? new Date(),
        playbook
      };
    });
  }

  async unpublishPlaybook(playbookId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const row = await tx.playbook.findUnique({ where: { id: playbookId } });
      if (!row) {
        throw new Error('not_found');
      }
      const publication = await tx.marketplacePublication.findFirst({
        where: {
          resourceType: 'playbook',
          resourceId: playbookId,
          status: 'published',
          retiredAt: null
        }
      });
      if (!publication) {
        throw new Error('not_found');
      }
      await tx.marketplacePublication.update({
        where: { id: publication.id },
        data: {
          status: 'draft',
          retiredAt: new Date()
        }
      });

      const agent = await tx.agent.findUnique({ where: { id: row.agentId } });
      if (agent) {
        await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'marketplace.changed', entityId: publication.id });
      }
    });
  }

  async listMarketplacePlaybooks(): Promise<MarketplacePlaybookListItem[]> {
    const rows = await this.db.marketplacePublication.findMany({
      where: {
        resourceType: 'playbook',
        status: 'published',
        visibility: 'public',
        retiredAt: null
      },
      include: {
        playbook: {
          include: {
            sources: { orderBy: { position: 'asc' } },
            agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
          }
        }
      },
      orderBy: { publishedAt: 'desc' }
    });

    return rows
      .filter((row) => row.playbook && row.publishedAt)
      .map((row) => ({
        publicationId: row.id,
        playbookId: row.resourceId,
        publisherUserId: row.publisherUserId,
        title: row.title,
        summary: row.summary,
        visibility: row.visibility as MarketplacePlaybookListItem['visibility'],
        publishedAt: row.publishedAt as Date,
        playbook: mapPlaybook(row.playbook)
      }));
  }

  async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string): Promise<ClonePlaybookResult> {
    return this.db.$transaction(async (tx: any) => {
      const publication = await tx.marketplacePublication.findFirst({
        where: {
          id: publicationId,
          resourceType: 'playbook',
          status: 'published',
          visibility: 'public',
          retiredAt: null
        },
        include: {
          playbook: { include: { sources: { orderBy: { position: 'asc' } } } }
        }
      });
      if (!publication?.playbook) {
        throw new Error('not_found');
      }

      const agent = await tx.agent.findUnique({
        where: { id: publication.playbook.agentId },
        include: {
          sources: true
        }
      });
      if (!agent) {
        throw new Error('not_found');
      }

      const targetAgent = await tx.agent.findFirst({
        where: {
          ownerUserId: targetOwnerUserId,
          name: agent.name
        },
        include: {
          sources: true
        }
      });

      const resolvedAgent =
        targetAgent ??
        (await tx.agent.create({
          data: {
            ownerUserId: targetOwnerUserId,
            name: agent.name,
            description: agent.description,
            characterType: agent.characterType,
            promptConfigJson: agent.promptConfigJson,
            status: agent.status,
            preferencesJson: agent.preferencesJson,
            sources: {
              create: (agent.sources ?? []).map((source: any) => ({
                type: source.type,
                value: source.value,
                frequencyMinutes: source.frequencyMinutes,
                maxItems: source.maxItems,
                enabled: source.enabled
              }))
            }
          },
          include: {
            sources: true
          }
        }));

      const sourceIdMap = new Map<string, string>();
      for (const sourceRow of publication.playbook.sources) {
        const source = await tx.source.findUnique({ where: { id: sourceRow.sourceId } });
        if (!source) {
          throw new Error('not_found');
        }

        const existingTargetSource = await tx.source.findFirst({
          where: {
            ownerUserId: targetOwnerUserId,
            type: source.type,
            value: source.value
          }
        });

        const resolvedSource =
          existingTargetSource ??
          (await tx.source.create({
            data: {
              ownerUserId: targetOwnerUserId,
              type: source.type,
              value: source.value,
              status: source.status,
              configJson: source.configJson
            }
          }));

        sourceIdMap.set(sourceRow.sourceId, resolvedSource.id);
      }

      const existing = await tx.playbook.findFirst({
        where: {
          agent: { ownerUserId: targetOwnerUserId },
          agentId: resolvedAgent.id,
          name: publication.playbook.name
        },
        include: {
          sources: { orderBy: { position: 'asc' } },
          agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
        }
      });
      if (existing) {
        return { playbook: mapPlaybook(existing), cloned: false };
      }

      const created = await tx.playbook.create({
        data: {
          agentId: resolvedAgent.id,
          name: publication.playbook.name,
          description: publication.playbook.description,
          mode: publication.playbook.mode,
          intervalMinutes: publication.playbook.intervalMinutes,
          dailyTime: publication.playbook.dailyTime,
          timezone: publication.playbook.timezone,
          daysOfWeekJson: publication.playbook.daysOfWeekJson,
          nextRunAt: publication.playbook.nextRunAt,
          enabled: publication.playbook.enabled,
          executionMode: publication.playbook.executionMode,
          maxSourcesPerRun: publication.playbook.maxSourcesPerRun,
          maxItemsPerSource: publication.playbook.maxItemsPerSource,
          followTargetType: publication.playbook.followTargetType,
          followTargetKey: publication.playbook.followTargetKey,
          followTargetTitle: publication.playbook.followTargetTitle,
          recipientsJson: publication.playbook.recipientsJson ?? '[]',
          sources: {
            create: publication.playbook.sources.map((sourceRow: any) => ({
              sourceId: sourceIdMap.get(sourceRow.sourceId) ?? sourceRow.sourceId,
              enabled: sourceRow.enabled,
              position: sourceRow.position
            }))
          }
        },
        include: {
          sources: { orderBy: { position: 'asc' } },
          agent: { select: { runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } }
        }
      });

      await this.realtime.append(tx, { userId: targetOwnerUserId, topic: 'marketplace.changed', entityId: publicationId });

      return { playbook: mapPlaybook(created), cloned: true };
    });
  }
}
