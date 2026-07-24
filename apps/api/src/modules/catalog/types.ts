import type { CharacterType } from '../agents/types';
import type { SourceType } from '../source/types';

export interface CatalogPreviewItem {
  title: string;
  link?: string;
  pubDate?: string | null;
  hasAudio?: boolean;
}

export interface CatalogSourceMetadata {
  title?: string;
  coverImageUrl: string | null;
  itemCount?: number;
  audioCount?: number;
  previewItems: CatalogPreviewItem[];
}

export interface CatalogSource {
  publicationId: string;
  sourceId: string;
  slug: string;
  catalogVersion: number;
  locale: string;
  title: string;
  summary: string;
  type: SourceType;
  value: string;
  saved: boolean;
  sourceTypes: string[];
  topics: string[];
  editorialRank: number;
  metadata: CatalogSourceMetadata;
}

export interface CatalogAgent {
  publicationId: string;
  agentId: string;
  agentVersionId: string;
  slug: string;
  catalogVersion: number;
  locale: string;
  title: string;
  summary: string;
  name: string;
  description: string;
  characterType: CharacterType;
  saved: boolean;
  sourceTypes: string[];
  topics: string[];
  iconAssetKey: string | null;
  editorialRank: number;
}

export interface CatalogDemo {
  slug: string;
  locale: string;
  title: string;
  disclosure: string;
  sourcePublicationId: string;
  agentPublicationId: string;
  sourceSlug: string;
  agentSlug: string;
  report: unknown;
}

export interface CatalogResponse {
  sources: CatalogSource[];
  agents: CatalogAgent[];
  demos: CatalogDemo[];
}

export type AgentOwnership = 'owned' | 'curated';

export type AgentMatchReasonCode = 'topic' | 'source_type' | 'language';

export interface AgentMatchReason {
  code: AgentMatchReasonCode;
  value: string;
}

export interface AgentMatch {
  agentVersionId: string;
  publicationId: string | null;
  ownership: AgentOwnership;
  name: string;
  purpose: string;
  characterType: CharacterType | null;
  iconAssetKey: string | null;
  sourceTypes: string[];
  topics: string[];
  language: string | null;
  reasons: AgentMatchReason[];
  score: number;
  updateAvailable: boolean;
  latestAgentVersionId: string | null;
}
