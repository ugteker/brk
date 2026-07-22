import type { PrismaClient } from '@prisma/client';
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
  ShareAgentInput
} from './types';
import type { RealtimeEventWriter } from '../realtime/types';

type AgentDb = Pick<
  PrismaClient,
  | 'agent'
  | 'agentSource'
  | 'agentRun'
  | 'agentPromptVersion'
  | 'agentRunArtifact'
  | 'agentRunReport'
  | 'agentSignal'
  | 'playbook'
  | 'accessGrant'
  | 'marketplacePublication'
  | 'realtimeEvent'
  | '$transaction'
>;
type SourceRow = { type: string; value: string; frequencyMinutes?: number; maxItems?: number };

/** Used when a caller doesn't wire a real RealtimeEventWriter (e.g. legacy tests); keeps
 * mutation behavior identical while emitting no realtime events. */
const noopRealtimeEventWriter: RealtimeEventWriter = { append: async () => {} };

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

function humanizeCharacterType(characterType: string): string {
  return characterType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function deriveAgentName(characterType: string, promptConfig: PromptConfig): string {
  const personality = promptConfig.personality_label?.trim() || promptConfig.personality_id?.trim() || humanizeCharacterType(characterType);
  return `${personality} · ${humanizeCharacterType(characterType)}`;
}

function mapAgent(row: any): Agent {
  const sourceRows = (row.sources ?? []) as SourceRow[];

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
    schedule: null
  };
}

export class AgentRepository {
  constructor(
    private readonly db: AgentDb,
    private readonly realtime: RealtimeEventWriter = noopRealtimeEventWriter
  ) {}

  async listAgents(ownerUserId?: string): Promise<AgentListItem[]> {
    const rows = await this.db.agent.findMany({
      where: ownerUserId ? { ownerUserId } : {},
      include: {
        sources: true,
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
      include: { sources: true }
    });
    if (!agent) return null;

    return mapAgent(agent);
  }

  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    const characterType = input.characterType ?? DEFAULT_CHARACTER_TYPE;
    const promptConfig = input.promptConfig ?? {};
    const created = await this.db.$transaction(async (tx: any) => {
      const created = await tx.agent.create({
        data: {
          ownerUserId,
          name: input.name && input.name.trim().length > 0 ? input.name.trim() : deriveAgentName(characterType, promptConfig),
          description: input.description ?? '',
          characterType,
          promptConfigJson: JSON.stringify(promptConfig),
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
            : {})
        },
        include: { sources: true }
      });
      await this.realtime.append(tx, { userId: ownerUserId, topic: 'agent.changed', entityId: created.id });
      return created;
    });

