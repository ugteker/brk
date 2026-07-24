import { describe, expect, it, vi } from 'vitest';
import { ManualRunTrigger } from './manual-run-trigger';

describe('ManualRunTrigger', () => {
  it('persists and executes the playbook-pinned agent version', async () => {
    const queue = {
      enqueueImmediateRun: vi.fn(async () => undefined),
      claimNextRun: vi.fn(async () => ({
        id: 'run-1',
        agentId: 'agent-1',
        agentVersionId: 'version-2',
        playbookId: 'playbook-1',
        scheduledFor: new Date(),
        status: 'running' as const,
        retryCount: 0
      })),
      completeRun: vi.fn(async () => undefined)
    };
    const runner = {
      run: vi.fn(async () => ({ status: 'succeeded' as const }))
    };
    const trigger = new ManualRunTrigger(queue, runner);

    await trigger.triggerRun('agent-1', {
      agentVersionId: 'version-2',
      playbookId: 'playbook-1'
    });

    expect(queue.enqueueImmediateRun).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Date),
      'playbook-1',
      'version-2'
    );
    expect(runner.run).toHaveBeenCalledWith(
      'agent-1',
      'run-1',
      expect.objectContaining({
        agentVersionId: 'version-2',
        playbookId: 'playbook-1'
      })
    );
  });
});
