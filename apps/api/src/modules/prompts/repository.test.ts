import { describe, expect, it } from 'vitest';
import { PromptRepository } from './repository';

function createFakeDb() {
  const rows: Array<{
    id: string;
    agentId: string;
    version: number;
    model: string;
    systemPrompt: string;
    enabled: boolean;
    createdAt: Date;
  }> = [];
  let seq = 0;

  return {
    agentPromptVersion: {
      findFirst: async ({ where }: { where: { agentId: string } }) => {
        const matches = rows.filter((r) => r.agentId === where.agentId).sort((a, b) => b.version - a.version);
        return matches[0] ?? null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return rows.find((r) => r.id === where.id) ?? null;
      },
      create: async ({
        data
      }: {
        data: { agentId: string; version: number; model: string; systemPrompt: string; enabled: boolean };
      }) => {
        seq += 1;
        const row = {
          id: `prompt_${seq}`,
          agentId: data.agentId,
          version: data.version,
          model: data.model,
          systemPrompt: data.systemPrompt,
          enabled: data.enabled,
          createdAt: new Date('2026-07-10T00:00:00.000Z')
        };
        rows.push(row);
        return row;
      }
    }
  };
}

describe('PromptRepository', () => {
  it('increments prompt versions and returns the latest one', async () => {
    const repo = new PromptRepository(createFakeDb() as never);

    const first = await repo.savePromptVersion('agent-1', {
      model: 'claude-sonnet',
      systemPrompt: 'v1',
      enabled: true
    });

    const second = await repo.savePromptVersion('agent-1', {
      model: 'claude-sonnet',
      systemPrompt: 'v2',
      enabled: true
    });

    expect(second.version).toBe(first.version + 1);
    expect((await repo.getLatestPromptVersion('agent-1'))?.systemPrompt).toBe('v2');
  });

  it('returns null when no prompt version exists yet', async () => {
    const repo = new PromptRepository(createFakeDb() as never);
    expect(await repo.getLatestPromptVersion('agent-unknown')).toBeNull();
  });

  it('retrieves a prompt version by id', async () => {
    const db = createFakeDb();
    const repo = new PromptRepository(db as never);
    const created = await repo.savePromptVersion('agent-1', {
      model: 'claude-sonnet',
      systemPrompt: 'v1',
      enabled: true
    });
    const fetched = await repo.getPromptVersionById(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
  });
});
