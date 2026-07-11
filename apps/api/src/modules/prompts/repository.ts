import type { PrismaClient } from '@prisma/client';
import type { CreatePromptVersionInput, PromptVersionRecord } from './types';

type PromptDb = Pick<PrismaClient, 'agentPromptVersion'>;

export class PromptRepository {
  constructor(private readonly db: PromptDb) {}

  async savePromptVersion(agentId: string, input: CreatePromptVersionInput): Promise<PromptVersionRecord> {
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
        enabled: input.enabled
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
    enabled: boolean;
    createdAt: Date;
  }): PromptVersionRecord {
    return {
      id: row.id,
      agentId: row.agentId,
      version: row.version,
      model: row.model,
      systemPrompt: row.systemPrompt,
      enabled: row.enabled,
      createdAt: row.createdAt
    };
  }
}
