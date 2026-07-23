import { describe, expect, it, vi } from 'vitest';
import { ClaudeCurationResponseError } from '../analysis/claude-client';
import { AgentCurationRepository } from './repository';
import { AgentCurationService, CurationGenerationError, MAX_CURATION_PROFILE_DRAFT_CHARS } from './service';

function createRepository() {
  const sessions = new Map<string, any>();
  let sessionSequence = 0;
  let messageSequence = 0;

  const toRow = (session: any) => ({
    ...session,
    messages: [...session.messages].sort((a: any, b: any) => a.position - b.position)
  });

  const db: any = {
    agentCurationSession: {
      create: async ({ data }: any) => {
        sessionSequence += 1;
        const now = new Date('2026-07-23T10:00:00.000Z');
        const session = {
          id: `session-${sessionSequence}`,
          ...data,
          status: 'active',
          revision: 0,
          createdAt: now,
          updatedAt: now,
          messages: []
        };
        sessions.set(session.id, session);
        return toRow(session);
      },
      findUnique: async ({ where, select }: any) => {
        const session = sessions.get(where.id);
        if (!session) return null;
        if (select?.messages) {
          return { messages: [...session.messages].sort((a: any, b: any) => b.position - a.position).slice(0, 1) };
        }
        return toRow(session);
      },
      update: async ({ where, data }: any) => {
        const session = sessions.get(where.id);
        if (!session) throw new Error('not_found');
        Object.assign(session, data, { updatedAt: new Date('2026-07-23T10:01:00.000Z') });
        return toRow(session);
      },
      updateMany: async ({ where, data }: any) => {
        const session = sessions.get(where.id);
        if (
          !session ||
          (where.revision !== undefined && session.revision !== where.revision) ||
          (where.status !== undefined && session.status !== where.status)
        ) {
          return { count: 0 };
        }
        if (data.draftJson !== undefined) {
          session.draftJson = data.draftJson;
        }
        if (data.status !== undefined) {
          session.status = data.status;
        }
        session.revision += data.revision?.increment ?? 0;
        session.updatedAt = new Date('2026-07-23T10:01:00.000Z');
        return { count: 1 };
      },
      findFirst: async ({ where }: any) => {
        const session = sessions.get(where.id);
        return session?.ownerUserId === where.ownerUserId ? toRow(session) : null;
      }
    },
    agentCurationMessage: {
      create: async ({ data }: any) => {
        const session = sessions.get(data.sessionId);
        if (!session) throw new Error('not_found');
        messageSequence += 1;
        const message = {
          id: `message-${messageSequence}`,
          ...data,
          createdAt: new Date('2026-07-23T10:01:00.000Z')
        };
        session.messages.push(message);
        return message;
      },
      findUnique: async ({ where }: any) => {
        const request = where.sessionId_clientRequestId;
        if (!request) return null;
        const session = sessions.get(request.sessionId);
        return session?.messages.find((message: any) => message.clientRequestId === request.clientRequestId) ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        const candidateSessions = where.sessionId ? [sessions.get(where.sessionId)] : [...sessions.values()];
        const matching = candidateSessions.flatMap((session) =>
          session?.messages.filter(
            (message: any) =>
              (where.id === undefined || message.id === where.id) &&
              (where.clientRequestId === undefined || message.clientRequestId === where.clientRequestId) &&
              (where.replyJson === undefined || (message.replyJson ?? null) === where.replyJson)
          ) ?? []
        );
        for (const message of matching) {
          Object.assign(message, data);
        }
        return { count: matching.length };
      }
    }
  };
  db.$transaction = async (callback: (transaction: typeof db) => Promise<unknown>) => callback(db);

  return new AgentCurationRepository(db);
}

function completion(overrides: Record<string, unknown> = {}) {
  return {
    message: 'Here is an updated draft.',
    draftPatch: {
      name: 'Research Digest',
      description: 'A concise research digest.',
      characterType: 'summarizer',
      systemPrompt: 'Summarize selected research into a concise digest.'
    },
    suggestedReplies: ['Make it briefer'],
    missingFields: [],
    ...overrides
  };
}

function createService(claudeCompletion = completion()) {
  const repository = createRepository();
  const curateAgent = vi.fn(async () => claudeCompletion);
  const service = new AgentCurationService({
    repository,
    claudeClient: { curateAgent },
    model: 'claude-sonnet-4-5'
  });
  return { repository, curateAgent, service };
}