    return mapAgent(created);
  }

  async disableAgent(agentId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const updated = await tx.agent.update({
        where: { id: agentId },
        data: { status: 'disabled' }
      });
      await this.realtime.append(tx, { userId: updated.ownerUserId, topic: 'agent.changed', entityId: agentId });
    });
  }

  async enableAgent(agentId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const updated = await tx.agent.update({
        where: { id: agentId },
        data: { status: 'active' }
      });
      await this.realtime.append(tx, { userId: updated.ownerUserId, topic: 'agent.changed', entityId: agentId });
    });
  }

  async deleteAgent(agentId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const existing = await tx.agent.findUnique({ where: { id: agentId } });
      if (!existing) {
        throw new Error('not_found');
      }

      const reports = await tx.agentRunReport.findMany({ where: { agentId }, select: { id: true } });
      const reportIds = reports.map((r: { id: string }) => r.id);
      if (reportIds.length > 0) {
        await tx.agentSignal.deleteMany({ where: { agentRunReportId: { in: reportIds } } });
      }
      await tx.agentRunReport.deleteMany({ where: { agentId } });
      await tx.agentRunArtifact.deleteMany({ where: { agentId } });
      await tx.agentRun.deleteMany({ where: { agentId } });
      await tx.agentPromptVersion.deleteMany({ where: { agentId } });
      await tx.agentSource.deleteMany({ where: { agentId } });
      await tx.accessGrant.deleteMany({ where: { OR: [{ agentId }, { granteeAgentId: agentId }] } });

      // Clean up playbook children before deleting playbooks (all relations are onDelete: Restrict)
      const agentPlaybooks = await tx.playbook.findMany({ where: { agentId }, select: { id: true } });
      const playbookIds = agentPlaybooks.map((p: { id: string }) => p.id);
      if (playbookIds.length > 0) {
        await tx.playbookSource.deleteMany({ where: { playbookId: { in: playbookIds } } });
        await tx.accessGrant.deleteMany({ where: { playbookId: { in: playbookIds } } });
        await tx.marketplacePublication.deleteMany({ where: { playbookId: { in: playbookIds } } });
      }

      await tx.playbook.deleteMany({ where: { agentId } });
      await tx.agent.delete({ where: { id: agentId } });

      await this.realtime.append(tx, { userId: existing.ownerUserId, topic: 'agent.changed', entityId: agentId });
    });
  }

  async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
    const updated = await this.db.$transaction(async (tx: any) => {
      // Only touch the name/characterType/promptConfig when the patch explicitly includes
      // characterType or promptConfig; otherwise preserve the existing name to avoid
      // surprising renames when callers only toggle `active`.
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

      const data: any = {};
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.characterType !== undefined || patch.promptConfig !== undefined) {
        const characterType = patch.characterType ?? DEFAULT_CHARACTER_TYPE;
        const promptConfig = patch.promptConfig ?? {};
        data.name = deriveAgentName(characterType, promptConfig);
        data.characterType = characterType;
        data.promptConfigJson = JSON.stringify(promptConfig);
      }
      if (patch.active !== undefined) data.status = patch.active ? 'active' : 'disabled';
      if (patch.preferences !== undefined) data.preferencesJson = JSON.stringify(patch.preferences);

      const changed = await tx.agent.update({
        where: { id: agentId },
        data,
        include: { sources: true }
      });
      await this.realtime.append(tx, { userId: changed.ownerUserId, topic: 'agent.changed', entityId: agentId });
      return changed;
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
    await this.db.$transaction(async (tx: any) => {
      const agent = await tx.agent.findUnique({ where: { id: agentId } });
      if (!agent) {
        throw new Error('not_found');
      }
      await tx.accessGrant.create({
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
      await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'agent.changed', entityId: agentId });
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
    return this.db.$transaction(async (tx: any) => {
      const agentRow = await tx.agent.findUnique({ where: { id: agentId }, include: { sources: true } });
      if (!agentRow) {
        throw new Error('not_found');
      }
      const agent = mapAgent(agentRow);

      const existing = await tx.marketplacePublication.findFirst({
        where: { resourceType: 'agent', resourceId: agentId, retiredAt: null }
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

      await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'agent.changed', entityId: agentId });
      await this.realtime.append(tx, { userId: agent.ownerUserId, topic: 'marketplace.changed', entityId: publication.id });

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
    });
  }

  async unpublishAgent(agentId: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const agentRow = await tx.agent.findUnique({ where: { id: agentId } });
      if (!agentRow) {
        throw new Error('not_found');
      }
      const publication = await tx.marketplacePublication.findFirst({
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

      await tx.marketplacePublication.update({
        where: { id: publication.id },
        data: { status: 'draft', retiredAt: new Date() }
      });

      await this.realtime.append(tx, { userId: agentRow.ownerUserId, topic: 'agent.changed', entityId: agentId });
      await this.realtime.append(tx, { userId: agentRow.ownerUserId, topic: 'marketplace.changed', entityId: publication.id });
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
            sources: true
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
    return this.db.$transaction(async (tx: any) => {
      const publication = await tx.marketplacePublication.findFirst({
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
              sources: true
            }
          }
        }
      });
      if (!publication?.agent) {
        throw new Error('not_found');
      }

      const existing = await tx.agent.findFirst({
        where: {
          ownerUserId: targetOwnerUserId,
          name: publication.agent.name
        },
        include: {
          sources: true
        }
      });
      if (existing) {
        return { agent: mapAgent(existing), cloned: false };
      }

      const cloned = await tx.agent.create({
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
          }
        },
        include: {
          sources: true
        }
      });

      await this.realtime.append(tx, { userId: targetOwnerUserId, topic: 'agent.changed', entityId: cloned.id });
      await this.realtime.append(tx, { userId: targetOwnerUserId, topic: 'marketplace.changed', entityId: publicationId });

      return { agent: mapAgent(cloned), cloned: true };
    });
  }
}
