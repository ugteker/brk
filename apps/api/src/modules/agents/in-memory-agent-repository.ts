import type { AgentRepositoryLike } from './routes';
import { DEFAULT_CHARACTER_TYPE } from './types';
import type { Agent, AgentListItem, CreateAgentInput, RecentRun } from './types';

export class InMemoryAgentRepository implements AgentRepositoryLike {
  private agents = new Map<string, Agent>();
  private runs: RecentRun[] = [];
  private grants = new Map<string, { id: string; grantedByUserId: string; granteeUserId: string; permission: 'read' | 'edit' | 'delete'; expiresAt: Date | null; createdAt: Date }[]>();
  private publications = new Map<
    string,
    {
      publicationId: string;
      agentId: string;
      publisherUserId: string;
      title: string;
      summary: string;
      visibility: 'public' | 'private';
      publishedAt: Date;
      retiredAt: Date | null;
    }
  >();
  private nextGrantId = 1;
  private nextPublicationId = 1;

  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    const id = `agent-${this.agents.size + 1}`;
    const agent: Agent = {
      id,
      ownerUserId,
      name: input.name,
      description: input.description ?? '',
      characterType: input.characterType ?? DEFAULT_CHARACTER_TYPE,
      promptConfig: input.promptConfig ?? {},
      status: input.active === false ? 'disabled' : 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: (input.sources ?? []).map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60, maxItems: s.maxItems ?? 1 })),
      preferences: input.preferences ?? {},
      schedule: input.schedule ?? null
    };
    this.agents.set(id, agent);
    return agent;
  }

  async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
    const existing = this.agents.get(agentId);
    if (!existing) throw new Error('not_found');
    const updated: Agent = {
      ...existing,
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      characterType: patch.characterType ?? existing.characterType,
      promptConfig: patch.promptConfig ?? existing.promptConfig,
      status: patch.active !== undefined ? (patch.active ? 'active' : 'disabled') : existing.status,
      sources: patch.sources
        ? patch.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60, maxItems: s.maxItems ?? 1 }))
        : existing.sources,
      preferences: patch.preferences ?? existing.preferences,
      schedule: patch.schedule ?? existing.schedule,
      updatedAt: new Date()
    };
    this.agents.set(agentId, updated);
    return updated;
  }

  async disableAgent(agentId: string): Promise<void> {
    const existing = this.agents.get(agentId);
    if (!existing) throw new Error('not_found');
    this.agents.set(agentId, { ...existing, status: 'disabled', updatedAt: new Date() });
  }

  async enableAgent(agentId: string): Promise<void> {
    const existing = this.agents.get(agentId);
    if (!existing) throw new Error('not_found');
    this.agents.set(agentId, { ...existing, status: 'active', updatedAt: new Date() });
  }

  async deleteAgent(agentId: string): Promise<void> {
    const existing = this.agents.get(agentId);
    if (!existing) throw new Error('not_found');
    this.agents.delete(agentId);
  }

  async listAgents(ownerUserId?: string): Promise<AgentListItem[]> {
    return [...this.agents.values()]
      .filter((agent) => (ownerUserId ? agent.ownerUserId === ownerUserId : true))
      .map((agent) => ({ ...agent, runCount: 0, reportCount: 0, latestReportAt: null }));
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.agents.get(agentId) ?? null;
  }

  /** Test helper: seed a synthetic recent run for `listRecentRuns` assertions. */
  seedRun(run: RecentRun): void {
    this.runs.push(run);
  }

  async listRecentRuns(ownerUserId: string, limit: number): Promise<RecentRun[]> {
    const ownedAgentIds = new Set(
      [...this.agents.values()].filter((agent) => agent.ownerUserId === ownerUserId).map((agent) => agent.id)
    );
    return this.runs
      .filter((run) => ownedAgentIds.has(run.agentId))
      .sort((a, b) => b.scheduledFor.getTime() - a.scheduledFor.getTime())
      .slice(0, limit);
  }

  async shareAgent(agentId: string, grantedByUserId: string, input: { granteeUserId: string; permission: 'read' | 'edit' | 'delete'; expiresAt?: string }): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('not_found');
    const existing = this.grants.get(agentId) ?? [];
    existing.push({
      id: `grant-${this.nextGrantId++}`,
      grantedByUserId,
      granteeUserId: input.granteeUserId,
      permission: input.permission,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdAt: new Date()
    });
    this.grants.set(agentId, existing);
  }

  async listAgentShares(agentId: string) {
    return [...(this.grants.get(agentId) ?? [])];
  }

  async revokeAgentShare(agentId: string, grantId: string): Promise<void> {
    const existing = this.grants.get(agentId) ?? [];
    const next = existing.filter((grant) => grant.id !== grantId);
    if (next.length === existing.length) throw new Error('not_found');
    this.grants.set(agentId, next);
  }

  async publishAgent(agentId: string, publisherUserId: string, input: { title: string; summary?: string; visibility?: 'public' | 'private' }) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('not_found');
    const existing = [...this.publications.values()].find((publication) => publication.agentId === agentId);
    const publication = {
      publicationId: existing?.publicationId ?? `publication-${this.nextPublicationId++}`,
      agentId,
      publisherUserId,
      title: input.title,
      summary: input.summary ?? '',
      visibility: input.visibility ?? 'public',
      publishedAt: new Date(),
      retiredAt: null
    };
    this.publications.set(publication.publicationId, publication);
    return { ...publication, agent };
  }

  async unpublishAgent(agentId: string): Promise<void> {
    const publication = [...this.publications.values()].find((row) => row.agentId === agentId && row.retiredAt === null);
    if (!publication) throw new Error('not_found');
    this.publications.set(publication.publicationId, { ...publication, retiredAt: new Date() });
  }

  async listMarketplaceAgents() {
    return [...this.publications.values()]
      .filter((publication) => publication.visibility === 'public' && publication.retiredAt === null)
      .map((publication) => ({
        publicationId: publication.publicationId,
        agentId: publication.agentId,
        publisherUserId: publication.publisherUserId,
        title: publication.title,
        summary: publication.summary,
        visibility: publication.visibility,
        publishedAt: publication.publishedAt,
        agent: this.agents.get(publication.agentId)!
      }));
  }

  async cloneFromMarketplace(publicationId: string, targetOwnerUserId: string) {
    const publication = this.publications.get(publicationId);
    if (!publication || publication.retiredAt || publication.visibility !== 'public') throw new Error('not_found');
    const source = this.agents.get(publication.agentId);
    if (!source) throw new Error('not_found');
    const existing = [...this.agents.values()].find((agent) => agent.ownerUserId === targetOwnerUserId && agent.name === source.name);
    if (existing) return { agent: existing, cloned: false };
    const cloned = await this.createAgent(targetOwnerUserId, {
      name: source.name,
      description: source.description,
      characterType: source.characterType,
      promptConfig: source.promptConfig,
      active: source.status !== 'disabled',
      sources: source.sources,
      preferences: source.preferences,
      schedule: source.schedule ?? undefined
    });
    return { agent: cloned, cloned: true };
  }
}
