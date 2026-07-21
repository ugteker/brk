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

function makeOrchestrator(overrides: { claude?: any; reportRepo?: any; repo?: any; promptRepo?: any; artifactRepo?: any } = {}) {
  return new DiscussionOrchestrator({
    discussionRepository: overrides.repo ?? makeMockRepo(),
    agentRepository: mockAgentRepo as any,
    promptRepository: overrides.promptRepo ?? (mockPromptRepo as any),
    reportRepository: overrides.reportRepo ?? makeMockReportRepo(),
    artifactRepository: (overrides.artifactRepo ?? makeMockArtifactRepo()) as any,
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

  it('uses turnLength=short: smaller token budget and brevity instruction in system prompt', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    repo.getDiscussion = vi.fn().mockResolvedValue({
      ...mockDiscussion,
      formatConfig: { totalTurnTarget: 2, turnLength: 'short' }
    });
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Short take.' }] }) } };
    const orchestrator = makeOrchestrator({ repo, claude });
    await orchestrator.run('d1', 'r1');
    const call = claude.messages.create.mock.calls[0][0];
    expect(call.max_tokens).toBe(160);
    expect(call.system).toContain('2-3 concise sentences');
  });

  it('uses turnLength=long: larger token budget and elaboration instruction', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    repo.getDiscussion = vi.fn().mockResolvedValue({
      ...mockDiscussion,
      formatConfig: { totalTurnTarget: 2, turnLength: 'long' }
    });
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Long take.' }] }) } };
    const orchestrator = makeOrchestrator({ repo, claude });
    await orchestrator.run('d1', 'r1');
    const call = claude.messages.create.mock.calls[0][0];
    expect(call.max_tokens).toBe(700);
    expect(call.system).toContain('elaborate in depth');
  });

  it('defaults to medium turn length (max_tokens 400, no extra instruction) for legacy discussions', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Take.' }] }) } };
    const orchestrator = makeOrchestrator({ repo, claude });
    await orchestrator.run('d1', 'r1');
    const call = claude.messages.create.mock.calls[0][0];
    expect(call.max_tokens).toBe(400);
    expect(call.system).not.toContain('concise sentences');
    expect(call.system).not.toContain('elaborate in depth');
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

  it('instructs every participant to respond in German when the discussion language is set to de', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    repo.getDiscussion = vi.fn().mockResolvedValue({
      ...mockDiscussion,
      formatConfig: { totalTurnTarget: 4, language: 'de' }
    });
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    const orchestrator = makeOrchestrator({ repo, claude });

    await orchestrator.run('d1', 'r1');

    const systemPromptsUsed = claude.messages.create.mock.calls.map((call: any) => call[0].system as string);
    for (const system of systemPromptsUsed) {
      expect(system).toMatch(/deutsch/i);
    }
  });

  it('does not add a language override when the discussion language is unset (defaults to English)', async () => {
    vi.clearAllMocks();
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    const orchestrator = makeOrchestrator({ claude });

    await orchestrator.run('d1', 'r1');

    const systemPromptsUsed = claude.messages.create.mock.calls.map((call: any) => call[0].system as string);
    for (const system of systemPromptsUsed) {
      expect(system).not.toMatch(/deutsch/i);
    }
  });

  it('sanitizes a turn that still comes back as JSON despite the discussion-mode instruction', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    // Even with DISCUSSION_MODE_INSTRUCTION, Claude occasionally falls back to its baked-in
    // report JSON shape (same behavior already observed for the single-agent pipeline) - the
    // orchestrator must extract readable spoken text rather than persisting the raw JSON blob.
    const jsonReply = JSON.stringify({
      common: { summary: "I'd push back - the data center demand story is overstated.", key_takeaways: [], sources_used: [], citations: [] },
      section: { character_type: 'finance_expert', market_summary: 'Overstated.', signals: [] }
    });
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: jsonReply }] }) } };
    const orchestrator = makeOrchestrator({ repo, claude });

    await orchestrator.run('d1', 'r1');

    const savedTexts = repo.createTurn.mock.calls.map((call: any) => call[3] as string);
    for (const text of savedTexts) {
      expect(text).toBe("I'd push back - the data center demand story is overstated.");
      expect(text).not.toContain('{');
    }
  });

  it('runs a free-grounded discussion without any reports and snapshots origin none', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    repo.getDiscussion = vi.fn().mockResolvedValue({
      ...mockDiscussion,
      description: 'What does AI regulation mean for open-source models?',
      formatConfig: { totalTurnTarget: 4, grounding: { mode: 'free' } }
    });
    // No reports exist at all - would fail resolution in 'reports' mode.
    const emptyReportRepo = {
      listReportsForAgent: vi.fn().mockResolvedValue([]),
      getReportById: vi.fn().mockResolvedValue(null)
    };
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    const orchestrator = makeOrchestrator({ repo, reportRepo: emptyReportRepo, claude });

    await orchestrator.run('d1', 'r1');

    expect(repo.createTurn).toHaveBeenCalledTimes(4);
    expect(emptyReportRepo.listReportsForAgent).not.toHaveBeenCalled();
    expect(repo.setRunEvidenceSnapshot).toHaveBeenCalledWith('r1', expect.objectContaining({
      participants: expect.arrayContaining([
        expect.objectContaining({ participantId: 'p1', reportIds: [], origin: 'none' })
      ])
    }));
    // The agenda question reaches the prompt via the director context.
    const firstPrompt = claude.messages.create.mock.calls[0][0].messages.at(-1).content as string;
    expect(firstPrompt).toContain('What does AI regulation mean for open-source models?');
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'done' });
  });

  it('shares the picked transcript with every participant in a transcript-grounded discussion', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    repo.getDiscussion = vi.fn().mockResolvedValue({
      ...mockDiscussion,
      formatConfig: { totalTurnTarget: 4, grounding: { mode: 'transcript', artifactIds: ['artifact-9'] } }
    });
    const artifactRepo = {
      listArtifactsForRun: vi.fn().mockResolvedValue([]),
      getArtifactsByIds: vi.fn().mockResolvedValue([
        {
          id: 'artifact-9',
          sourceRef: 'https://example.com/episode',
          payloadJson: JSON.stringify({ content: 'Lanz and Precht debate AI ethics at length.', itemId: 'item-9', title: 'Lanz & Precht #42' }),
          fidelity: 'high'
        }
      ])
    };
    const claude = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }) } };
    const orchestrator = makeOrchestrator({ repo, artifactRepo, claude });

    await orchestrator.run('d1', 'r1');

    expect(artifactRepo.getArtifactsByIds).toHaveBeenCalledWith(['artifact-9']);
    // Every turn prompt carries the shared transcript excerpt.
    for (const call of claude.messages.create.mock.calls) {
      const prompt = call[0].messages.at(-1).content as string;
      expect(prompt).toContain('Lanz and Precht debate AI ethics at length.');
    }
    expect(repo.setRunEvidenceSnapshot).toHaveBeenCalledWith('r1', expect.objectContaining({
      participants: expect.arrayContaining([
        expect.objectContaining({ participantId: 'p2', origin: 'none', sourceItemIds: ['item-9'] })
      ])
    }));
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'done' });
  });

  it('rejects a transcript-grounded run with a clear error when no transcript was selected', async () => {
    vi.clearAllMocks();
    const repo = makeMockRepo();
    repo.getDiscussion = vi.fn().mockResolvedValue({
      ...mockDiscussion,
      formatConfig: { totalTurnTarget: 4, grounding: { mode: 'transcript', artifactIds: [] } }
    });
    const artifactRepo = { listArtifactsForRun: vi.fn(), getArtifactsByIds: vi.fn() };
    const orchestrator = makeOrchestrator({ repo, artifactRepo });

    await orchestrator.run('d1', 'r1');

    expect(repo.createTurn).not.toHaveBeenCalled();
    const lastCall = repo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1].status).toBe('error');
    expect(lastCall[1].errorMessage).toMatch(/no transcript/i);
  });
});
