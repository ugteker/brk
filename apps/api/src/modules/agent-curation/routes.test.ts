import { describe, expect, it } from 'vitest';
import { buildServer, type ServerDeps } from '../../server';
import { authCookieHeader, createTestAuthDeps } from '../../test-utils/auth';
import { ClaudeCurationResponseError } from '../analysis/claude-client';
import type { AccessDecision, AccessRequest } from '../access/types';
import type { DomainAccessResolver } from '../access/permissions';
import type { AgentRepositoryLike } from '../agents/routes';
import type {
  Agent,
  AgentListItem,
  AgentShareRecord,
  CloneAgentResult,
  CreateAgentInput,
  MarketplaceAgentListItem,
  PublishAgentInput,
  RecentRun,
  ShareAgentInput
} from '../agents/types';
import type { AgentCurationRepository } from './repository';
import { CurationGenerationError } from './service';
import { CurationSessionConflictError } from './types';
import type {
  AppendCurationMessageInput,
  ClaudeAgentCurationCompletion,
  ClaudeAgentCurationRequest,
  CreateCurationSessionInput,
  CurationDraft,
  CurationMessage,
  CurationReplyClaim,
  CurationSavedReply,
  CurationSession
} from './types';

type CurationRepositoryLike = Pick<
  AgentCurationRepository,
  | 'appendMessage'
  | 'claimReply'
  | 'createSession'
  | 'getReplyForRequest'
  | 'getSessionForOwner'
  | 'markCompleted'
  | 'recordFinalizationResult'
  | 'releaseReplyClaim'
  | 'releaseFinalization'
  | 'reserveFinalization'
  | 'saveReply'
>;

type CurationRouteTestDeps = {
  repository: CurationRepositoryLike;
  claudeClient: TestClaudeClient;
  model: string;
  accessResolver: Pick<DomainAccessResolver, 'resolve'>;
};

const readyDraft = (overrides: Partial<CurationDraft> = {}): CurationDraft => ({
  name: 'Market Watcher',
  description: 'Tracks the market with concise updates.',
  avatar: null,
  characterType: 'summarizer',
  systemPrompt: 'Summarize the selected market sources clearly.',
  completeness: 'ready_for_review',
  missingFields: [],
  ...overrides
});

function cloneDraft(draft: CurationDraft): CurationDraft {
  return {
    ...draft,
    missingFields: [...draft.missingFields],
    ...(draft.metadata ? { metadata: { userLockedFields: [...draft.metadata.userLockedFields] } } : {})
  };
}

function cloneSession(session: CurationSession): CurationSession {
  return {
    ...session,
    sourceContext: { ...session.sourceContext },
    draft: cloneDraft(session.draft),
    messages: session.messages.map((message) => ({ ...message }))
  };
}

class MemoryCurationRepository implements CurationRepositoryLike {
  private readonly sessions = new Map<string, CurationSession>();
  private readonly finalizationAgentIds = new Map<string, string>();
  private readonly userMessagesByRequestId = new Map<string, CurationMessage>();
  private readonly repliesByRequestId = new Map<string, CurationSavedReply>();
  private readonly replyClaims = new Set<string>();
  private sessionSequence = 0;
  private messageSequence = 0;
  nextSaveReplyError: Error | null = null;
  nextMarkCompletedError: Error | null = null;
  nextRecordFinalizationResultError: Error | null = null;
  constructor(readonly events: string[]) {}

