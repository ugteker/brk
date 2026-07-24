export interface CreatePromptVersionInput {
  model: string;
  systemPrompt: string;
  enabled: boolean;
  basedOnAgentVersionId?: string | null;
}

export interface PromptVersionRecord {
  id: string;
  agentId: string;
  version: number;
  model: string;
  systemPrompt: string;
  enabled: boolean;
  name: string;
  description: string;
  characterType: string;
  promptConfigJson: string;
  iconAssetKey: string | null;
  basedOnAgentVersionId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}
