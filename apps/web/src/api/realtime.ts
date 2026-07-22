/**
 * DTO parsing for the global realtime SSE stream.
 *
 * The backend event schema is `{ id, topic, entityId, createdAt }`. This module owns
 * validating that shape so a malformed payload or an unrecognized topic (e.g. from a
 * newer backend than this client knows about) is rejected instead of dispatched to
 * subscribers.
 *
 * NOTE: the backend now also emits `agent.changed` and `playbook.changed` as own-resource
 * topics, in addition to the five topics originally scoped for this task. Both are
 * included here so parsing does not reject them; `RealtimeProvider` only subscribes
 * `refreshAgents`/`refreshPlaybooks` to them in Task 6.
 */

export type RealtimeTopic =
  | 'source.changed'
  | 'marketplace.changed'
  | 'run.changed'
  | 'report.changed'
  | 'discussion.changed'
  | 'agent.changed'
  | 'playbook.changed';

const REALTIME_TOPICS: ReadonlySet<string> = new Set<RealtimeTopic>([
  'source.changed',
  'marketplace.changed',
  'run.changed',
  'report.changed',
  'discussion.changed',
  'agent.changed',
  'playbook.changed'
]);

export interface RealtimeChange {
  id: number;
  topic: RealtimeTopic;
  entityId: string | null;
  createdAt: string;
}

function isRealtimeTopic(value: unknown): value is RealtimeTopic {
  return typeof value === 'string' && REALTIME_TOPICS.has(value);
}

/** Parses a raw `change` event payload. Returns null for malformed JSON or unknown topics. */
export function parseRealtimeChange(raw: string): RealtimeChange | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;

  if (typeof candidate.id !== 'number' || !Number.isFinite(candidate.id)) return null;
  if (!isRealtimeTopic(candidate.topic)) return null;
  if (candidate.entityId !== null && typeof candidate.entityId !== 'string') return null;
  if (typeof candidate.createdAt !== 'string') return null;

  return {
    id: candidate.id,
    topic: candidate.topic,
    entityId: candidate.entityId,
    createdAt: candidate.createdAt
  };
}