  async createSession(ownerUserId: string, input: CreateCurationSessionInput): Promise<CurationSession> {
    const now = new Date('2026-07-23T10:00:00.000Z');
    const session: CurationSession = {
      id: `session-${++this.sessionSequence}`,
      ownerUserId,
      targetAgentId: input.targetAgentId ?? null,
      baseAgentVersionId: input.baseAgentVersionId ?? null,
      mode: input.mode,
      status: 'active',
      revision: 0,
      finalizationAgentId: null,
      sourceContext: { ...input.sourceContext },
      draft: cloneDraft(input.draft),
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  async appendMessage(sessionId: string, input: AppendCurationMessageInput): Promise<CurationMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('not_found');
    const clientRequestId = (input as AppendCurationMessageInput & { clientRequestId?: string }).clientRequestId;
    const requestKey = input.role === 'user' && clientRequestId ? `${sessionId}:${clientRequestId}` : null;
    const existing = requestKey ? this.userMessagesByRequestId.get(requestKey) : null;
    if (existing) return { ...existing };
    const message: CurationMessage = {
      id: `message-${++this.messageSequence}`,
      sessionId,
      role: input.role,
      content: input.content,
      ...(clientRequestId === undefined ? {} : { clientRequestId }),
      position: session.messages.length,
      createdAt: new Date('2026-07-23T10:01:00.000Z')
    };
    session.messages.push(message);
    if (requestKey) this.userMessagesByRequestId.set(requestKey, message);
    return { ...message };
  }

  async getSessionForOwner(sessionId: string, ownerUserId: string): Promise<CurationSession | null> {
    const session = this.sessions.get(sessionId);
    if (session?.ownerUserId !== ownerUserId) return null;
    return {
      ...cloneSession(session),
      finalizationAgentId: this.finalizationAgentIds.get(sessionId) ?? null
    };
  }

  async getReplyForRequest(sessionId: string, clientRequestId: string): Promise<CurationSavedReply | null> {
    const reply = this.repliesByRequestId.get(`${sessionId}:${clientRequestId}`);
    return reply ? { ...reply, draft: cloneDraft(reply.draft), suggestedReplies: [...reply.suggestedReplies] } : null;
  }

  async claimReply(sessionId: string, clientRequestId: string): Promise<CurationReplyClaim> {
    const key = `${sessionId}:${clientRequestId}`;
    const completed = await this.getReplyForRequest(sessionId, clientRequestId);
    if (completed) {
      return { status: 'completed', reply: completed };
    }
    if (this.replyClaims.has(key)) {
      return { status: 'in_progress' };
    }
    this.replyClaims.add(key);
    return { status: 'claimed' };
  }

  async releaseReplyClaim(sessionId: string, clientRequestId: string): Promise<void> {
    this.replyClaims.delete(`${sessionId}:${clientRequestId}`);
  }

  async saveDraft(sessionId: string, expectedRevision: number, draft: CurationDraft): Promise<CurationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('not_found');
    if (session.revision !== expectedRevision || session.status !== 'active') throw new CurationSessionConflictError();
    session.draft = cloneDraft(draft);
    session.revision += 1;
    session.updatedAt = new Date('2026-07-23T10:02:00.000Z');
    this.events.push('session:save');
    return cloneSession(session);
  }

  async saveReply(
    sessionId: string,
    expectedRevision: number,
    assistantMessage: string,
    draft: CurationDraft,
    requestMessageId?: string,
    suggestedReplies: string[] = []
  ): Promise<CurationSession> {
    if (this.nextSaveReplyError) {
      const error = this.nextSaveReplyError;
      this.nextSaveReplyError = null;
      throw error;
    }
    const saved = await this.saveDraft(sessionId, expectedRevision, draft);
    const assistant = await this.appendMessage(sessionId, { role: 'assistant', content: assistantMessage });
    if (requestMessageId !== undefined) {
      const request = this.sessions.get(sessionId)?.messages.find((message) => message.id === requestMessageId);
      if (!request?.clientRequestId) throw new Error('not_found');
      const key = `${sessionId}:${request.clientRequestId}`;
      this.repliesByRequestId.set(key, {
        assistantMessage,
        draft: cloneDraft(draft),
        suggestedReplies: [...suggestedReplies],
        sessionRevision: saved.revision,
        assistantMessagePosition: assistant.position,
        sessionUpdatedAt: saved.updatedAt.toISOString()
      });
      this.replyClaims.delete(key);
    }
    return (await this.getSessionForOwner(saved.id, saved.ownerUserId))!;
  }

