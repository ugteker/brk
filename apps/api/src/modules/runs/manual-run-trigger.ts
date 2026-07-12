import type { RunQueueService } from './run-queue.service';
import type { AgentRunner, AgentRunOptions } from '../analysis/agent-runner';

/**
 * Backs the "run agent now" button: queues an immediate run for the given agent and processes
 * it synchronously (unlike the scheduler loop, which only picks up queued runs on its next tick),
 * so the caller gets the actual outcome instead of just an "enqueued" acknowledgement.
 */
export class ManualRunTrigger {
  constructor(
    private readonly queue: Pick<RunQueueService, 'enqueueImmediateRun' | 'claimNextRun' | 'completeRun'>,
    private readonly runner: Pick<AgentRunner, 'run'>
  ) {}

  async triggerRun(agentId: string, options?: AgentRunOptions): Promise<{ status: string; errorCode?: string; errorMessage?: string }> {
    await this.queue.enqueueImmediateRun(agentId);
    const run = await this.queue.claimNextRun('manual-trigger');
    if (!run) return { status: 'no_run_claimed' };

    try {
      const result = await this.runner.run(run.agentId, run.id, options);
      await this.queue.completeRun(run.id, result.status, result.errorCode, result.errorMessage);
      return { status: result.status, errorCode: result.errorCode, errorMessage: result.errorMessage };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.queue.completeRun(run.id, 'failed', 'unexpected', errorMessage);
      return { status: 'failed', errorCode: 'unexpected', errorMessage };
    }
  }
}
