import type { AgentRepositoryLike } from './routes';
import { DEFAULT_CHARACTER_TYPE } from './types';
import type { Agent, AgentListItem, CreateAgentInput, CreateAgentVersionInput, PromptConfig, RecentRun } from './types';

function deriveAgentName(characterType: string, personality?: string): string {
  const character = characterType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
  return `${personality?.trim() || character} · ${character}`;
}

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
  private agentVersions = new Map<string, { id: string; agentId: string; version: number; model: string; systemPrompt: string; name: string; description: string; characterType: string; promptConfig: PromptConfig; iconAssetKey: string | null; basedOnAgentVersionId?: string | null }[]>();
  private savedVersions = new Map<string, Set<string>>();
  private nextVersionId = 1;

  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    const id = `agent-${this.agents.size + 1}`;
    const characterType = input.characterType ?? DEFAULT_CHARACTER_TYPE;
    const promptConfig = input.promptConfig ?? {};
    const agent: Agent = {
      id,
      ownerUserId,
      name: deriveAgentName(characterType, promptConfig.personality_label ?? promptConfig.personality_id),
      description: input.description ?? '',
      characterType,
      promptConfig,
      status: input.active === false ? 'disabled' : 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: (input.sources ?? []).map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60, maxItems: s.maxItems ?? 1 })),
      preferences: input.preferences ?? {},
      schedule: null
    };
    this.agents.set(id, agent);
    return agent;
  }

  async updateAgent(agentId: string, patch: Partial<CreateAgentInput>): Promise<Agent> {
    const existing = this.agents.get(agentId);
    if (!existing) throw new Error('not_found');

    // If execution fields are being changed, create a new immutable version and update identity fields only
    if (patch.characterType !== undefined || patch.promptConfig !== undefined) {
      // Disallow when there's a public publication
      const publication = [...this.publications.values()].find((p) => p.agentId === agentId && p.visibility === 'public' && p.retiredAt === null);
      if (publication) throw new Error('immutable_agent_version');

      const versions = this.agentVersions.get(agentId) ?? [];
      const latest = versions.length > 0 ? versions[versions.length - 1] : undefined;
      const latestPromptConfig = latest?.promptConfig ?? {};
      const latestCharacterType = latest?.characterType ?? existing.characterType;

      const characterType = patch.characterType ?? latestCharacterType;
      const promptConfig = patch.promptConfig ?? latestPromptConfig;

      const name = patch.name !== undefined ? (patch.name || '') : latest?.name ?? deriveAgentName(characterType, promptConfig.personality_label ?? promptConfig.personality_id);
      const description = patch.description !== undefined ? patch.description : latest?.description ?? existing.description;

      // Create a new version representing the execution change
      await this.createAgentVersion(agentId, {
        name,
        description,
        characterType: characterType,
        promptConfig: promptConfig,
        model: latest?.model ?? '',
        systemPrompt: latest?.systemPrompt ?? '',
        iconAssetKey: latest?.iconAssetKey ?? null,
        basedOnAgentVersionId: latest?.id ?? null
      } as CreateAgentVersionInput);

      // Update identity/status fields only on the agent row
      const updated: Agent = {
        ...existing,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        description: patch.description !== undefined ? patch.description : existing.description,
        status: patch.active !== undefined ? (patch.active ? 'active' : 'disabled') : existing.status,
        sources: patch.sources ? patch.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60, maxItems: s.maxItems ?? 1 })) : existing.sources,
        preferences: patch.preferences ?? existing.preferences,
        schedule: existing.schedule,
        updatedAt: new Date()
      };
      this.agents.set(agentId, updated);
      return updated;
    }

    // Non-execution-field updates simply update the agent row
    const characterType = patch.characterType ?? existing.characterType;
    const promptConfig = patch.promptConfig ?? existing.promptConfig;
    const updated: Agent = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : deriveAgentName(characterType, promptConfig.personality_label ?? promptConfig.personality_id),
      description: patch.description ?? existing.description,
      characterType,
      promptConfig,
      status: patch.active !== undefined ? (patch.active ? 'active' : 'disabled') : existing.status,
      sources: patch.sources ? patch.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60, maxItems: s.maxItems ?? 1 })) : existing.sources,
      preferences: patch.preferences ?? existing.preferences,
      schedule: existing.schedule,
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
      preferences: source.preferences
    });
    return { agent: cloned, cloned: true };
  }

  async createAgentVersion(agentId: string, input: CreateAgentVersionInput): Promise<{ id: string; agentId: string; version: number }> {
    if (!this.agents.has(agentId)) throw new Error('not_found');
    const versions = this.agentVersions.get(agentId) ?? [];
    const nextVersion = (versions.length > 0 ? versions[versions.length - 1].version : 0) + 1;
    const id = `version-${this.nextVersionId++}`;
    const v = {
      id,
      agentId,
      version: nextVersion,
      model: input.model,
      systemPrompt: input.systemPrompt,
      name: input.name,
      description: input.description ?? '',
      characterType: input.characterType,
      promptConfig: input.promptConfig ?? {},
      iconAssetKey: input.iconAssetKey ?? null,
      basedOnAgentVersionId: input.basedOnAgentVersionId ?? null
    };
    versions.push(v);
    this.agentVersions.set(agentId, versions);
    return { id: v.id, agentId: v.agentId, version: v.version };
  }

  async saveAgentVersion(userId: string, agentVersionId: string): Promise<void> {
    // Locate the version and its agent
    let found: { id: string; agentId: string } | undefined;
    for (const versions of this.agentVersions.values()) {
      const v = versions.find((vv) => vv.id === agentVersionId);
      if (v) {
        found = v;
        break;
      }
    }
    if (!found) throw new Error('not_found');
    const agent = this.agents.get(found.agentId);
    if (!agent) throw new Error('not_found');

    const isOwner = agent.ownerUserId === userId;
    const publication = [...this.publications.values()].find((p) => p.agentId === found!.agentId && p.visibility === 'public' && p.retiredAt === null);
    const isPublic = !!publication;

    // Fail closed: only owner or public publications may be saved
    if (!isOwner && !isPublic) throw new Error('not_found');

    const set = this.savedVersions.get(userId) ?? new Set<string>();
    set.add(agentVersionId);
    this.savedVersions.set(userId, set);
  }

  async removeSavedAgentVersion(userId: string, agentVersionId: string): Promise<void> {
    const set = this.savedVersions.get(userId);
    if (!set || !set.has(agentVersionId)) throw new Error('not_found');
    set.delete(agentVersionId);
  }
}

