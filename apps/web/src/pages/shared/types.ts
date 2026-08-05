import type { AgentDetail } from '../../api/agents';
import type { PromptVersionDto } from '../../api/agents';
import type { SourceType } from '../../api/sources';

export type HubKey = 'feed' | 'sources' | 'agents' | 'playbooks';
export type ProbeKind = 'feed' | 'listing_page' | 'single_page' | 'unknown';
export type AgentEditor =
  | { mode: 'manual-create' }
  | { mode: 'manual-edit'; detail: AgentDetail; prompt: PromptVersionDto | null }
  | { mode: 'curation-create' }
  | { mode: 'curation-update'; detail: AgentDetail; prompt: PromptVersionDto | null }
  | null;

export interface LibraryTabRecord {
  id: string;
  name: string;
}

export interface AutoDetectedSource {
  type: SourceType;
  url: string;
  kind: ProbeKind;
  title?: string;
  coverImageUrl?: string;
  itemCount?: number;
  previewItems: Array<{ title: string; link: string | null; pubDate: string | null; imageUrl?: string | null }>;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' }
];

export const DEFAULT_LIBRARY_TAB_ID = 'library-default';
export const DEFAULT_LIBRARY_TAB_NAME = 'My Collection';
export const LIBRARY_GUIDANCE_KEY = 'brk:library:add-source-guidance-seen';
