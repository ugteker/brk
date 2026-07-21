import { describe, expect, it, vi } from 'vitest';
import { buildTranscriptEvidence, TRANSCRIPT_EXCERPT_MAX_CHARS } from './evidence';

function artifactRow(overrides: Partial<{
  id: string;
  sourceRef: string;
  payloadJson: string;
  fidelity: string;
}> = {}) {
  return {
    id: 'artifact-1',
    sourceRef: 'https://example.com/a',
    payloadJson: JSON.stringify({ content: 'Some raw transcript content.', itemId: 'item-1' }),
    fidelity: 'high',
    ...overrides
  };
}

describe('buildTranscriptEvidence', () => {
  it('produces a bounded excerpt and source item id for a resolved report with an artifact', async () => {
    const artifactRepo = { listArtifactsForRun: vi.fn().mockResolvedValue([artifactRow()]) };

    const result = await buildTranscriptEvidence([{ id: 'report-1', agentRunId: 'run-1' }], artifactRepo);

    expect(result.warnings).toHaveLength(0);
    expect(result.sourceItemIds).toEqual(['item-1']);
    expect(result.excerptText).toContain('Some raw transcript content.');
  });

  it('falls back to the artifact id when the evidence block has no itemId', async () => {
    const artifactRepo = {
      listArtifactsForRun: vi.fn().mockResolvedValue([
        artifactRow({ id: 'artifact-9', payloadJson: JSON.stringify({ content: 'No item id here.' }) })
      ])
    };

    const result = await buildTranscriptEvidence([{ id: 'report-1', agentRunId: 'run-1' }], artifactRepo);

    expect(result.sourceItemIds).toEqual(['artifact-9']);
  });

  it('truncates excerpts longer than the bounded max length', async () => {
    const longContent = 'x'.repeat(TRANSCRIPT_EXCERPT_MAX_CHARS + 500);
    const artifactRepo = {
      listArtifactsForRun: vi.fn().mockResolvedValue([artifactRow({ payloadJson: JSON.stringify({ content: longContent, itemId: 'item-1' }) })])
    };

    const result = await buildTranscriptEvidence([{ id: 'report-1', agentRunId: 'run-1' }], artifactRepo);

    expect(result.excerptText.length).toBeLessThan(longContent.length);
    expect(result.excerptText).toContain('…');
  });

  it('adds a warning (not a failure) when a report has no raw transcript material', async () => {
    const artifactRepo = { listArtifactsForRun: vi.fn().mockResolvedValue([]) };

    const result = await buildTranscriptEvidence([{ id: 'report-1', agentRunId: 'run-1' }], artifactRepo);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/report-1/);
    expect(result.sourceItemIds).toHaveLength(0);
    expect(result.excerptText).toBe('');
  });

  it('combines excerpts across multiple resolved reports for a participant', async () => {
    const artifactRepo = {
      listArtifactsForRun: vi
        .fn()
        .mockResolvedValueOnce([artifactRow({ id: 'a1', payloadJson: JSON.stringify({ content: 'Report one content.', itemId: 'item-1' }) })])
        .mockResolvedValueOnce([artifactRow({ id: 'a2', payloadJson: JSON.stringify({ content: 'Report two content.', itemId: 'item-2' }) })])
    };

    const result = await buildTranscriptEvidence(
      [
        { id: 'report-1', agentRunId: 'run-1' },
        { id: 'report-2', agentRunId: 'run-2' }
      ],
      artifactRepo
    );

    expect(result.sourceItemIds).toEqual(['item-1', 'item-2']);
    expect(result.excerptText).toContain('Report one content.');
    expect(result.excerptText).toContain('Report two content.');
  });

  it('ignores artifacts whose payload cannot be parsed instead of throwing', async () => {
    const artifactRepo = {
      listArtifactsForRun: vi.fn().mockResolvedValue([artifactRow({ payloadJson: 'not json' })])
    };

    const result = await buildTranscriptEvidence([{ id: 'report-1', agentRunId: 'run-1' }], artifactRepo);

    expect(result.warnings).toHaveLength(1);
    expect(result.excerptText).toBe('');
  });
});
