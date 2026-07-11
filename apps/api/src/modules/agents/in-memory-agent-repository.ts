import type { AgentRepositoryLike } from './routes';
import type { Agent, CreateAgentInput, RecentRun } from './types';

export class InMemoryAgentRepository implements AgentRepositoryLike {
  private agents = new Map<string, Agent>();
  private runs: RecentRun[] = [];

  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    const id = `agent-${this.agents.size + 1}`;
    const agent: Agent = {
      id,
      ownerUserId,
      name: input.name,
      description: input.description ?? '',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      sources: input.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 })),
      preferences: input.preferences ?? {},
      recipients: input.recipients ?? [],
      schedule: input.schedule
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
      sources: patch.sources
        ? patch.sources.map((s) => ({ ...s, frequencyMinutes: s.frequencyMinutes ?? 60 }))
        : existing.sources,
      preferences: patch.preferences ?? existing.preferences,
      recipients: patch.recipients ?? existing.recipients,
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

  async listAgents(ownerUserId: string): Promise<Agent[]> {
    return [...this.agents.values()].filter((agent) => agent.ownerUserId === ownerUserId);
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
}
