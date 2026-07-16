import { describe, it, expect, vi } from 'vitest';
import { DiscussionOrchestrator } from './orchestrator';

const participant1 = { id: 'p1', discussionId: 'd1', agentId: 'a1', role: 'speaker' as const, voiceId: 'alloy' as const, speakerOrder: 0 };
const participant2 = { id: 'p2', discussionId: 'd1', agentId: 'a2', role: 'speaker' as const, voiceId: 'echo' as const, speakerOrder: 1 };

const mockDiscussion = {
  id: 'd1', ownerUserId: 'u1', name: 'Test Discussion', description: '',
  format: 'free_form' as const, formatConfig: { totalTurnTarget: 4 },
  scheduleJson: null, syntheticSourceId: null,
  createdAt: new Date(), updatedAt: new Date(),
  participants: [participant1, participant2]
};

const mockRepo = {
  getDiscussion: vi.fn().mockResolvedValue(mockDiscussion),
  getRunWithTurns: vi.fn().mockResolvedValue({ id: 'r1', status: 'running', turns: [
    { id: 't1', discussionRunId: 'r1', participantId: 'p1', turnIndex: 0, segmentLabel: null, content: 'Hello', audioUrl: null, createdAt: new Date() }
  ]}),
  updateRun: vi.fn().mockResolvedValue(undefined),
  createTurn: vi.fn().mockResolvedValue({ id: 't1', turnIndex: 0 }),
  setSyntheticSourceId: vi.fn().mockResolvedValue(undefined),
  createDiscussion: vi.fn(),
  listDiscussions: vi.fn(),
  updateDiscussion: vi.fn(),
  deleteDiscussion: vi.fn(),
  createRun: vi.fn(),
  listRuns: vi.fn(),
  updateTurnAudioUrl: vi.fn(),
};

const mockAgentRepo = {
  getAgent: vi.fn().mockResolvedValue({ id: 'a1', name: 'Bull', characterType: 'finance_expert' })
};

const mockPromptRepo = {
  getLatestPromptVersion: vi.fn().mockResolvedValue({ systemPrompt: 'You are Bull, a bullish analyst.' })
};

const mockReportRepo = {
  listReportsForAgent: vi.fn().mockResolvedValue([{ summary: 'NVDA is a buy.', createdAt: new Date() }])
};

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

function makeOrchestrator(claudeOverride?: any) {
  return new DiscussionOrchestrator({
    discussionRepository: mockRepo as any,
    agentRepository: mockAgentRepo as any,
    promptRepository: mockPromptRepo as any,
    reportRepository: mockReportRepo as any,
    claudeClient: claudeOverride ?? mockClaude as any,
    syntheticSource: mockSyntheticSource as any
  });
}

describe('DiscussionOrchestrator', () => {
  it('runs discussion and creates turns, marks done', async () => {
    vi.clearAllMocks();
    mockRepo.updateRun.mockResolvedValue(undefined);
    const orchestrator = makeOrchestrator();
    await orchestrator.run('d1', 'r1');
    expect(mockRepo.createTurn).toHaveBeenCalled();
    const lastCall = mockRepo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'done' });
  });

  it('marks run as error if Claude throws', async () => {
    vi.clearAllMocks();
    const failingClaude = { messages: { create: vi.fn().mockRejectedValue(new Error('API error')) } };
    const orchestrator = makeOrchestrator(failingClaude);
    await orchestrator.run('d1', 'r1');
    const lastCall = mockRepo.updateRun.mock.calls.at(-1)!;
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
    const notFoundRepo = { ...mockRepo, getDiscussion: vi.fn().mockResolvedValue(null) };
    const orchestrator = new DiscussionOrchestrator({
      discussionRepository: notFoundRepo as any,
      agentRepository: mockAgentRepo as any,
      promptRepository: mockPromptRepo as any,
      reportRepository: mockReportRepo as any,
      claudeClient: mockClaude as any,
      syntheticSource: mockSyntheticSource as any
    });
    await orchestrator.run('missing', 'r1');
    const lastCall = notFoundRepo.updateRun.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ status: 'error' });
  });
});
