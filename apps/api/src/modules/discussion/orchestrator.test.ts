import { describe, it, expect, vi } from 'vitest';
import { DiscussionOrchestrator } from './orchestrator';

const participant1 = {
  id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0,
  reportIds: [] as string[]
};
const participant2 = {
  id: 'p2', discussionId: 'd1', agentId: 'a2', role: 'speaker' as const, voiceId: 'echo' as const, speakerOrder: 1,
  reportIds: [] as string[]
};

const mockDiscussion = {
  id: 'd1', ownerUserId: 'u1', name: 'Test Discussion', description: 'Discuss NVDA outlook',
  format: 'free_form' as const, formatConfig: { totalTurnTarget: 4 },
  scheduleJson: null, syntheticSourceId: null,
  createdAt: new Date(), updatedAt: new Date(),
  participants: [participant1, participant2]
};

function makeMockRepo() {
  return {
    getDiscussion: vi.fn().mockResolvedValue(mockDiscussion),
    getRunWithTurns: vi.fn().mockResolvedValue({ id: 'r1', status: 'running', turns: [
      { id: 't1', discussionRunId: 'r1', participantId: 'p1', turnIndex: 0, segmentLabel: null, content: 'Hello', audioUrl: null, createdAt: new Date() }
    ]}),
    updateRun: vi.fn().mockResolvedValue(undefined),
    createTurn: vi.fn().mockResolvedValue({ id: 't1', turnIndex: 0 }),
    setSyntheticSourceId: vi.fn().mockResolvedValue(undefined),
    setRunEvidenceSnapshot: vi.fn().mockResolvedValue(undefined),
    createDiscussion: vi.fn(),
    listDiscussions: vi.fn(),
    updateDiscussion: vi.fn(),
    deleteDiscussion: vi.fn(),
    createRun: vi.fn(),
    listRuns: vi.fn(),
    updateTurnAudioUrl: vi.fn(),
  };
}

const mockAgentRepo = {
  getAgent: vi.fn().mockImplementation(async (agentId: string) =>
    agentId === 'a1'
      ? { id: 'a1', name: 'Bull', characterType: 'finance_expert' }
      : { id: 'a2', name: 'Bear', characterType: 'finance_expert' }
  )
};

const mockPromptRepo = {
  getLatestPromptVersion: vi.fn().mockImplementation(async (agentId: string) =>
    agentId === 'a2'
      ? { systemPrompt: 'You are Bear, a bearish analyst.', model: 'claude-opus-4-1' }
      : { systemPrompt: 'You are Bull, a bullish analyst.', model: 'claude-sonnet-4-5' }
  )
};

function makeMockReportRepo() {
  return {
    listReportsForAgent: vi.fn().mockImplementation(async (agentId: string) =>
      agentId === 'a2'
        ? [{ id: 'r-a2-1', agentId: 'a2', agentRunId: 'run-a2-1', summary: 'BTC is a sell.', createdAt: new Date('2026-07-02') }]
        : [{ id: 'r-a1-fallback', agentId: 'a1', agentRunId: 'run-a1-fallback', summary: 'NVDA fallback report.', createdAt: new Date('2026-07-01') }]
    ),
    getReportById: vi.fn().mockImplementation(async (id: string) => {
      const table: Record<string, { id: string; agentId: string; agentRunId: string; summary: string }> = {
        'r-a1-explicit': { id: 'r-a1-explicit', agentId: 'a1', agentRunId: 'run-a1-1', summary: 'NVDA is a buy.' },
        'r-a2-1': { id: 'r-a2-1', agentId: 'a2', agentRunId: 'run-a2-1', summary: 'BTC is a sell.' }
      };
      return table[id] ?? null;
    })
  };
}

function makeMockArtifactRepo() {
  return {
    listArtifactsForRun: vi.fn().mockImplementation(async (agentRunId: string) =>
      agentRunId === 'run-a1-1'
        ? [{ id: 'artifact-1', sourceRef: 'https://example.com/a', payloadJson: JSON.stringify({ content: 'Raw NVDA transcript.', itemId: 'item-1' }), fidelity: 'high' }]
        : []
    )
  };
}

