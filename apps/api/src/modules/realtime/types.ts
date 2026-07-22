export const REALTIME_POLL_MS = 1_000;
export const REALTIME_HEARTBEAT_MS = 15_000;
export const REALTIME_RETENTION_MS = 24 * 60 * 60 * 1000;

export type RealtimeTopic =
  | 'source.changed'
  | 'marketplace.changed'
  | 'run.changed'
  | 'report.changed'
  | 'discussion.changed';

export interface RealtimeEventDto {
  id: number;
  topic: RealtimeTopic;
  entityId: string | null;
  createdAt: string;
}

export interface RealtimeEventTransaction {
  realtimeEvent: {
    create(args: { data: { userId: string; topic: string; entityId: string | null } }): Promise<unknown>;
  };
}

export interface RealtimeEventWriter {
  append(tx: RealtimeEventTransaction, input: {
    userId: string; topic: RealtimeTopic; entityId?: string;
  }): Promise<void>;
}
