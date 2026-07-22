export const REALTIME_POLL_MS = 1_000;
export const REALTIME_HEARTBEAT_MS = 15_000;
export const REALTIME_RETENTION_MS = 24 * 60 * 60 * 1000;

export type RealtimeTopic =
  | 'agent.changed'
  | 'playbook.changed'
  | 'source.changed'
  | 'marketplace.changed'
  | 'run.changed'
  | 'report.changed'
  | 'discussion.changed';

export interface RealtimeEventDto {
  id: number;
  topic: RealtimeTopic;
  entityId: string | null;
  // Owning agent id for run.changed/report.changed (entityId stays the run/report id).
  // Absent/null for topics without agent ownership (source.changed, marketplace.changed,
  // discussion.changed, agent.changed, playbook.changed).
  agentId: string | null;
  createdAt: string;
}

export interface RealtimeEventTransaction {
  realtimeEvent: {
    create(args: {
      data: { userId: string; topic: string; entityId: string | null; agentId: string | null };
    }): Promise<unknown>;
  };
}

export interface RealtimeEventWriter {
  append(tx: RealtimeEventTransaction, input: {
    userId: string; topic: RealtimeTopic; entityId?: string; agentId?: string;
  }): Promise<void>;
}
