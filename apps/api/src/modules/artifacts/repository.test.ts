import { describe, expect, it } from 'vitest';
import { ArtifactRepository } from './repository';

function createFakeDb() {
  const rows: Array<{
    id: string;
    agentId: string;
    agentRunId: string;
    kind: string;
    sourceRef: string;
    payloadJson: string;
    fidelity: string;
    createdAt: Date;
  }> = [];
  let seq = 0;

  return {
    agentRunArtifact: {
      create: async ({
        data
      }: {
        data: { agentId: string; agentRunId: string; kind: string; sourceRef: string; payloadJson: string; fidelity: string };
      }) => {
        seq += 1;
        const row = { id: `artifact_${seq}`, createdAt: new Date('2026-07-10T00:00:00.000Z'), ...data };
        rows.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { agentRunId: string } }) => rows.filter((r) => r.agentRunId === where.agentRunId)
    }
  };
}

describe('ArtifactRepository', () => {
  it('stores normalized source artifacts for a run', async () => {
    const repo = new ArtifactRepository(createFakeDb() as never);

    const saved = await repo.saveArtifact({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      kind: 'normalized_evidence',
      sourceRef: 'https://example.com/article',
      payloadJson: '{"content":"company guidance"}',
      fidelity: 'high'
    });

    expect(saved.kind).toBe('normalized_evidence');
  });

  it('lists artifacts scoped to a single run', async () => {
    const repo = new ArtifactRepository(createFakeDb() as never);

    await repo.saveArtifact({
      agentId: 'agent-1',
      agentRunId: 'run-1',
      kind: 'normalized_evidence',
      sourceRef: 'ref-1',
      payloadJson: '{}',
      fidelity: 'high'
    });
    await repo.saveArtifact({
      agentId: 'agent-1',
      agentRunId: 'run-2',
      kind: 'normalized_evidence',
      sourceRef: 'ref-2',
      payloadJson: '{}',
      fidelity: 'low'
    });

    const artifacts = await repo.listArtifactsForRun('run-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.sourceRef).toBe('ref-1');
  });
});
