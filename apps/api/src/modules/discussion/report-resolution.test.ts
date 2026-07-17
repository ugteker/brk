import { describe, expect, it, vi } from 'vitest';
import { resolveParticipantReports } from './report-resolution';

function makeReportRepo(overrides: Partial<{
  listReportsForAgent: ReturnType<typeof vi.fn>;
  getReportById: ReturnType<typeof vi.fn>;
}> = {}) {
  return {
    listReportsForAgent: vi.fn().mockResolvedValue([]),
    getReportById: vi.fn().mockResolvedValue(null),
    ...overrides
  };
}

describe('resolveParticipantReports', () => {
  it('resolves explicit report ids when the participant selected some', async () => {
    const repo = makeReportRepo({
      getReportById: vi.fn().mockImplementation(async (id: string) =>
        id === 'r1' ? { id: 'r1', agentId: 'a1', agentRunId: 'run1' } : null
      )
    });

    const result = await resolveParticipantReports(
      [{ id: 'p1', agentId: 'a1', reportIds: ['r1'] }],
      repo,
      3
    );

    expect(result.errors).toHaveLength(0);
    expect(result.resolved).toEqual([{ participantId: 'p1', agentId: 'a1', reportIds: ['r1'], origin: 'explicit' }]);
    expect(repo.listReportsForAgent).not.toHaveBeenCalled();
  });

  it('falls back to latest N reports when no explicit selection was made', async () => {
    const repo = makeReportRepo({
      listReportsForAgent: vi.fn().mockResolvedValue([
        { id: 'r3', agentId: 'a1', agentRunId: 'run3', createdAt: new Date('2026-07-03') },
        { id: 'r2', agentId: 'a1', agentRunId: 'run2', createdAt: new Date('2026-07-02') },
        { id: 'r1', agentId: 'a1', agentRunId: 'run1', createdAt: new Date('2026-07-01') }
      ])
    });

    const result = await resolveParticipantReports(
      [{ id: 'p1', agentId: 'a1', reportIds: [] }],
      repo,
      2
    );

    expect(result.errors).toHaveLength(0);
    expect(result.resolved).toEqual([
      { participantId: 'p1', agentId: 'a1', reportIds: ['r3', 'r2'], origin: 'fallback' }
    ]);
  });

  it('supports mixed explicit and fallback resolution across participants', async () => {
    const repo = makeReportRepo({
      getReportById: vi.fn().mockImplementation(async (id: string) =>
        id === 'rX' ? { id: 'rX', agentId: 'a1', agentRunId: 'runX' } : null
      ),
      listReportsForAgent: vi.fn().mockImplementation(async (agentId: string) =>
        agentId === 'a2' ? [{ id: 'rY', agentId: 'a2', agentRunId: 'runY', createdAt: new Date() }] : []
      )
    });

    const result = await resolveParticipantReports(
      [
        { id: 'p1', agentId: 'a1', reportIds: ['rX'] },
        { id: 'p2', agentId: 'a2', reportIds: [] }
      ],
      repo,
      3
    );

    expect(result.errors).toHaveLength(0);
    expect(result.resolved).toEqual([
      { participantId: 'p1', agentId: 'a1', reportIds: ['rX'], origin: 'explicit' },
      { participantId: 'p2', agentId: 'a2', reportIds: ['rY'], origin: 'fallback' }
    ]);
  });

  it('ignores explicit report ids that do not belong to the participant agent', async () => {
    const repo = makeReportRepo({
      getReportById: vi.fn().mockResolvedValue({ id: 'rOther', agentId: 'someone-else', agentRunId: 'run1' })
    });

    const result = await resolveParticipantReports(
      [{ id: 'p1', agentId: 'a1', reportIds: ['rOther'] }],
      repo,
      3
    );

    expect(result.resolved).toHaveLength(0);
    expect(result.errors).toEqual([
      { participantId: 'p1', agentId: 'a1', message: 'No reports resolved for this participant' }
    ]);
  });

  it('produces an error for a participant with no explicit selection and no reports at all', async () => {
    const repo = makeReportRepo();

    const result = await resolveParticipantReports(
      [{ id: 'p1', agentId: 'a1', reportIds: [] }],
      repo,
      3
    );

    expect(result.resolved).toHaveLength(0);
    expect(result.errors).toEqual([
      { participantId: 'p1', agentId: 'a1', message: 'No reports resolved for this participant' }
    ]);
  });
});
