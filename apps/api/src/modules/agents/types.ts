export type SourceType = 'web_urls' | 'podcast_feeds' | 'youtube_videos';

export type ScheduleInput =
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string }
  | { mode: 'weekly'; daysOfWeek: number[]; dailyTime: string; timezone: string };

export interface CreateAgentInput {
  name: string;
  description?: string;
  active?: boolean;
  sources: Array<{ type: SourceType; value: string; frequencyMinutes?: number; maxItems?: number }>;
  preferences: Record<string, string[]>;
  recipients: string[];
  schedule: ScheduleInput;
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
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sources: Array<{ type: SourceType; value: string; frequencyMinutes: number; maxItems: number }>;
  preferences: Record<string, string[]>;
  recipients: string[];
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