  async reserveFinalization(sessionId: string, expectedRevision: number, draft: CurationDraft): Promise<CurationSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('not_found');
    if (session.revision !== expectedRevision || session.status !== 'active') throw new CurationSessionConflictError();
    session.draft = cloneDraft(draft);
    session.revision += 1;
    session.status = 'finalizing';
    session.updatedAt = new Date('2026-07-23T10:02:00.000Z');
    this.events.push('session:reserve');
    return cloneSession(session);
  }

  async releaseFinalization(sessionId: string, expectedRevision: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('not_found');
    if (session.revision !== expectedRevision || session.status !== 'finalizing') throw new CurationSessionConflictError();
    session.status = 'active';
    this.finalizationAgentIds.delete(sessionId);
    session.updatedAt = new Date('2026-07-23T10:03:00.000Z');
    this.events.push('session:release');
  }

  async recordFinalizationResult(sessionId: string, expectedRevision: number, agentId: string): Promise<CurationSession> {
    if (this.nextRecordFinalizationResultError) {
      const error = this.nextRecordFinalizationResultError;
      this.nextRecordFinalizationResultError = null;
      throw error;
    }
    const session = this.sessions.get(sessionId);
    if (!session || session.revision !== expectedRevision || session.status !== 'finalizing' || this.finalizationAgentIds.has(sessionId)) {
      throw new CurationSessionConflictError();
    }
    this.finalizationAgentIds.set(sessionId, agentId);
    return (await this.getSessionForOwner(sessionId, session.ownerUserId))!;
  }

  async recordFinalizationHandoff(sessionId: string, expectedRevision: number, agentId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.revision !== expectedRevision || session.status !== 'finalizing' || this.finalizationAgentIds.has(sessionId)) {
      throw new CurationSessionConflictError();
    }
    this.finalizationAgentIds.set(sessionId, agentId);
  }

  async markCompleted(sessionId: string, expectedRevision: number): Promise<void> {
    if (this.nextMarkCompletedError) {
      const error = this.nextMarkCompletedError;
      this.nextMarkCompletedError = null;
      throw error;
    }
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('not_found');
    if (session.revision !== expectedRevision || session.status !== 'finalizing') throw new CurationSessionConflictError();
    session.status = 'completed';
    session.updatedAt = new Date('2026-07-23T10:04:00.000Z');
    this.events.push('session:complete');
  }

  sessionCount(): number {
    return this.sessions.size;
  }
}

class TestAgentRepository implements AgentRepositoryLike {
  private readonly agents = new Map<string, Agent>();
  private nextAgentNumber = 1;
  readonly createCalls: Array<{ ownerUserId: string; input: CreateAgentInput }> = [];
  readonly updateCalls: Array<{ agentId: string; patch: Partial<CreateAgentInput> }> = [];
  readonly events: string[];
  failOnDelete = false;

  constructor(
    events: string[],
    private readonly curationRepository: MemoryCurationRepository
  ) {
    this.events = events;
    this.agents.set('agent-seed-public', {
      id: 'agent-seed-public',
      ownerUserId: 'seed-owner',
      name: 'Public Market Analyst',
      description: 'Tracks public market coverage.',
      characterType: 'summarizer',
      promptConfig: {},
      status: 'active',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      updatedAt: new Date('2026-07-20T00:00:00.000Z'),
      sources: [],
      preferences: {},
      schedule: null
    });
  }

  async createAgent(ownerUserId: string, input: CreateAgentInput): Promise<Agent> {
    const agent: Agent = {
      id: `agent-${this.nextAgentNumber++}`,
      ownerUserId,
      name: input.name ?? 'Unnamed agent',
      description: input.description ?? '',
      characterType: input.characterType ?? 'summarizer',
      promptConfig: input.promptConfig ?? {},
      status: input.active === false ? 'disabled' : 'active',
      createdAt: new Date('2026-07-23T10:02:00.000Z'),
      updatedAt: new Date('2026-07-23T10:02:00.000Z'),
      sources: input.sources?.map((source) => ({
        ...source,
        frequencyMinutes: source.frequencyMinutes ?? 60,
        maxItems: source.maxItems ?? 1
      })) ?? [],
      preferences: input.preferences ?? {},
      schedule: null
    };
    this.agents.set(agent.id, agent);
    this.createCalls.push({ ownerUserId, input });
    this.events.push('agent:create');
    return agent;
  }

  async createFinalizedAgent(
    ownerUserId: string,
    input: CreateAgentInput,
    curationSessionId: string,
    expectedRevision: number
  ): Promise<Agent> {
    const agent = await this.createAgent(ownerUserId, input);
    await this.curationRepository.recordFinalizationHandoff(curationSessionId, expectedRevision, agent.id);
    return agent;
  }

