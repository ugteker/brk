export type RunStatus = 'queued' | 'running' | 'succeeded' | 'succeeded_no_new_content' | 'failed';

// Sub-stage of a currently-`running` run, surfaced in the Runs view so users can see what the
// agent is actually doing right now rather than just an opaque spinner. `null`/undefined means no
// phase has been recorded yet (e.g. a run that hasn't started, or predates this feature).
export type RunPhase = 'crawling' | 'analyzing' | 'notifying';

export interface AgentScheduleRecord {
  agentId: string;
  nextRunAt: Date;
  enabled: boolean;
  playbookId?: string;
}

export interface AgentRunRecord {
  id: string;
  agentId: string;
  scheduledFor: Date;
  status: RunStatus;
  phase?: RunPhase | null;
  workerId?: string;
  startedAt?: Date;
  finishedAt?: Date;
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
  // Set when the run was triggered by a Playbook schedule, carrying the notification
  // context (recipients/language/notifications flag) so the worker can pass them to the agent runner.
  playbookId?: string;
  playbookRecipients?: string[];
  playbookLanguage?: string;
  playbookNotificationsEnabled?: boolean;
  playbookDigestFrequency?: string;
}

export interface RunStore {
  getDueSchedules(now: Date): Promise<AgentScheduleRecord[]>;
  upsertQueuedRun(agentId: string, scheduledFor: Date, playbookId?: string): Promise<void>;
  claimNextQueuedRun(workerId: string): Promise<AgentRunRecord | null>;
  setPhase(runId: string, phase: RunPhase): Promise<void>;
  completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void>;
  markPlaybookExecuted(playbookId: string): Promise<void>;
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

  async upsertQueuedRun(agentId: string, scheduledFor: Date, playbookId?: string): Promise<void> {
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
      phase: null,
      retryCount: 0,
      playbookId
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

  async setPhase(runId: string, phase: RunPhase): Promise<void> {
    const run = this.runs.find((r) => r.id === runId);
    if (!run) return;
    run.phase = phase;
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
    run.phase = null;
    run.finishedAt = new Date();
    run.errorCode = errorCode;
    run.errorMessage = errorMessage;
  }

  // No-op for in-memory store (used in tests); override in subclasses if needed.
  async markPlaybookExecuted(_playbookId: string): Promise<void> {}
}

export class RunQueueService {
  constructor(private readonly store: RunStore) {}

  async enqueueDueRuns(now: Date): Promise<number> {
    const due = await this.store.getDueSchedules(now);
    for (const schedule of due) {
      await this.store.upsertQueuedRun(schedule.agentId, schedule.nextRunAt, schedule.playbookId);
    }
    return due.length;
  }

  async enqueueImmediateRun(agentId: string, now: Date = new Date()): Promise<void> {
    await this.store.upsertQueuedRun(agentId, now);
  }

  async claimNextRun(workerId: string): Promise<AgentRunRecord | null> {
    return this.store.claimNextQueuedRun(workerId);
  }

  async setPhase(runId: string, phase: RunPhase): Promise<void> {
    await this.store.setPhase(runId, phase);
  }

  async completeRun(
    runId: string,
    status: 'succeeded' | 'succeeded_no_new_content' | 'failed',
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await this.store.completeRun(runId, status, errorCode, errorMessage);
  }

  async markPlaybookExecuted(playbookId: string): Promise<void> {
    await this.store.markPlaybookExecuted(playbookId);
  }
}
