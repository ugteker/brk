import type { PlaybookRecord } from './playbooks';
import type { SourceRecord } from './sources';

export interface MarketplaceSourceListItem {
  publicationId: string;
  sourceId: string;
  publisherUserId: string;
  type: SourceRecord['type'];
  value: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private';
  publishedAt: string;
  metadata: SourceRecord['metadata'];
}

export interface CloneSourceResult {
  source: SourceRecord;
  cloned: boolean;
}

export interface MarketplacePlaybookListItem {
  publicationId: string;
  playbookId: string;
  publisherUserId: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private';
  publishedAt: string;
  playbook: PlaybookRecord;
}

export interface ClonePlaybookResult {
  playbook: PlaybookRecord;
  cloned: boolean;
}

export interface MarketplaceAgentListItem {
  publicationId: string;
  agentId: string;
  publisherUserId: string;
  title: string;
  summary: string;
  visibility: 'public' | 'private';
  publishedAt: string;
  agent: {
    id: string;
    name: string;
    description: string;
  };
}

export interface CloneAgentResult {
  agent: { id: string; name: string };
  cloned: boolean;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function listMarketplaceSources(): Promise<MarketplaceSourceListItem[]> {
  const response = await fetch('/api/sources/marketplace');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load marketplace sources'));
  }
  return response.json();
}

export async function cloneMarketplaceSource(publicationId: string): Promise<CloneSourceResult> {
  const response = await fetch(`/api/sources/marketplace/${publicationId}/clone`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to clone marketplace source'));
  }
  return response.json();
}

export async function listMarketplacePlaybooks(): Promise<MarketplacePlaybookListItem[]> {
  const response = await fetch('/api/playbooks/marketplace');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load marketplace playbooks'));
  }
  return response.json();
}

export async function cloneMarketplacePlaybook(publicationId: string): Promise<ClonePlaybookResult> {
  const response = await fetch(`/api/playbooks/marketplace/${publicationId}/clone`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to clone marketplace playbook'));
  }
  return response.json();
}

export async function listMarketplaceAgents(): Promise<MarketplaceAgentListItem[]> {
  const response = await fetch('/api/agents/marketplace');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load marketplace agents'));
  }
  return response.json();
}

export async function cloneMarketplaceAgent(publicationId: string): Promise<CloneAgentResult> {
  const response = await fetch(`/api/agents/marketplace/${publicationId}/clone`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to clone marketplace agent'));
  }
  return response.json();
}
