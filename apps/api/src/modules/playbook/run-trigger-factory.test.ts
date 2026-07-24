import { describe, expect, it, vi } from 'vitest';
import type { AgentRunOptions } from '../analysis/agent-runner';
import type { Playbook } from './types';
import { createPlaybookRunTrigger } from './run-trigger-factory';

describe('createPlaybookRunTrigger', () => {
  it('maps fetched playbook into manual trigger options including playbookId and agentVersionId', async () => {
    const playbook: Playbook = {
      id: 'playbook-1',
      agentId: 'agent-1',
      agentVersionId: 'version-2',
      name: 'pb',
      description: '',
      enabled: true,
      notificationsEnabled: true,
      digestFrequency: 'immediate',
      lastDigestSentAt: null,
      schedule: { mode: 'manual' },
      sourceIds: [],
      recipients: ['a@b.com'],
      executionMode: 'latest_only',
      maxSourcesPerRun: 1,
      maxItemsPerSource: 1,
      language: 'en',
      lastRunAt: null,
      nextRunAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const playbookRepository = {
      getPlaybook: vi.fn(async () => playbook)
    };

    const manualRunTrigger = {
      triggerRun: vi.fn(async (_agentId: string, _options?: AgentRunOptions) => ({ status: 'succeeded' }))
    };

    const runTrigger = createPlaybookRunTrigger(manualRunTrigger, playbookRepository);

    await runTrigger.triggerRun('playbook-1', {});

    expect(playbookRepository.getPlaybook).toHaveBeenCalledWith('playbook-1');
    expect(manualRunTrigger.triggerRun).toHaveBeenCalledWith('agent-1', expect.objectContaining({
      playbookId: 'playbook-1',
      agentVersionId: 'version-2',
      playbookRecipients: ['a@b.com'],
      playbookLanguage: 'en',
      playbookNotificationsEnabled: true,
      playbookDigestFrequency: 'immediate'
    }));
  });
});
