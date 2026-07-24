export type SourceType = 'web_urls' | 'podcast_feeds' | 'youtube_videos';
export type SourceStatus = 'active' | 'disabled';
export type SharePermission = 'read' | 'update' | 'delete' | '*';
export type PublicationVisibility = 'public' | 'private';

export interface SourcePreviewItem {
  title: string;
  link?: string;
  pubDate?: string | null;
  imageUrl?: string | null;
  /** Synthetic discussions: whether this run has rendered audio. */
  hasAudio?: boolean;
}

/** Library-card metadata stored for each source; coverImageUrl is nullable so clients can use fallback UI. */
export interface SourceLibraryMetadata {
  title?: string;
  coverImageUrl?: string | null;
  itemCount?: number;
  /** Synthetic discussions: number of runs with rendered audio. */
  audioCount?: number;
  previewItems?: SourcePreviewItem[];
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
    audioCount?: number;
    previewItems: SourcePreviewItem[];
  };
  createdAt: Date;
  updatedAt: Date;
  /** Whether the current user has saved this source into their library (membership). */
  saved?: boolean;
}

export interface CreateSourceInput {
  type: SourceType;
  value: string;
  status?: SourceStatus;
  config?: Record<string, unknown>;
  metadata?: SourceLibraryMetadata;
}

export interface UpdateSourceInput {
  value?: string;
  status?: SourceStatus;
  config?: Record<string, unknown>;
  metadata?: SourceLibraryMetadata;
}

export interface ShareSourceInput {
  granteeUserId: string;
  permission: SharePermission;
  expiresAt?: string;
}

export interface PublishSourceInput {
  title: string;
  summary?: string;
  visibility?: PublicationVisibility;
}

export interface MarketplaceSourceListItem {
  publicationId: string;
  sourceId: string;
  publisherUserId: string;
  type: SourceType;
  value: string;
  title: string;
  summary: string;
  visibility: PublicationVisibility;
  publishedAt: Date;
  metadata: SourceRecord['metadata'];
}

export interface CloneSourceResult {
  source: SourceRecord;
  cloned: boolean;
}
