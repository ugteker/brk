export type SourceType = 'web_urls' | 'podcast_feeds' | 'youtube_videos';
export type CharacterType = 'finance_expert' | 'teacher' | 'trainer' | 'philosopher' | 'influencer' | 'summarizer';

export const CHARACTER_TYPES: CharacterType[] = [
  'finance_expert',
  'teacher',
  'trainer',
  'philosopher',
  'influencer',
  'summarizer'
];

export const DEFAULT_CHARACTER_TYPE: CharacterType = 'summarizer';

export interface PromptConfig {
  tone?: string;
  depth?: string;
  format_style?: string;
  audience?: string;
  output_length?: string;
  custom_instructions?: string;
  risk_level?: string;
}

export type ScheduleInput =
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string }
  | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };

export interface CreateAgentInput {
  name: string;
  description?: string;
  active?: boolean;
  characterType?: CharacterType;
  promptConfig?: PromptConfig;
  sources?: Array<{ type: SourceType; value: string; frequencyMinutes?: number; maxItems?: number }>;
  preferences?: Record<string, string[]>;
  schedule?: ScheduleInput;
}

export type AgentSharePermission = 'read' | 'edit' | 'delete';
export type PublicationVisibility = 'public' | 'private';

export interface ShareAgentInput {
  granteeUserId: string;
  permission: AgentSharePermission;
  expiresAt?: string;
}

export interface AgentShareRecord {
  id: string;
  grantedByUserId: string;
  granteeUserId: string;
  permission: AgentSharePermission;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface Agent {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  characterType: CharacterType;
  promptConfig: PromptConfig;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sources: Array<{ type: SourceType; value: string; frequencyMinutes: number; maxItems: number }>;
  preferences: Record<string, string[]>;
  schedule: ScheduleInput | null;
}

/**
 * Extended shape returned by the dashboard's agent list endpoint - adds lightweight run/report
 * counters (and the most recent report's timestamp) so the dashboard can show an at-a-glance
 * summary per agent without a separate detail fetch per card.
 */
export interface AgentListItem extends Agent {
  runCount: number;
  reportCount: number;
  latestReportAt: Date | null;
}

export interface RecentRun {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  scheduledFor: Date;
  finishedAt: Date | null;
}

export interface PublishAgentInput {
  title: string;
  summary?: string;
  visibility?: PublicationVisibility;
}

export interface MarketplaceAgentListItem {
  publicationId: string;
  agentId: string;
  publisherUserId: string;
  title: string;
  summary: string;
  visibility: PublicationVisibility;
  publishedAt: Date;
  agent: Agent;
}

export interface CloneAgentResult {
  agent: Agent;
  cloned: boolean;
}