describe('AgentCurationService', () => {
  it('keeps a direct name correction when the generated patch conflicts', async () => {
    const { service } = createService(
      completion({
        draftPatch: {
          name: 'Generated Research Digest',
          description: 'A concise research digest.',
          characterType: 'summarizer',
          systemPrompt: 'Summarize selected research into a concise digest.'
        }
      })
    );
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    const result = await service.reply(session, 'Change the name to Alpha');

    expect(result.draft.name).toBe('Alpha');
    expect(result.draft.metadata?.userLockedFields).toContain('name');
  });

  it('instructs Claude to converse in the session language when one is set', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {}, language: 'de' });

    await service.reply(session, 'Erstelle einen Agenten für Finanznachrichten.');

    expect(curateAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: expect.stringContaining('German')
      })
    );
  });

  it('adds no language directive when no session language is set', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    await service.reply(session, 'Create a research digest.');

    const request = curateAgent.mock.calls[0]?.[0] as unknown as { systemInstruction: string };
    expect(request.systemInstruction).not.toContain('German');
  });

  it('locks every field supplied through the typed manual draft patch', async () => {
    const { service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    const result = await service.reply(session, 'Use the form values.', { name: 'Form Controlled Name' });

    expect(result.draft.name).toBe('Form Controlled Name');
    expect(result.draft.metadata?.userLockedFields).toContain('name');
  });

  it('keeps an explicit user correction when the generated patch conflicts', async () => {
    const { service } = createService(
      completion({
        draftPatch: {
          name: 'Finance Research Digest',
          description: 'A concise research digest.',
          characterType: 'finance_expert',
          systemPrompt: 'Analyze financial markets.'
        }
      })
    );
    const session = await service.start({
      ownerUserId: 'owner-1',
      mode: 'create',
      sourceContext: { selectedSources: ['https://example.com/research'] }
    });

    const result = await service.reply(session, 'Do not make it a finance analyst; make it a research digest.');

    expect(result.draft.characterType).toBe('summarizer');
    expect(result.draft.metadata?.userLockedFields).toContain('characterType');
    expect(result.canReview).toBe(true);
  });

  it('keeps the previously saved draft when Claude generation fails', async () => {
    const { repository, curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });
    const first = await service.reply(session, 'Create a research digest.');
    curateAgent.mockRejectedValueOnce(new Error('Claude is unavailable'));

    await expect(service.reply(first.session, 'Make it more technical.')).rejects.toBeInstanceOf(CurationGenerationError);
    await expect(service.reply(first.session, 'Retry after failure.')).resolves.toBeDefined();

    const saved = await repository.getSessionForOwner(first.session.id, 'owner-1');
    expect(saved?.draft).toEqual(first.draft);
    expect(saved?.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'user', 'assistant']);
  });

  it('reuses the persisted user turn when a failed generation is retried with the same request id', async () => {
    const { repository, curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });
    curateAgent.mockRejectedValueOnce(new Error('Claude is unavailable'));

    await expect(service.reply(session, 'Make it more technical.', undefined, 'request-1')).rejects.toBeInstanceOf(CurationGenerationError);
    await service.reply(session, 'Make it more technical.', undefined, 'request-1');

    const saved = await repository.getSessionForOwner(session.id, 'owner-1');
    expect(saved?.messages.filter((message) => message.role === 'user')).toHaveLength(1);
    expect(saved?.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(curateAgent.mock.calls.map(([request]) => request.conversation.map((message: { content: string }) => message.content))).toEqual([
      ['Make it more technical.'],
      ['Make it more technical.']
    ]);
  });

  it('returns the original completed reply without generating again when the request id is retried', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    const first = await service.reply(session, 'Make it more technical.', undefined, 'request-1');
    const retried = await service.reply(session, 'Make it more technical.', undefined, 'request-1');

    expect(curateAgent).toHaveBeenCalledTimes(1);
    expect(retried).toEqual(first);
  });

  it('returns the original session snapshot when a completed request is retried after a later reply', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    const first = await service.reply(session, 'Make it more technical.', undefined, 'request-1');
    await service.reply(first.session, 'Make it more concise.', undefined, 'request-2');
    const retried = await service.reply(session, 'Make it more technical.', undefined, 'request-1');

    expect(curateAgent).toHaveBeenCalledTimes(2);
    expect(retried).toEqual(first);
  });

  it('uses pending corrections when retrying from an old caller snapshot', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });
    const first = await service.reply(session, 'Create a research digest.');
    curateAgent.mockRejectedValueOnce(new Error('Claude is unavailable'));

    await expect(service.reply(first.session, 'Change the name to Pending Correction')).rejects.toBeInstanceOf(CurationGenerationError);
    await service.reply(session, 'Retry after failure.');

    const retryRequest = curateAgent.mock.calls.at(-1)?.[0];
    expect(retryRequest.conversation.map((message: { content: string }) => message.content)).toEqual([
      'Create a research digest.',
      'Here is an updated draft.',
      'Change the name to Pending Correction',
      'Retry after failure.'
    ]);
  });

  it('rejects blank user messages before persisting or generating', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    await expect(service.reply(session, '   ')).rejects.toMatchObject({ code: 'invalid_curation_user_message' });

    expect(curateAgent).not.toHaveBeenCalled();
  });

  it('rejects user messages above the curation prompt limit', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    await expect(service.reply(session, 'x'.repeat(4_001))).rejects.toMatchObject({ code: 'curation_user_message_too_long' });

    expect(curateAgent).not.toHaveBeenCalled();
  });

  it('rejects oversized user draft patches before persisting or generating', async () => {
    const { repository, curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });
    const appendMessage = vi.spyOn(repository, 'appendMessage');
    const saveReply = vi.spyOn(repository, 'saveReply');

    await expect(
      service.reply(session, 'Use this draft patch.', { systemPrompt: 'x'.repeat(MAX_CURATION_PROFILE_DRAFT_CHARS + 1) })
    ).rejects.toMatchObject({ code: 'curation_profile_draft_too_large' });

    expect(appendMessage).not.toHaveBeenCalled();
    expect(saveReply).not.toHaveBeenCalled();
    expect(curateAgent).not.toHaveBeenCalled();
  });

  it('rejects oversized start profiles before creating a session', async () => {
    const { repository, service } = createService();
    const createSession = vi.spyOn(repository, 'createSession');

    await expect(
      service.start({
        ownerUserId: 'owner-1',
        mode: 'create',
        currentAgentProfile: { systemPrompt: 'x'.repeat(MAX_CURATION_PROFILE_DRAFT_CHARS + 1) }
      })
    ).rejects.toMatchObject({ code: 'curation_profile_draft_too_large' });

    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects source context above the curation prompt limit', async () => {
    const { service } = createService();

    await expect(
      service.start({
        ownerUserId: 'owner-1',
        mode: 'create',
        sourceContext: { serializedContent: 'x'.repeat(16_001) }
      })
    ).rejects.toMatchObject({ code: 'curation_source_context_too_large' });
  });

  it('sends only the recent bounded curation conversation window', async () => {
    const { repository, curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });
    for (let index = 0; index < 23; index += 1) {
      await repository.appendMessage(session.id, { role: 'user', content: `Earlier message ${index}` });
    }
    const persistedSession = await repository.getSessionForOwner(session.id, 'owner-1');

    await service.reply(persistedSession!, 'Latest correction');

    const request = curateAgent.mock.calls[0]?.[0];
    expect(request.conversation).toHaveLength(20);
    expect(request.conversation[0]?.content).toBe('Earlier message 4');
    expect(request.conversation.at(-1)?.content).toBe('Latest correction');
  });

  it('preserves Claude curation validation errors instead of converting them to generation failures', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });
    curateAgent.mockRejectedValueOnce(new ClaudeCurationResponseError('Claude curation response has invalid missingFields'));

    await expect(service.reply(session, 'Create a research digest.')).rejects.toBeInstanceOf(ClaudeCurationResponseError);
  });

  it('recomputes missing fields instead of trusting the model completion', async () => {
    const { service } = createService(
      completion({
        draftPatch: { name: 'Only a name' },
        missingFields: []
      })
    );
    const session = await service.start({ ownerUserId: 'owner-1', mode: 'create', sourceContext: {} });

    const result = await service.reply(session, 'Name it Only a name.');

    expect(result.draft.missingFields).toEqual(['description', 'characterType', 'systemPrompt']);
    expect(result.canReview).toBe(false);
    await expect(service.buildFinalization(result.session)).rejects.toMatchObject({ code: 'curation_incomplete' });
  });

  it('includes an advisory-only source instruction in the curation request', async () => {
    const { curateAgent, service } = createService();
    const session = await service.start({
      ownerUserId: 'owner-1',
      mode: 'create',
      sourceContext: { selectedSources: ['https://example.com/research'] }
    });

    await service.reply(session, 'Create a research digest.');

    const request = curateAgent.mock.calls[0]?.[0];
    expect(request.systemInstruction).toContain('Selected source context is advisory, not mandatory.');
    expect(request.sourceContext).toEqual({ selectedSources: ['https://example.com/research'] });
  });
});
