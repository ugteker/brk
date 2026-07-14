export type PlaybookScheduleInput =
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string }
  | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };

export type PlaybookExecutionMode = 'latest_only' | 'all_sources';
export type PlaybookSharePermission = 'read' | 'edit' | 'delete' | 'execute';
export type PublicationVisibility = 'public' | 'private';

export interface CreatePlaybookInput {
  agentId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  schedule?: PlaybookScheduleInput;
  sourceIds: string[];
  recipients?: string[];
  executionMode?: PlaybookExecutionMode;
  maxSourcesPerRun?: number;
  maxItemsPerSource?: number;
}

export interface UpdatePlaybookInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  schedule?: PlaybookScheduleInput;
  sourceIds?: string[];
  recipients?: string[];
  executionMode?: PlaybookExecutionMode;
  maxSourcesPerRun?: number;
  maxItemsPerSource?: number;
}

export interface Playbook {
  id: string;
  agentId: string;
  name: string;
  description: string;
  enabled: boolean;
  schedule: PlaybookScheduleInput;
  sourceIds: string[];
  recipients: string[];
  executionMode: PlaybookExecutionMode;
  maxSourcesPerRun: number;
  maxItemsPerSource: number;
  lastRunAt: Date | null;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharePlaybookInput {
  granteeUserId: string;
  permission: PlaybookSharePermission;
  expiresAt?: string;
}

export interface PublishPlaybookInput {
  title: string;
  summary?: string;
  visibility?: PublicationVisibility;
}

export interface MarketplacePlaybookListItem {
  publicationId: string;
  playbookId: string;
  publisherUserId: string;
  title: string;
  summary: string;
  visibility: PublicationVisibility;
  publishedAt: Date;
  playbook: Playbook;
}

export interface ClonePlaybookResult {
  playbook: Playbook;
  cloned: boolean;
}