  async updateFinalizedAgent(
    agentId: string,
    patch: CreateAgentInput,
    curationSessionId: string,
    expectedRevision: number
  ): Promise<Agent> {
    const agent = await this.updateAgent(agentId, patch);
    await this.curationRepository.recordFinalizationHandoff(curationSessionId, expectedRevision, agent.id);
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
      status: patch.active === undefined ? existing.status : patch.active ? 'active' : 'disabled',
      sources: patch.sources
        ? patch.sources.map((source) => ({
            ...source,
            frequencyMinutes: source.frequencyMinutes ?? 60,
            maxItems: source.maxItems ?? 1
          }))
        : existing.sources,
      preferences: patch.preferences ?? existing.preferences,
      updatedAt: new Date(existing.updatedAt.getTime() + 1_000)
    };
    this.agents.set(agentId, updated);
    this.updateCalls.push({ agentId, patch });
    this.events.push('agent:update');
    return updated;
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    return this.agents.get(agentId) ?? null;
  }

  async disableAgent(agentId: string): Promise<void> {
    await this.updateAgent(agentId, { active: false });
  }

  async enableAgent(agentId: string): Promise<void> {
    await this.updateAgent(agentId, { active: true });
  }

  async deleteAgent(agentId: string): Promise<void> {
    if (this.failOnDelete) throw new Error('agent_cleanup_unavailable');
    if (!this.agents.delete(agentId)) throw new Error('not_found');
  }

  async listAgents(): Promise<AgentListItem[]> {
    return [...this.agents.values()].map((agent) => ({ ...agent, runCount: 0, reportCount: 0, latestReportAt: null }));
  }

  async listRecentRuns(_ownerUserId: string, _limit: number): Promise<RecentRun[]> {
    return [];
  }

  async shareAgent(_agentId: string, _grantedByUserId: string, _input: ShareAgentInput): Promise<void> {}

  async listAgentShares(_agentId: string): Promise<AgentShareRecord[]> {
    return [];
  }

  async revokeAgentShare(_agentId: string, _grantId: string): Promise<void> {}

  async publishAgent(
    _agentId: string,
    _publisherUserId: string,
    _input: PublishAgentInput
  ): Promise<MarketplaceAgentListItem> {
    throw new Error('not_implemented');
  }

  async unpublishAgent(_agentId: string): Promise<void> {}

  async listMarketplaceAgents(): Promise<MarketplaceAgentListItem[]> {
    return [];
  }

  async cloneFromMarketplace(_publicationId: string, _targetOwnerUserId: string): Promise<CloneAgentResult> {
    throw new Error('not_implemented');
  }
}

class TestPromptRepository {
  failOnSave = false;
  readonly saves: Array<{ agentId: string; model: string; systemPrompt: string; enabled: boolean; basedOnAgentVersionId?: string | null }> = [];
  private readonly promptsByCurationSessionId = new Map<
    string,
    {
      id: string;
      agentId: string;
      version: number;
      model: string;
      systemPrompt: string;
      enabled: boolean;
      name: string;
      description: string;
      characterType: string;
      promptConfigJson: string;
      iconAssetKey: string | null;
      basedOnAgentVersionId: string | null;
      publishedAt: Date | null;
      createdAt: Date;
    }
  >();
  private readonly promptVersionsById = new Map<
    string,
    {
      id: string;
      agentId: string;
      version: number;
      model: string;
      systemPrompt: string;
      enabled: boolean;
      name: string;
      description: string;
      characterType: string;
      promptConfigJson: string;
      iconAssetKey: string | null;
      basedOnAgentVersionId: string | null;
      publishedAt: Date | null;
      createdAt: Date;
    }
  >();
  readonly events: string[];

  constructor(events: string[]) {
    this.events = events;
    this.promptVersionsById.set('public-version-1', {
      id: 'public-version-1',
      agentId: 'agent-seed-public',
      version: 4,
      model: 'claude-sonnet-4-5',
      systemPrompt: 'Summarize public market podcasts.',
      enabled: true,
      name: 'Public Market Analyst',
      description: 'Tracks public market coverage.',
      characterType: 'summarizer',
      promptConfigJson: '{}',
      iconAssetKey: 'market-analyst',
      basedOnAgentVersionId: null,
      publishedAt: new Date('2026-07-20T00:00:00.000Z'),
      createdAt: new Date('2026-07-20T00:00:00.000Z')
    });
  }

