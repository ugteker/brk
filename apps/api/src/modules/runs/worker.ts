import type { RunQueueService } from './run-queue.service';
import type { AgentRunner } from '../analysis/agent-runner';

export async function processNextRun(
  workerId: string,
  queue: Pick<RunQueueService, 'claimNextRun' | 'completeRun' | 'markPlaybookExecuted'>,
  runner: Pick<AgentRunner, 'run'>
) {
  const run = await queue.claimNextRun(workerId);
  if (!run) return;

  try {
    const result = await runner.run(run.agentId, run.id, {
      playbookRecipients: run.playbookRecipients,
      playbookLanguage: run.playbookLanguage,
      playbookNotificationsEnabled: run.playbookNotificationsEnabled,
      playbookDigestFrequency: run.playbookDigestFrequency
    });
    await queue.completeRun(run.id, result.status, result.errorCode, result.errorMessage);
  } catch (error) {
    await queue.completeRun(run.id, 'failed', 'unexpected', error instanceof Error ? error.message : String(error));
  } finally {
    // Advance the playbook's nextRunAt regardless of run outcome so the scheduler
    // doesn't re-fire the same overdue time slot on the next tick.
    if (run.playbookId) {
      try {
        await queue.markPlaybookExecuted(run.playbookId);
      } catch {
        // Best-effort: a failure here must not mask the run result.
      }
    }
  }
}
