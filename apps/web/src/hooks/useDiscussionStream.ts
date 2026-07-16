import { useEffect, useRef, useState } from 'react';
import type { DiscussionTurnDto } from '../api/discussions';

export function useDiscussionStream(discussionId: string, runId: string | null) {
  const [turns, setTurns] = useState<DiscussionTurnDto[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;
    setStatus('running');
    setTurns([]);
    const es = new EventSource(`/api/discussions/${discussionId}/runs/${runId}/stream`, { withCredentials: true });
    esRef.current = es;

    es.addEventListener('turn', (e) => {
      const turn: DiscussionTurnDto = JSON.parse((e as MessageEvent).data);
      setTurns((prev) => {
        const exists = prev.some((t) => t.id === turn.id);
        return exists ? prev : [...prev, turn].sort((a, b) => a.turnIndex - b.turnIndex);
      });
    });

    es.addEventListener('done', () => {
      setStatus('done');
      es.close();
    });

    es.addEventListener('error', () => {
      setStatus('error');
      es.close();
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [discussionId, runId]);

  return { turns, status };
}
