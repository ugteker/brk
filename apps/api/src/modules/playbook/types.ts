export type PlaybookScheduleInput =
  | { mode: 'manual' }
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string }
  | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };

export type PlaybookExecutionMode = 'latest_only' | 'all_sources';
// 'immediate' keeps the classic one-email-per-run behavior; 'daily'/'weekly' suppress per-run
// emails and instead send a single rollup digest covering every report produced in the period.
export type DigestFrequency = 'immediate' | 'daily' | 'weekly';
export type PlaybookSharePermission = 'read' | 'edit' | 'delete' | 'execute';
export type PublicationVisibility = 'public' | 'private';
export type FollowTargetType = 'channel' | 'episode';

export interface CreatePlaybookInput {
  agentId: string;
  agentVersionId?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  schedule?: PlaybookScheduleInput;
  sourceIds: string[];
  recipients?: string[];
  executionMode?: PlaybookExecutionMode;
  maxSourcesPerRun?: number;
  maxItemsPerSource?: number;
  followTargetType?: FollowTargetType;
  followTargetKey?: string;
  followTargetTitle?: string;
  language?: string;
}

export interface UpdatePlaybookInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  notificationsEnabled?: boolean;
  digestFrequency?: DigestFrequency;
  schedule?: PlaybookScheduleInput;
  sourceIds?: string[];
  recipients?: string[];
  executionMode?: PlaybookExecutionMode;
  maxSourcesPerRun?: number;
  maxItemsPerSource?: number;
  followTargetType?: FollowTargetType | null;
  followTargetKey?: string | null;
  followTargetTitle?: string | null;
  language?: string;
}

export interface Playbook {
  id: string;
  agentId: string;
  agentVersionId: string | null;
  name: string;
  description: string;
  enabled: boolean;
  notificationsEnabled: boolean;
  digestFrequency: DigestFrequency;
  lastDigestSentAt: Date | null;
  schedule: PlaybookScheduleInput;
  sourceIds: string[];
  recipients: string[];
  executionMode: PlaybookExecutionMode;
  maxSourcesPerRun: number;
  maxItemsPerSource: number;
  followTargetType?: FollowTargetType | null;
  followTargetKey?: string | null;
  followTargetTitle?: string | null;
  language: string;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
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
