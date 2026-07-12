import type { RunQueueService } from './run-queue.service';
import type { AgentRunner } from '../analysis/agent-runner';

export async function processNextRun(
  workerId: string,
  queue: Pick<RunQueueService, 'claimNextRun' | 'completeRun'>,
  runner: Pick<AgentRunner, 'run'>
) {
  const run = await queue.claimNextRun(workerId);
  if (!run) return;

  try {
    const result = await runner.run(run.agentId, run.id);
    await queue.completeRun(run.id, result.status, result.errorCode, result.errorMessage);
  } catch (error) {
    await queue.completeRun(run.id, 'failed', 'unexpected', error instanceof Error ? error.message : String(error));
  }
}
