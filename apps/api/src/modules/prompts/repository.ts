import type { PrismaClient } from '@prisma/client';
import type { CreatePromptVersionInput, PromptVersionRecord } from './types';

type PromptDb = Pick<PrismaClient, 'agentPromptVersion'>;

export class PromptRepository {
  constructor(private readonly db: PromptDb) {}

  async savePromptVersion(agentId: string, input: CreatePromptVersionInput): Promise<PromptVersionRecord> {
    return this.createPromptVersion(agentId, input);
  }

  async saveCuratedPromptVersion(
    agentId: string,
    input: CreatePromptVersionInput,
    curationSessionId: string
  ): Promise<PromptVersionRecord> {
    const existing = await this.getPromptVersionByCurationSessionId(curationSessionId);
    if (existing) {
      if (existing.agentId !== agentId) {
        throw new Error('curation_prompt_agent_mismatch');
      }
      return existing;
    }

    try {
      return await this.createPromptVersion(agentId, input, curationSessionId);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      const recovered = await this.getPromptVersionByCurationSessionId(curationSessionId);
      if (!recovered || recovered.agentId !== agentId) {
        throw error;
      }
      return recovered;
    }
  }

  async getPromptVersionByCurationSessionId(curationSessionId: string): Promise<PromptVersionRecord | null> {
    const prompt = await this.db.agentPromptVersion.findUnique({ where: { curationSessionId } });
    return prompt ? this.toRecord(prompt) : null;
  }

  async getPromptVersionById(agentVersionId: string): Promise<PromptVersionRecord | null> {
    const prompt = await this.db.agentPromptVersion.findUnique({ where: { id: agentVersionId } });
    return prompt ? this.toRecord(prompt) : null;
  }

  private async createPromptVersion(
    agentId: string,
    input: CreatePromptVersionInput,
    curationSessionId?: string
  ): Promise<PromptVersionRecord> {
    const latest = await this.db.agentPromptVersion.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' }
    });

    const nextVersion = (latest?.version ?? 0) + 1;

    const created = await this.db.agentPromptVersion.create({
      data: {
        agentId,
        version: nextVersion,
        model: input.model,
        systemPrompt: input.systemPrompt,
        enabled: input.enabled,
        basedOnAgentVersionId: input.basedOnAgentVersionId ?? null,
        ...(curationSessionId === undefined ? {} : { curationSessionId })
      }
    });

    return this.toRecord(created);
  }

  async getLatestPromptVersion(agentId: string): Promise<PromptVersionRecord | null> {
    const latest = await this.db.agentPromptVersion.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' }
    });

    return latest ? this.toRecord(latest) : null;
  }

  private toRecord(row: {
    id: string;
    agentId: string;
    version: number;
    model: string;
    systemPrompt: string;
    name: string;
    description: string;
    characterType: string;
    promptConfigJson: string;
    iconAssetKey: string | null;
    basedOnAgentVersionId: string | null;
    enabled: boolean;
    publishedAt: Date | null;
    createdAt: Date;
  }): PromptVersionRecord {
    return {
      id: row.id,
      agentId: row.agentId,
      version: row.version,
      model: row.model,
      systemPrompt: row.systemPrompt,
      enabled: row.enabled,
      name: row.name,
      description: row.description,
      characterType: row.characterType,
      promptConfigJson: row.promptConfigJson,
      iconAssetKey: row.iconAssetKey,
      basedOnAgentVersionId: row.basedOnAgentVersionId,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
