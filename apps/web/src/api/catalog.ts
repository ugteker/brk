import type { SourceType } from './sources';
import type { RunReportDto } from './reports';

export interface CatalogSource {
  publicationId: string;
  sourceId: string;
  slug: string;
  title: string;
  summary: string;
  type: SourceType;
  value: string;
  coverImageUrl: string | null;
  editorialRank: number;
  saved: boolean;
}

export interface CatalogAgent {
  publicationId: string;
  agentId: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
}

export interface CatalogDemo {
  slug: string;
  sourcePublicationId: string;
  agentPublicationId: string;
  title: string;
  disclosure: string;
  report: RunReportDto;
}

export interface CatalogResponse {
  sources: CatalogSource[];
  agents: CatalogAgent[];
  demos: CatalogDemo[];
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.message === 'string' ? body.message : fallback;
  } catch {
    return fallback;
  }
}

export async function listCatalog(locale: string): Promise<CatalogResponse> {
  const response = await fetch(`/api/catalog?locale=${encodeURIComponent(locale)}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Failed to load catalog'));
  }
  return response.json();
}
