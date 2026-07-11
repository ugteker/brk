export interface CreatePromptVersionInput {
  model: string;
  systemPrompt: string;
  enabled: boolean;
}

export interface PromptVersionRecord {
  id: string;
  agentId: string;
  version: number;
  model: string;
  systemPrompt: string;
  enabled: boolean;
  createdAt: Date;
}
