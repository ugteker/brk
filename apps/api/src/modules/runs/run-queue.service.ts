export type RunStatus = 'queued' | 'running' | 'succeeded' | 'succeeded_no_new_content' | 'failed';

export interface AgentScheduleRecord {
  agentId: string;
  nextRunAt: Date;
  enabled: boolean;
}

export interface AgentRunRecord {
  id: string;
  agentId: string;
  scheduledFor: Date;
  status: RunStatus;
  workerId?: string;
  startedAt?: Date;
  finishedAt?: Date;
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface RunStore {
  getDueSchedules(now: Date): Promise<AgentScheduleRecord[]>;
  upsertQueuedRun(agentId: string, scheduledFor: Date): Promise<void>;
  claimNextQueuedRun(workerId: string): Promise<AgentRunRecord | null>;
  completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void>;
}

export class InMemoryRunStore implements RunStore {
  schedules: AgentScheduleRecord[] = [];
  runs: AgentRunRecord[] = [];
  private seq = 0;

  async addSchedule(schedule: AgentScheduleRecord): Promise<void> {
    this.schedules.push(schedule);
  }

  async getDueSchedules(now: Date): Promise<AgentScheduleRecord[]> {
    return this.schedules.filter((s) => s.enabled && s.nextRunAt.getTime() <= now.getTime());
  }

  async upsertQueuedRun(agentId: string, scheduledFor: Date): Promise<void> {
    const exists = this.runs.some(
      (r) => r.agentId === agentId && r.scheduledFor.getTime() === scheduledFor.getTime()
    );
    if (exists) return;

    this.seq += 1;
    this.runs.push({
      id: `run-${this.seq}`,
      agentId,
      scheduledFor,
      status: 'queued',
      retryCount: 0
    });
  }

  async claimNextQueuedRun(workerId: string): Promise<AgentRunRecord | null> {
    const queued = this.runs
      .filter((r) => r.status === 'queued')
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime())[0];

    if (!queued) return null;

    queued.status = 'running';
    queued.workerId = workerId;
    queued.startedAt = new Date();
    return queued;
  }

  async completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) return;
    run.status = status;
    run.finishedAt = new Date();
    run.errorCode = errorCode;
    run.errorMessage = errorMessage;
  }
}

export class RunQueueService {
  constructor(private readonly store: RunStore) {}

  async enqueueDueRuns(now: Date): Promise<number> {
    const due = await this.store.getDueSchedules(now);
    for (const schedule of due) {
      await this.store.upsertQueuedRun(schedule.agentId, schedule.nextRunAt);
    }
    return due.length;
  }

  async enqueueImmediateRun(agentId: string, now: Date = new Date()): Promise<void> {
    await this.store.upsertQueuedRun(agentId, now);
  }

  async claimNextRun(workerId: string): Promise<AgentRunRecord | null> {
    return this.store.claimNextQueuedRun(workerId);
  }

  async completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.store.completeRun(runId, status, errorCode, errorMessage);
  }
}
