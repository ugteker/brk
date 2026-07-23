export type SourceType = 'web_urls' | 'podcast_feeds' | 'youtube_videos' | 'synthetic_discussion';
export type SourceStatus = 'active' | 'disabled';
export type SourceSharePermission = 'read' | 'update' | 'delete' | '*';
export type PublicationVisibility = 'public' | 'private';

export interface SourceProbePreviewItem {
  title: string;
  link: string | null;
  pubDate: string | null;
}

export interface SourceProbeResult {
  reachable: boolean;
  kind: 'feed' | 'listing_page' | 'single_page' | 'unknown';
  title?: string;
  coverImageUrl?: string;
  itemCount?: number;
  confidence?: number;
  warning?: string;
  maxItemsPerRun?: number;
  previewItems?: SourceProbePreviewItem[];
}

export interface SourceRecord {
  id: string;
  ownerUserId: string;
  type: SourceType;
  value: string;
  status: SourceStatus;
  config: Record<string, unknown>;
  metadata: {
    title?: string;
    coverImageUrl: string | null;
    itemCount?: number;
    /** Synthetic discussions: number of runs with rendered audio. */
    audioCount?: number;
    previewItems: Array<{ title: string; link?: string; pubDate?: string | null; hasAudio?: boolean }>;
  };
  createdAt: string;
  updatedAt: string;
  /** Count of reports whose generating run referenced this source's evidence, scoped per
   * source (not per agent). Optional client-side: absent on responses from older API
   * deployments, so callers must default to 0 rather than treat it as always present. */
  reportCount?: number;
}

export interface CreateSourcePayload {
  type: SourceType;
  value: string;
  status?: SourceStatus;
  config?: Record<string, unknown>;
  metadata?: {
    title?: string;
    coverImageUrl?: string | null;
    itemCount?: number;
    previewItems?: Array<{ title: string; link?: string; pubDate?: string | null }>;
  };
}

export interface UpdateSourcePayload {
  value?: string;
  status?: SourceStatus;
  config?: Record<string, unknown>;
  metadata?: {
    title?: string;
    coverImageUrl?: string | null;
    itemCount?: number;
    previewItems?: Array<{ title: string; link?: string; pubDate?: string | null }>;
  };
}

export interface ShareSourcePayload {
  granteeUserId: string;
  permission: SourceSharePermission;
  expiresAt?: string;
}

export interface PublishSourcePayload {
  title: string;
  summary?: string;
  visibility?: PublicationVisibility;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function createSource(payload: CreateSourcePayload): Promise<SourceRecord> {
  const response = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to create source'));
  }
  return response.json();
}

export async function listSources(): Promise<SourceRecord[]> {
  const response = await fetch('/api/sources');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load sources'));
  }
  return response.json();
}

export async function getSource(sourceId: string): Promise<SourceRecord> {
  const response = await fetch(`/api/sources/${sourceId}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load source'));
  }
  return response.json();
}

/** Reports whose generating run actually crawled this source (across all agents) - not
 * every report of every agent whose playbook merely links the source. */
export async function listSourceReports<T = unknown>(sourceId: string): Promise<T[]> {
  const response = await fetch(`/api/sources/${sourceId}/reports`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load source reports'));
  }
  return response.json();
}

export async function updateSource(sourceId: string, payload: UpdateSourcePayload): Promise<SourceRecord> {
  const response = await fetch(`/api/sources/${sourceId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to update source'));
  }
  return response.json();
}

export async function deleteSource(sourceId: string): Promise<void> {
  const response = await fetch(`/api/sources/${sourceId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to remove source'));
  }
}

export async function shareSource(sourceId: string, payload: ShareSourcePayload): Promise<void> {
  const response = await fetch(`/api/sources/${sourceId}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to share source'));
  }
}

export async function publishSource(sourceId: string, payload: PublishSourcePayload): Promise<{ publicationId: string }> {
  const response = await fetch(`/api/sources/${sourceId}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to publish source'));
  }
  return response.json();
}

export async function probeSource(source: { type: SourceType; value: string; maxItems?: number }): Promise<SourceProbeResult> {
  const payload = JSON.stringify(source);
  const primaryResponse = await fetch('/api/sources/probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload
  });

  // TODO: Remove legacy retry once all deployed backends expose /api/sources/probe.
  if (primaryResponse.status === 404) {
    const legacyResponse = await fetch('/api/agents/sources/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload
    });
    if (!legacyResponse.ok) {
      throw new Error(await parseErrorMessage(legacyResponse, 'Failed to probe source'));
    }
    return legacyResponse.json();
  }

  if (!primaryResponse.ok) {
    throw new Error(await parseErrorMessage(primaryResponse, 'Failed to probe source'));
  }
  return primaryResponse.json();
}

export interface SourceSearchResultItem {
  type: 'podcast_feeds' | 'youtube_videos';
  value: string;
  title: string;
  author?: string;
  coverImageUrl: string | null;
}

export interface SourceSearchResponse {
  results: SourceSearchResultItem[];
  warnings: string[];
}

/** Name-based source search: podcasts (iTunes) + YouTube channels. */
export async function searchSources(query: string): Promise<SourceSearchResponse> {
  const response = await fetch(`/api/sources/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to search sources'));
  }
  return response.json();
}

export interface SourceSuggestion {
  type: SourceType;
  value: string;
  title: string;
  author?: string;
  coverImageUrl: string | null;
  origin: 'marketplace' | 'curated';
  publicationId?: string;
  followed: boolean;
}

/** Curated "popular sources" (marketplace-first, minus sources the user already follows). */
export async function listSourceSuggestions(): Promise<SourceSuggestion[]> {
  const response = await fetch('/api/sources/suggestions');
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load source suggestions'));
  }
  return response.json();
}

