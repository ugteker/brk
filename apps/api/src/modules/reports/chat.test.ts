import { describe, expect, it, vi } from 'vitest';
import {
  buildReportChatSystemPrompt,
  InMemoryReportChatRepository,
  ReportChatService,
  type ReportChatServiceDeps
} from './chat';
import type { RunReportRecord } from './types';

function makeReport(overrides: Partial<RunReportRecord> = {}): RunReportRecord {
  return {
    id: 'report-1',
    agentId: 'agent-1',
    agentRunId: 'run-1',
    promptVersionId: 'prompt-1',
    summary: 'Bullish on AAPL after strong guidance.',
    sourceWarnings: [],
    needsHumanReview: false,
    signals: [{ symbol: 'AAPL', side: 'long', confidence: 82, rationale: 'guidance', citations: ['ep1@10:12'] }],
    report: { common: { summary: '', key_takeaways: [], sources_used: [], citations: [] }, section: { character_type: 'summarizer', bullet_digest: [] } },
    createdAt: new Date(),
    model: null,
    promptVersionNumber: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUsd: null,
    ...overrides
  };
}

function createDeps(overrides: Partial<ReportChatServiceDeps> = {}): ReportChatServiceDeps & {
  chatRepository: InMemoryReportChatRepository;
  claudeChat: ReturnType<typeof vi.fn>;
} {
  const chatRepository = new InMemoryReportChatRepository();
  const claudeChat = vi.fn(async () => ({ text: 'Grounded answer.' }));
  return {
    reportRepository: { getReportById: async () => makeReport() },
    artifactRepository: {
      listArtifactsForRun: async () => [
        {
          id: 'art-1',
          agentId: 'agent-1',
          agentRunId: 'run-1',
          kind: 'normalized_evidence',
          sourceRef: 'https://example.com/ep1',
          payloadJson: JSON.stringify({ sourceRef: 'https://example.com/ep1', title: 'Episode 1', content: 'Full transcript text about AAPL.' }),
          fidelity: 'high' as const,
          createdAt: new Date()
        }
      ]
    },
    promptRepository: {
      getLatestPromptVersion: async () => ({
        id: 'prompt-1',
        agentId: 'agent-1',
        version: 1,
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are a conservative analyst.',
        enabled: true,
        createdAt: new Date()
      })
    },
    agentRepository: { getAgent: async () => ({ id: 'agent-1', name: 'Morning Analyst' }) },
    chatRepository,
    claudeClient: { chat: claudeChat },
    claudeChat,
    ...overrides
  };
}

describe('buildReportChatSystemPrompt', () => {
  it('includes persona prompt, report summary, signals, and evidence', () => {
    const prompt = buildReportChatSystemPrompt({
      agentName: 'Morning Analyst',
      personaSystemPrompt: 'You are a conservative analyst.',
      report: makeReport(),
      evidenceTexts: [{ sourceRef: 'Episode 1', content: 'Transcript body.' }]
    });
    expect(prompt).toContain('You are a conservative analyst.');
    expect(prompt).toContain('Bullish on AAPL after strong guidance.');
    expect(prompt).toContain('AAPL LONG (confidence 82%)');
    expect(prompt).toContain('### Source: Episode 1');
    expect(prompt).toContain('Transcript body.');
    expect(prompt).toContain('never present it as financial advice');
  });

  it('truncates evidence to the character budget instead of blowing up the prompt', () => {
    const huge = 'x'.repeat(60_000);
    const prompt = buildReportChatSystemPrompt({
      agentName: 'A',
      personaSystemPrompt: 'P',
      report: makeReport(),
      evidenceTexts: [
        { sourceRef: 'S1', content: huge },
        { sourceRef: 'S2', content: 'second source content' }
      ]
    });
    expect(prompt.length).toBeLessThan(30_000);
    expect(prompt).not.toContain('second source content');
  });
});

describe('ReportChatService.ask', () => {
  it('persists the question and the grounded answer and returns both messages', async () => {
    const deps = createDeps();
    const service = new ReportChatService(deps);

    const result = await service.ask('agent-1', 'report-1', 'user-1', 'Why long AAPL?');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({ role: 'user', content: 'Why long AAPL?' });
    expect(result.messages[1]).toMatchObject({ role: 'assistant', content: 'Grounded answer.' });
    expect(deps.chatRepository.messages).toHaveLength(2);

    const call = deps.claudeChat.mock.calls[0][0];
    expect(call.model).toBe('claude-sonnet-4-5');
    expect(call.system).toContain('Full transcript text about AAPL.');
    expect(call.system).toContain('### Source: Episode 1');
    expect(call.messages).toEqual([{ role: 'user', content: 'Why long AAPL?' }]);
  });

  it('replays prior chat history to Claude for follow-up questions', async () => {
    const deps = createDeps();
    await deps.chatRepository.saveMessage({ reportId: 'report-1', userId: 'user-1', role: 'user', content: 'First question' });
    await deps.chatRepository.saveMessage({ reportId: 'report-1', userId: 'user-1', role: 'assistant', content: 'First answer' });
    const service = new ReportChatService(deps);

    await service.ask('agent-1', 'report-1', 'user-1', 'Follow-up?');

    const call = deps.claudeChat.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow-up?' }
    ]);
  });

  it('keeps chat history isolated per user', async () => {
    const deps = createDeps();
    await deps.chatRepository.saveMessage({ reportId: 'report-1', userId: 'other-user', role: 'user', content: 'Someone else asked' });
    const service = new ReportChatService(deps);

    await service.ask('agent-1', 'report-1', 'user-1', 'My question');

    const call = deps.claudeChat.mock.calls[0][0];
    expect(call.messages).toEqual([{ role: 'user', content: 'My question' }]);
  });

  it('returns not_found when the report belongs to a different agent', async () => {
    const deps = createDeps({ reportRepository: { getReportById: async () => makeReport({ agentId: 'someone-else' }) } });
    const service = new ReportChatService(deps);

    const result = await service.ask('agent-1', 'report-1', 'user-1', 'Q');

    expect(result).toEqual({ ok: false, code: 'not_found' });
    expect(deps.claudeChat).not.toHaveBeenCalled();
  });

  it('returns missing_prompt_version when the agent has no prompt configured', async () => {
    const deps = createDeps({ promptRepository: { getLatestPromptVersion: async () => null } });
    const service = new ReportChatService(deps);

    const result = await service.ask('agent-1', 'report-1', 'user-1', 'Q');

    expect(result).toEqual({ ok: false, code: 'missing_prompt_version' });
  });

  it('keeps the persisted user question even when the Claude call fails', async () => {
    const deps = createDeps();
    deps.claudeChat.mockRejectedValueOnce(new Error('claude down'));
    const service = new ReportChatService(deps);

    await expect(service.ask('agent-1', 'report-1', 'user-1', 'Q')).rejects.toThrow('claude down');
    expect(deps.chatRepository.messages).toHaveLength(1);
    expect(deps.chatRepository.messages[0].role).toBe('user');
  });
});