const mockClaude = {
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'I think NVDA is strong.' }],
      usage: { input_tokens: 10, output_tokens: 20 }
    })
  }
};

const mockSyntheticSource = {
  ensureSyntheticSource: vi.fn().mockResolvedValue(undefined)
};

function makeOrchestrator(overrides: { claude?: any; reportRepo?: any; repo?: any; promptRepo?: any } = {}) {
  return new DiscussionOrchestrator({
    discussionRepository: overrides.repo ?? makeMockRepo(),
    agentRepository: mockAgentRepo as any,
    promptRepository: overrides.promptRepo ?? (mockPromptRepo as any),
    reportRepository: overrides.reportRepo ?? makeMockReportRepo(),
    artifactRepository: makeMockArtifactRepo() as any,
    claudeClient: overrides.claude ?? mockClaude as any,
    syntheticSource: mockSyntheticSource as any
  });
}

describe('DiscussionOrchestrator', () => {
  it('runs discussion and creates turns, marks done', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    const orchestrator = makeOrchestrator({ repo });
    await orchestrator.run('d1', 'r1');
    expect(repo.createTurn).toHaveBeenCalled();
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'done' });
  });

  it('marks run as error if Claude throws', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    const failingClaude = { messages: { create: vi.fn().mockRejectedValue(new Error('API error')) } };
    const orchestrator = makeOrchestrator({ repo, claude: failingClaude });
    await orchestrator.run('d1', 'r1');
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'error' });
  });

  it('calls syntheticSource.ensureSyntheticSource on success', async () => {
    vi.clearAllMocks();
    const orchestrator = makeOrchestrator();
    await orchestrator.run('d1', 'r1');
    expect(mockSyntheticSource.ensureSyntheticSource).toHaveBeenCalled();
  });

  it('marks error if discussion not found', async () => {
    vi.clearAllMocks();
    const notFoundRepo = { ...makeMockRepo(), getDiscussion: vi.fn().mockResolvedValue(null) };
    const orchestrator = makeOrchestrator({ repo: notFoundRepo });
    await orchestrator.run('missing', 'r1');
    const lastCall = notFoundRepo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'error' });
  });

  it('supports mixed explicit and fallback report resolution and snapshots the result', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    const mixedDiscussion = {
      ...mockDiscussion,
      participants: [
        { ...participant1, reportIds: ['r-a1-explicit'] }, // explicit
        { ...participant2, reportIds: [] } // fallback
      ]
    };
    repo.getDiscussion = vi.fn().mockResolvedValue(mixedDiscussion);
    const orchestrator = makeOrchestrator({ repo });

    await orchestrator.run('d1', 'r1');

    expect(repo.setRunEvidenceSnapshot).toHaveBeenCalledWith('r1', expect.objectContaining({
      agenda: 'Discuss NVDA outlook',
      participants: expect.arrayContaining([
        expect.objectContaining({ participantId: 'p1', reportIds: ['r-a1-explicit'], origin: 'explicit' }),
        expect.objectContaining({ participantId: 'p2', reportIds: ['r-a2-1'], origin: 'fallback' })
      ])
    }));
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'done' });
  });

  it('includes bounded transcript excerpts and records source item ids for resolved reports', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    const discussionWithExplicit = {
      ...mockDiscussion,
      participants: [
        { ...participant1, reportIds: ['r-a1-explicit'] },
        { ...participant2, reportIds: [] }
      ]
    };
    repo.getDiscussion = vi.fn().mockResolvedValue(discussionWithExplicit);
    const orchestrator = makeOrchestrator({ repo });

    await orchestrator.run('d1', 'r1');

    const snapshotCall = repo.setRunEvidenceSnapshot.mock.calls.at(-1)!;
    const snapshot = snapshotCall[1];
    const p1Snapshot = snapshot.participants.find((p: any) => p.participantId === 'p1');
    expect(p1Snapshot.sourceItemIds).toEqual(['item-1']);
    expect(p1Snapshot.transcriptWarnings).toHaveLength(0);
  });

  it('records a transcript warning (without failing the run) when a report has no raw material', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    // a2's fallback-resolved report ('r-a2-1' -> agentRunId 'run-a2-1') has no artifacts in makeMockArtifactRepo
    const orchestrator = makeOrchestrator({ repo });

    await orchestrator.run('d1', 'r1');

    const snapshotCall = repo.setRunEvidenceSnapshot.mock.calls.at(-1)!;
    const snapshot = snapshotCall[1];
    const p2Snapshot = snapshot.participants.find((p: any) => p.participantId === 'p2');
    expect(p2Snapshot.transcriptWarnings.length).toBeGreaterThan(0);
    const lastUpdateRunCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastUpdateRunCall[1]).toMatchObject({ status: 'done' });
  });

  it('rejects the run with a clear validation error before generating turns when a participant resolves no report', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    const emptyReportRepo = {
      listReportsForAgent: vi.fn().mockResolvedValue([]),
      getReportById: vi.fn().mockResolvedValue(null)
    };
    const orchestrator = makeOrchestrator({ repo, reportRepo: emptyReportRepo });

    await orchestrator.run('d1', 'r1');

    expect(repo.createTurn).not.toHaveBeenCalled();
    expect(mockSyntheticSource.ensureSyntheticSource).not.toHaveBeenCalled();
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1].status).toBe('error');
    expect(lastCall[1].errorMessage).toMatch(/no report/i);
  });

  it("calls Claude with each participant's own configured model, not a single hardcoded model", async () => {
    vi.clearAllMocks();
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    const orchestrator = makeOrchestrator({ claude });

    await orchestrator.run('d1', 'r1');

    const modelsUsed = claude.messages.create.mock.calls.map((call: any) => call[0].model);
    // formatConfig.totalTurnTarget = 4, round-robin over [a1 (Bull), a2 (Bear)]
    expect(modelsUsed).toEqual(['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-sonnet-4-5', 'claude-opus-4-1']);
    // Guard against regressing back to the retired hardcoded model that caused a 404 in production.
    expect(modelsUsed).not.toContain('claude-3-5-sonnet-20241022');
  });

  it('falls back to the default discussion model when a participant has no prompt version yet', async () => {
    vi.clearAllMocks();
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    const noPromptRepo = { getLatestPromptVersion: vi.fn().mockResolvedValue(null) };
    const orchestrator = makeOrchestrator({ claude, promptRepo: noPromptRepo });

    await orchestrator.run('d1', 'r1');

    const modelsUsed = claude.messages.create.mock.calls.map((call: any) => call[0].model);
    expect(modelsUsed.every((m: string) => m === 'claude-sonnet-4-5')).toBe(true);
  });

  it('overrides a persona system prompt that instructs JSON-only output with a natural-language discussion instruction', async () => {
    vi.clearAllMocks();
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    // Mirrors the real baked-in persona template (prompt-personas.ts's nonFinancePrompt()),
    // which tells Claude to "generate a clear, practical response in the requested JSON shape" -
    // reusing this verbatim for a live discussion turn is exactly what caused turns to come back
    // as JSON instead of spoken dialogue.
    const jsonInstructingPromptRepo = {
      getLatestPromptVersion: vi.fn().mockResolvedValue({
        systemPrompt: 'You are a teacher operating as an educator.\n\nUse the provided source evidence to generate a clear, practical response in the requested JSON shape.',
        model: 'claude-sonnet-4-5'
      })
    };
    const orchestrator = makeOrchestrator({ claude, promptRepo: jsonInstructingPromptRepo });

    await orchestrator.run('d1', 'r1');

    const systemPromptsUsed = claude.messages.create.mock.calls.map((call: any) => call[0].system as string);
    for (const system of systemPromptsUsed) {
      // The base persona instructions are still present (persona/character is preserved)...
      expect(system).toContain('You are a teacher operating as an educator.');
      // ...but every turn's system prompt also carries an explicit override telling Claude this
      // is a live spoken conversation, not a JSON report.
      expect(system.toLowerCase()).toContain('json');
      expect(system.toLowerCase()).toMatch(/not.*json|no json|instead of json/);
    }
  });
});
