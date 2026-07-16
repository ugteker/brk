import type { RunQueueService } from '../runs/run-queue.service';
import type { AgentRunner } from '../analysis/agent-runner';
import { processNextRun as defaultProcessNextRun } from '../runs/worker';

interface StartSchedulerLoopOptions {
  intervalMs: number;
  queue: Pick<RunQueueService, 'enqueueDueRuns' | 'claimNextRun' | 'completeRun' | 'markPlaybookExecuted'>;
  runner: Pick<AgentRunner, 'run'>;
  processNextRun?: (
    workerId: string,
    queue: Pick<RunQueueService, 'claimNextRun' | 'completeRun' | 'markPlaybookExecuted'>,
    runner: Pick<AgentRunner, 'run'>
  ) => Promise<void>;
}

export function startSchedulerLoop(options: StartSchedulerLoopOptions): () => void {
  const { intervalMs, queue, runner } = options;
  const processNextRun = options.processNextRun ?? defaultProcessNextRun;

  const timer = setInterval(async () => {
    await queue.enqueueDueRuns(new Date());
    await processNextRun('worker-1', queue, runner);
  }, intervalMs);

  return () => clearInterval(timer);
}
