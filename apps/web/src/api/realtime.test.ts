import { describe, expect, it } from 'vitest';
import { parseRealtimeChange } from './realtime';

describe('parseRealtimeChange', () => {
  it('parses a change event including agentId for run.changed', () => {
    const raw = JSON.stringify({
      id: 1,
      topic: 'run.changed',
      entityId: 'run-1',
      agentId: 'agent-1',
      createdAt: '2026-07-22T10:00:00.000Z'
    });

    expect(parseRealtimeChange(raw)).toEqual({
      id: 1,
      topic: 'run.changed',
      entityId: 'run-1',
      agentId: 'agent-1',
      createdAt: '2026-07-22T10:00:00.000Z'
    });
  });

  it('defaults agentId to null when the field is absent (older/other-topic events)', () => {
    const raw = JSON.stringify({
      id: 2,
      topic: 'source.changed',
      entityId: 'source-1',
      createdAt: '2026-07-22T10:00:00.000Z'
    });

    expect(parseRealtimeChange(raw)).toEqual({
      id: 2,
      topic: 'source.changed',
      entityId: 'source-1',
      agentId: null,
      createdAt: '2026-07-22T10:00:00.000Z'
    });
  });

  it('defaults agentId to null when the field is explicitly null', () => {
    const raw = JSON.stringify({
      id: 3,
      topic: 'discussion.changed',
      entityId: 'discussion-1',
      agentId: null,
      createdAt: '2026-07-22T10:00:00.000Z'
    });

    expect(parseRealtimeChange(raw)?.agentId).toBeNull();
  });

  it('rejects a payload whose agentId is neither string nor null', () => {
    const raw = JSON.stringify({
      id: 4,
      topic: 'run.changed',
      entityId: 'run-1',
      agentId: 42,
      createdAt: '2026-07-22T10:00:00.000Z'
    });

    expect(parseRealtimeChange(raw)).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseRealtimeChange('not json')).toBeNull();
  });

  it('rejects an unrecognized topic', () => {
    const raw = JSON.stringify({
      id: 5,
      topic: 'unknown.topic',
      entityId: null,
      createdAt: '2026-07-22T10:00:00.000Z'
    });

    expect(parseRealtimeChange(raw)).toBeNull();
  });
});
