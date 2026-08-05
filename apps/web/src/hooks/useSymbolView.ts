import { useEffect, useState } from 'react';
import type { AgentSummary } from '../api/agents';

export interface SymbolView {
  agentId: string;
  symbol: string;
}

/**
 * Owns the SymbolPerformancePage overlay state and applies the `?agentId=&symbol=` deep
 * link from report notification emails. Runs once agents have loaded (so the linked agent
 * can be validated), then strips the two params from the URL so refreshing or navigating
 * afterwards doesn't repeatedly re-trigger it.
 */
export function useSymbolView(agents: AgentSummary[]) {
  const [symbolView, setSymbolView] = useState<SymbolView | null>(null);
  const [hasAppliedDeepLink, setHasAppliedDeepLink] = useState(false);

  useEffect(() => {
    if (hasAppliedDeepLink) return;
    if (agents.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const linkedAgentId = params.get('agentId');
    const linkedSymbol = params.get('symbol');
    setHasAppliedDeepLink(true);
    if (!linkedAgentId || !linkedSymbol) return;
    if (agents.some((agent) => agent.id === linkedAgentId)) {
      setSymbolView({ agentId: linkedAgentId, symbol: linkedSymbol });
    }
    params.delete('agentId');
    params.delete('symbol');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [agents, hasAppliedDeepLink]);

  return { symbolView, setSymbolView };
}