  async savePromptVersion(agentId: string, input: { model: string; systemPrompt: string; enabled: boolean; basedOnAgentVersionId?: string | null }) {
    if (this.failOnSave) throw new Error('prompt_store_unavailable');
    const saved = {
      id: `prompt-${this.saves.length + 1}`,
      agentId,
      version: this.saves.length + 1,
      ...input,
      name: '',
      description: '',
      characterType: 'summarizer',
      promptConfigJson: '{}',
      iconAssetKey: null,
      basedOnAgentVersionId: input.basedOnAgentVersionId ?? null,
      publishedAt: null,
      createdAt: new Date()
    };
    this.saves.push({
      agentId,
      model: input.model,
      systemPrompt: input.systemPrompt,
      enabled: input.enabled,
      ...(input.basedOnAgentVersionId ? { basedOnAgentVersionId: input.basedOnAgentVersionId } : {})
    });
    this.events.push('prompt:save');
    this.promptVersionsById.set(saved.id, saved);
    return saved;
  }

  async saveCuratedPromptVersion(
    agentId: string,
    input: { model: string; systemPrompt: string; enabled: boolean; basedOnAgentVersionId?: string | null },
    curationSessionId: string
  ) {
    const existing = this.promptsByCurationSessionId.get(curationSessionId);
    if (existing) {
      if (existing.agentId !== agentId) throw new Error('curation_prompt_agent_mismatch');
      return existing;
    }
    const saved = await this.savePromptVersion(agentId, input);
    this.promptsByCurationSessionId.set(curationSessionId, saved);
    return saved;
  }

  async getPromptVersionByCurationSessionId(curationSessionId: string) {
    return this.promptsByCurationSessionId.get(curationSessionId) ?? null;
  }

  async getPromptVersionById(agentVersionId: string) {
    return this.promptVersionsById.get(agentVersionId) ?? null;
  }

  async getLatestPromptVersion(): Promise<null> {
    return null;
  }
}

class TestClaudeClient {
  nextError: Error | null = null;

  async curateAgent(_request: ClaudeAgentCurationRequest): Promise<ClaudeAgentCurationCompletion> {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    return {
      message: 'Your curation draft is ready.',
      draftPatch: {},
      suggestedReplies: [],
      missingFields: []
    };
  }
}

class TestAccessResolver implements Pick<DomainAccessResolver, 'resolve'> {
  constructor(private readonly allowed: (request: AccessRequest) => boolean = () => true) {}

  async resolve(request: AccessRequest): Promise<AccessDecision> {
    return this.allowed(request) ? { allowed: true, reason: 'owner' } : { allowed: false, reason: 'denied' };
  }
}

async function createCurationTestServer(options: {
  allowAccess?: (request: AccessRequest) => boolean;
  beforeBuild?: (context: { prompts: TestPromptRepository; claude: TestClaudeClient; sessions: MemoryCurationRepository }) => void;
} = {}) {
  const events: string[] = [];
  const sessions = new MemoryCurationRepository(events);
  const agents = new TestAgentRepository(events, sessions);
  const prompts = new TestPromptRepository(events);
  const claude = new TestClaudeClient();
  options.beforeBuild?.({ prompts, claude, sessions });
  const deps: ServerDeps & { agentCuration: CurationRouteTestDeps } = {
    agentRepository: agents,
    auth: createTestAuthDeps(),
    agents: {
      promptRepository: prompts,
      reportRepository: {
        getLatestRunReport: async () => null,
        listReportsForAgent: async () => [],
        listSignalHistoryForSymbol: async () => []
      }
    },
    agentCuration: {
      repository: sessions,
      claudeClient: claude,
      model: 'claude-sonnet-4-5',
      accessResolver: new TestAccessResolver(options.allowAccess)
    }
  };
  const app = await buildServer(deps);
  return { app, agents, claude, events, prompts, sessions };
}

async function startCuration(app: Awaited<ReturnType<typeof buildServer>>, ownerUserId = 'owner-1', payload: Record<string, unknown> = { mode: 'create' }) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/agent-curations',
    headers: authCookieHeader(ownerUserId),
    payload
  });
  return { response, sessionId: response.json().id as string };
}

