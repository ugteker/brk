export type SourceType = 'web_urls' | 'podcast_feeds';

export type ScheduleInput =
  | { mode: 'interval'; intervalMinutes: number }
  | { mode: 'daily'; dailyTime: string; timezone: string };

export interface CreateAgentInput {
  name: string;
  description?: string;
  sources: Array<{ type: SourceType; value: string; frequencyMinutes?: number }>;
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
  sources: Array<{ type: SourceType; value: string; frequencyMinutes: number }>;
  preferences: Record<string, string[]>;
  recipients: string[];
  schedule: ScheduleInput | null;
}

export interface RecentRun {
  id: string;
  agentId: string;
  agentName: string;
  status: string;
  scheduledFor: Date;
  finishedAt: Date | null;
}
