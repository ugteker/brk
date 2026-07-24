import { describe, expect, it, vi } from 'vitest';
import { processNextRun } from './worker';

describe('processNextRun', () => {
  it('passes the claimed playbook and agent version to the runner', async () => {
    const queue = {
      claimNextRun: vi.fn(async () => ({
        id: 'run-1',
        agentId: 'agent-1',
        agentVersionId: 'version-4',
        playbookId: 'playbook-2',
        scheduledFor: new Date(),
        status: 'running' as const,
        retryCount: 0
      })),
      completeRun: vi.fn(async () => undefined),
      markPlaybookExecuted: vi.fn(async () => undefined)
    };
    const runner = {
      run: vi.fn(async () => ({ status: 'succeeded' as const }))
    };

    await processNextRun('worker-1', queue, runner);

    expect(runner.run).toHaveBeenCalledWith(
      'agent-1',
      'run-1',
      expect.objectContaining({
        agentVersionId: 'version-4',
        playbookId: 'playbook-2'
      })
    );
  });
});
