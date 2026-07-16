export type DiscussionFormat = 'free_form' | 'structured' | 'hosted' | 'hybrid';
export type DiscussionRunStatus = 'pending' | 'running' | 'done' | 'error';
export type DiscussionTrigger = 'manual' | 'auto_suggested' | 'scheduled';
export type ParticipantRole = 'speaker' | 'host';
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface DiscussionFormatConfig {
  segments?: string[];
  maxTurnsPerSegment?: number;
  totalTurnTarget?: number;
  hostInstructions?: string;
}

export interface DiscussionParticipant {
  id: string;
  discussionId: string;
  agentId: string;
  role: ParticipantRole;
  voiceId: OpenAIVoice;
  speakerOrder: number;
}

export interface Discussion {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  format: DiscussionFormat;
  formatConfig: DiscussionFormatConfig;
  scheduleJson: string | null;
  syntheticSourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: DiscussionParticipant[];
}

export interface DiscussionTurn {
  id: string;
  discussionRunId: string;
  participantId: string;
  turnIndex: number;
  segmentLabel: string | null;
  content: string;
  audioUrl: string | null;
  createdAt: Date;
}

export interface DiscussionRun {
  id: string;
  discussionId: string;
  status: DiscussionRunStatus;
  triggeredBy: DiscussionTrigger;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  syntheticSourceItemId: string | null;
  audioUrl: string | null;
  createdAt: Date;
  turns: DiscussionTurn[];
}

export interface CreateDiscussionInput {
  name: string;
  description?: string;
  format: DiscussionFormat;
  formatConfig?: DiscussionFormatConfig;
  scheduleJson?: string;
  participants: Array<{
    agentId: string;
    role: ParticipantRole;
    voiceId: OpenAIVoice;
    speakerOrder: number;
  }>;
}

export interface UpdateDiscussionInput {
  name?: string;
  description?: string;
  format?: DiscussionFormat;
  formatConfig?: DiscussionFormatConfig;
  scheduleJson?: string | null;
}
