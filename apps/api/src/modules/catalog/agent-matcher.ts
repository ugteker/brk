import type { SourceType } from '../source/types';
import type { AgentMatch, AgentMatchReason, AgentOwnership } from './types';

export interface RankableSource {
  type: SourceType;
  topics: string[];
  language?: string | null;
}

export interface RankableAgentCandidate {
  publicationId: string | null;
  agentVersionId: string;
  ownership: AgentOwnership;
  name: string;
  purpose: string;
  iconAssetKey: string | null;
  sourceTypes: string[];
  topics: string[];
  language?: string | null;
  editorialRank: number;
}

export interface RankAgentMatchesInput {
  source: RankableSource;
  agents: RankableAgentCandidate[];
}

function normalizeLanguage(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  return trimmed.split('-')[0] ?? trimmed;
}

function uniqueNormalized(values: string[]): Map<string, string> {
  const entries = new Map<string, string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length > 0 && !entries.has(normalized)) {
      entries.set(normalized, value);
    }
  }
  return entries;
}

function buildReasons(source: RankableSource, agent: RankableAgentCandidate): AgentMatchReason[] {
  const reasons: AgentMatchReason[] = [];
  const sourceTopics = uniqueNormalized(source.topics);
  const agentTopics = uniqueNormalized(agent.topics);

  for (const [normalized, original] of sourceTopics) {
    if (agentTopics.has(normalized)) {
      reasons.push({ code: 'topic', value: original });
      break;
    }
  }

  if (agent.sourceTypes.includes(source.type)) {
    reasons.push({ code: 'source_type', value: source.type });
  }

  const sourceLanguage = normalizeLanguage(source.language);
  if (sourceLanguage && normalizeLanguage(agent.language) === sourceLanguage) {
    reasons.push({ code: 'language', value: sourceLanguage });
  }

  return reasons.slice(0, 2);
}

function editorialScore(editorialRank: number): number {
  const normalized = Number.isFinite(editorialRank) ? Math.max(0, Math.trunc(editorialRank)) : 0;
  return Math.max(0, 9 - Math.min(normalized, 9));
}

export function rankAgentMatches(input: RankAgentMatchesInput): AgentMatch[] {
  const sourceTopics = new Set([...uniqueNormalized(input.source.topics).keys()]);
  const sourceLanguage = normalizeLanguage(input.source.language);

  return [...input.agents]
    .map((agent) => {
      const agentTopics = new Set([...uniqueNormalized(agent.topics).keys()]);
      const topicMatches = [...sourceTopics].filter((topic) => agentTopics.has(topic)).length;
      const sourceTypeMatches = agent.sourceTypes.includes(input.source.type) ? 1 : 0;
      const languageMatches = sourceLanguage && normalizeLanguage(agent.language) === sourceLanguage ? 1 : 0;
      const score =
        topicMatches * 10_000 +
        sourceTypeMatches * 1_000 +
        languageMatches * 100 +
        (agent.ownership === 'owned' ? 10 : 0) +
        editorialScore(agent.editorialRank);

      return {
        publicationId: agent.publicationId,
        agentVersionId: agent.agentVersionId,
        ownership: agent.ownership,
        name: agent.name,
        purpose: agent.purpose,
        iconAssetKey: agent.iconAssetKey,
        reasons: buildReasons(input.source, agent),
        score,
        updateAvailable: false,
        latestAgentVersionId: null
      } satisfies AgentMatch;
    })
    .sort((left, right) => right.score - left.score || left.agentVersionId.localeCompare(right.agentVersionId));
}
