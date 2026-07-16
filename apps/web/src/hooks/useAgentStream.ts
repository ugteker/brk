import { useEffect, useState } from 'react';
import type { RunDetailDto, RunReportDto } from '../api/agents';

/**
 * Subscribes to the server-sent event stream for a specific agent.
 * Replaces the 4-second client-side polling interval with a persistent SSE
 * connection that the server drives at 2s (active runs) / 20s (idle) cadence.
 * The browser's native EventSource automatically reconnects on network errors.
 */
export function useAgentStream(agentId: string | null) {
  const [runs, setRuns] = useState<RunDetailDto[]>([]);
  const [reports, setReports] = useState<RunReportDto[]>([]);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setRuns([]);
      setReports([]);
      setStreamError(false);
      return;
    }

    const es = new EventSource(`/api/agents/${agentId}/stream`);

    es.addEventListener('runs', (e: MessageEvent<string>) => {
      try { setRuns(JSON.parse(e.data) as RunDetailDto[]); } catch { /* ignore */ }
    });

    es.addEventListener('reports', (e: MessageEvent<string>) => {
      try { setReports(JSON.parse(e.data) as RunReportDto[]); } catch { /* ignore */ }
    });

    es.addEventListener('error', () => {
      setStreamError(true);
      // EventSource will retry automatically; clear the error flag on next message
    });

    es.addEventListener('message', () => setStreamError(false));

    return () => {
      es.close();
      setStreamError(false);
    };
  }, [agentId]);

  return { runs, setRuns, reports, setReports, streamError };
}