describe('agent curation routes', () => {
  it('starts a create session without creating an agent', async () => {
    const { app, agents } = await createCurationTestServer();

    const { response } = await startCuration(app, 'owner-1', {
      mode: 'create',
      sourceContext: { entryPoint: 'studio' },
      initialDraft: { name: 'Market Watcher' }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ mode: 'create', ownerUserId: 'owner-1', status: 'active' });
    expect(agents.createCalls).toEqual([]);
  });

  it('starts a variant from a published immutable version', async () => {
    const { app } = await createCurationTestServer();

    const { response } = await startCuration(app, 'owner-1', {
      mode: 'create',
      baseAgentVersionId: 'public-version-1'
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      mode: 'create',
      baseAgentVersionId: 'public-version-1',
      draft: { name: 'Public Market Analyst', description: 'Tracks public market coverage.' }
    });
  });

  it('finalizes an independent private version with provenance', async () => {
    const { app, prompts } = await createCurationTestServer();
    const { sessionId } = await startCuration(app, 'owner-1', {
      mode: 'create',
      baseAgentVersionId: 'public-version-1'
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });

    expect(response.statusCode).toBe(201);
    expect(prompts.saves).toContainEqual(
      expect.objectContaining({ basedOnAgentVersionId: 'public-version-1' })
    );
  });

  it('creates the finalized agent, saves its prompt, then completes the session', async () => {
    const { app, agents, events, prompts, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      agent: { name: 'Market Watcher', description: 'Tracks the market with concise updates.', characterType: 'summarizer' },
      session: { id: sessionId, status: 'completed' }
    });
    expect(agents.createCalls).toEqual([
      {
        ownerUserId: 'owner-1',
        input: { name: 'Market Watcher', description: 'Tracks the market with concise updates.', characterType: 'summarizer' }
      }
    ]);
    expect(prompts.saves).toEqual([
      {
        agentId: 'agent-1',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'Summarize the selected market sources clearly.',
        enabled: true
      }
    ]);
    expect(events.indexOf('agent:create')).toBeLessThan(events.indexOf('prompt:save'));
    expect(events.indexOf('prompt:save')).toBeLessThan(events.indexOf('session:complete'));
  });

  it('recovers a finalization after completion fails without creating another agent or prompt', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);
    sessions.nextMarkCompletedError = new Error('completion_store_unavailable');

    const firstAttempt = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });

    expect(firstAttempt.statusCode).toBe(500);
    expect(agents.createCalls).toHaveLength(1);
    expect(prompts.saves).toHaveLength(1);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'finalizing' });

    const retry = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });

    expect(retry.statusCode).toBe(201);
    expect(agents.createCalls).toHaveLength(1);
    expect(prompts.saves).toHaveLength(1);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'completed' });
  });

  it('records the finalization handoff with the agent mutation instead of a separate recovery write', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);
    sessions.nextRecordFinalizationResultError = new Error('finalization_result_store_unavailable');

    const firstAttempt = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });

    expect(firstAttempt.statusCode).toBe(201);
    expect(agents.createCalls).toHaveLength(1);
    expect(prompts.saves).toHaveLength(1);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({
      status: 'completed',
      finalizationAgentId: 'agent-1'
    });
  });

  it('maps a finance curation into a valid CreateAgentInput before persistence', async () => {
    const { app, agents } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ characterType: 'finance_expert' })
    });

    expect(response.statusCode).toBe(201);
    expect(agents.createCalls).toEqual([
      {
        ownerUserId: 'owner-1',
        input: {
          name: 'Market Watcher',
          description: 'Tracks the market with concise updates.',
          characterType: 'finance_expert',
          promptConfig: { risk_level: 'medium' }
        }
      }
    ]);
  });

  it('returns normal not-found behavior for a session owned by another user', async () => {
    const { app } = await createCurationTestServer();
    const { sessionId } = await startCuration(app, 'owner-1');

    const response = await app.inject({
      method: 'GET',
      url: `/api/agent-curations/${sessionId}`,
      headers: authCookieHeader('owner-2')
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'not_found', message: 'Curation session not found' });
  });

  it('denies update session start before persisting a session when edit access is missing', async () => {
    const { app, agents, sessions } = await createCurationTestServer({
      allowAccess: (request) => request.action !== 'edit'
    });
    await agents.createAgent('agent-owner', { name: 'Existing agent' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent-curations',
      headers: authCookieHeader('owner-1'),
      payload: { mode: 'update', targetAgentId: 'agent-1' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ code: 'forbidden', message: 'Agent access denied' });
    expect(sessions.sessionCount()).toBe(0);
  });

  it('removes finance-only prompt settings when a finalized update changes character type', async () => {
    const { app, agents } = await createCurationTestServer();
    await agents.createAgent('owner-1', {
      name: 'Existing finance agent',
      characterType: 'finance_expert',
      promptConfig: { risk_level: 'high' }
    });
    const { sessionId } = await startCuration(app, 'owner-1', { mode: 'update', targetAgentId: 'agent-1' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ characterType: 'teacher' })
    });

    expect(response.statusCode).toBe(200);
    expect(agents.updateCalls).toEqual([
      {
        agentId: 'agent-1',
        patch: {
          name: 'Market Watcher',
          description: 'Tracks the market with concise updates.',
          characterType: 'teacher',
          promptConfig: {}
        }
      }
    ]);
  });

  it('rejects a stale update curation after its target changes', async () => {
    const { app, agents, sessions } = await createCurationTestServer();
    const existing = await agents.createAgent('owner-1', {
      name: 'Existing agent',
      description: 'Original description',
      characterType: 'teacher'
    });
    const { response: started, sessionId } = await startCuration(app, 'owner-1', {
      mode: 'update',
      targetAgentId: existing.id,
      sourceContext: { entryPoint: 'agent-editor' }
    });

    expect(started.statusCode).toBe(201);
    expect(started.json().sourceContext).toMatchObject({
      entryPoint: 'agent-editor',
      curationTargetAgentUpdatedAt: existing.updatedAt.toISOString()
    });

    await agents.updateAgent(existing.id, { description: 'Changed outside curation' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ description: 'Curated description' })
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'curation_target_stale',
      message: 'Agent changed while this curation was in progress; start a new curation to review the latest agent',
      retryable: true
    });
    expect(agents.updateCalls).toHaveLength(1);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'active' });
  });

  it('keeps a created agent finalizing when prompt persistence fails so retry can persist the prompt', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer({
      beforeBuild: ({ prompts: configuredPrompts }) => {
        configuredPrompts.failOnSave = true;
      }
    });
    const { sessionId } = await startCuration(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'internal_error', message: 'Internal server error' });
    expect(agents.createCalls).toHaveLength(1);
    expect(prompts.saves).toEqual([]);
    await expect(agents.getAgent('agent-1')).resolves.toMatchObject({ id: 'agent-1' });
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({
      status: 'finalizing',
      finalizationAgentId: 'agent-1'
    });

    prompts.failOnSave = false;
    const retry = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });
    expect(retry.statusCode).toBe(201);
    await expect(agents.listAgents()).resolves.toHaveLength(2);
  });

  it('keeps an updated agent finalizing when prompt persistence fails so retry can persist the prompt', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer({
      beforeBuild: ({ prompts }) => {
        prompts.failOnSave = true;
      }
    });
    const existing = await agents.createAgent('owner-1', {
      name: 'Existing teacher',
      description: 'Original description',
      characterType: 'teacher',
      promptConfig: { tone: 'formal' }
    });
    const { sessionId } = await startCuration(app, 'owner-1', { mode: 'update', targetAgentId: existing.id });

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ characterType: 'summarizer' })
    });

    expect(response.statusCode).toBe(500);
    await expect(agents.getAgent(existing.id)).resolves.toMatchObject({
      name: 'Market Watcher',
      description: 'Tracks the market with concise updates.',
      characterType: 'summarizer',
      promptConfig: { tone: 'formal' }
    });
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({
      status: 'finalizing',
      finalizationAgentId: existing.id
    });

    prompts.failOnSave = false;
    const retry = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ characterType: 'summarizer' })
    });
    expect(retry.statusCode).toBe(200);
    expect(agents.updateCalls).toHaveLength(1);
  });

  it('rejects a concurrently started update after the other session changes the target', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer();
    const existing = await agents.createAgent('owner-1', {
      name: 'Existing agent',
      description: 'Original description',
      characterType: 'teacher'
    });
    const { sessionId: firstSessionId } = await startCuration(app, 'owner-1', {
      mode: 'update',
      targetAgentId: existing.id
    });
    const { sessionId: secondSessionId } = await startCuration(app, 'owner-1', {
      mode: 'update',
      targetAgentId: existing.id
    });
    sessions.nextRecordFinalizationResultError = new Error('handoff_record_unavailable');

    const first = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${firstSessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ name: 'First curated name' })
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${secondSessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ name: 'Second curated name' })
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      code: 'curation_target_stale',
      message: 'Agent changed while this curation was in progress; start a new curation to review the latest agent',
      retryable: true
    });

    const firstRetry = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${firstSessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ name: 'First curated name' })
    });

    expect(firstRetry.statusCode).toBe(200);
    expect(firstRetry.json()).toMatchObject({ agent: { id: existing.id }, session: { status: 'completed' } });
    expect(agents.updateCalls).toHaveLength(1);
    expect(prompts.saves).toHaveLength(1);
  });

  it('recovers a persisted create agent by saving its missing prompt without duplication', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer({
      beforeBuild: ({ prompts }) => {
        prompts.failOnSave = true;
      }
    });
    agents.failOnDelete = true;
    const { sessionId } = await startCuration(app);

    const firstAttempt = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });
    expect(firstAttempt.statusCode).toBe(500);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'finalizing' });

    prompts.failOnSave = false;

    const retry = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft()
    });
    expect(retry.statusCode).toBe(201);
    expect(agents.createCalls).toHaveLength(1);
    expect(prompts.saves).toHaveLength(1);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'completed' });
  });

  it('rejects a non-null avatar because Agent persistence has no avatar field', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ avatar: 'https://example.com/avatar.png' })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'avatar_not_supported', message: 'Agent avatars are not supported' });
    expect(agents.createCalls).toEqual([]);
    expect(prompts.saves).toEqual([]);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'active' });
  });

  it('rejects an oversized finalized draft before reserving or persisting an agent', async () => {
    const { app, agents, prompts, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/finalize`,
      headers: authCookieHeader('owner-1'),
      payload: readyDraft({ systemPrompt: 'x'.repeat(8_001) })
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'curation_profile_draft_too_large',
      message: 'Invalid curation input'
    });
    expect(agents.createCalls).toEqual([]);
    expect(prompts.saves).toEqual([]);
    await expect(sessions.getSessionForOwner(sessionId, 'owner-1')).resolves.toMatchObject({ status: 'active' });
  });

  it('maps retryable generation and session-conflict errors while preserving explicit input and model-output failures', async () => {
    const { app, claude, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);

    const invalidInput = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/messages`,
      headers: authCookieHeader('owner-1'),
      payload: { text: '   ' }
    });
    expect(invalidInput.statusCode).toBe(400);
    expect(invalidInput.json()).toMatchObject({ code: 'invalid_curation_user_message' });

    claude.nextError = new Error('upstream unavailable');
    const failedGeneration = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/messages`,
      headers: authCookieHeader('owner-1'),
      payload: { text: 'Build a market watcher.' }
    });
    expect(failedGeneration.statusCode).toBe(502);
    expect(failedGeneration.json()).toEqual({
      code: new CurationGenerationError().code,
      message: 'Curation generation failed; retry the request',
      retryable: true
    });

    claude.nextError = new ClaudeCurationResponseError('invalid curation output');
    const invalidOutput = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/messages`,
      headers: authCookieHeader('owner-1'),
      payload: { text: 'Try again.' }
    });
    expect(invalidOutput.statusCode).toBe(502);
    expect(invalidOutput.json()).toEqual({
      code: 'invalid_curation_model_output',
      message: 'Curation model returned an invalid response'
    });

    sessions.nextSaveReplyError = new CurationSessionConflictError();
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/messages`,
      headers: authCookieHeader('owner-1'),
      payload: { text: 'Retry after conflict.' }
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      code: 'curation_session_conflict',
      message: 'Curation session changed; retry the request',
      retryable: true
    });
  });

  it('reuses a user message when the API retries a failed generation with the same client request id', async () => {
    const { app, claude, sessions } = await createCurationTestServer();
    const { sessionId } = await startCuration(app);
    claude.nextError = new Error('upstream unavailable');
    const payload = { text: 'Build a market watcher.', clientRequestId: 'request-1' };

    const failedGeneration = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/messages`,
      headers: authCookieHeader('owner-1'),
      payload
    });
    const retry = await app.inject({
      method: 'POST',
      url: `/api/agent-curations/${sessionId}/messages`,
      headers: authCookieHeader('owner-1'),
      payload
    });

    expect(failedGeneration.statusCode).toBe(502);
    expect(retry.statusCode).toBe(200);
    const session = await sessions.getSessionForOwner(sessionId, 'owner-1');
    expect(session?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(session?.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });
});
