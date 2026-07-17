/** Max characters kept per raw transcript/source-material excerpt included in a discussion
 * director prompt - bounded so a single long transcript can't blow out the prompt budget. */
export const TRANSCRIPT_EXCERPT_MAX_CHARS = 600;

/** Max number of raw evidence artifacts pulled in per resolved report, to keep the combined
 * excerpt for a participant bounded even when a report cites many sources. */
export const MAX_ARTIFACTS_PER_REPORT = 2;

export interface EvidenceArtifactRepo {
  listArtifactsForRun(agentRunId: string): Promise<Array<{ id: string; sourceRef: string; payloadJson: string; fidelity: string }>>;
}

export interface ReportForEvidence {
  id: string;
  agentRunId: string;
}

export interface TranscriptEvidence {
  /** Combined, bounded excerpt text ready to inject into a director/turn prompt. */
  excerptText: string;
  /** IDs of the underlying source items (or, when unavailable, the artifact id) the excerpts
   * came from - persisted in the run's evidence snapshot for traceability. */
  sourceItemIds: string[];
  /** Non-fatal warnings for reports whose raw transcript/source material couldn't be found or
   * parsed. Missing material never fails the run. */
  warnings: string[];
}

function truncate(content: string): string {
  if (content.length <= TRANSCRIPT_EXCERPT_MAX_CHARS) return content;
  return `${content.slice(0, TRANSCRIPT_EXCERPT_MAX_CHARS)}…`;
}

/**
 * Builds bounded, automatically-included transcript/source-material excerpts for a set of
 * already-resolved reports (there is no user transcript opt-in - if a report has raw evidence
 * artifacts, a bounded excerpt of them is always included). Missing or unparsable artifacts
 * produce a warning rather than throwing, so a run can still proceed with partial evidence.
 */
export async function buildTranscriptEvidence(
  reports: ReportForEvidence[],
  artifactRepo: EvidenceArtifactRepo
): Promise<TranscriptEvidence> {
  const excerpts: string[] = [];
  const sourceItemIds: string[] = [];
  const warnings: string[] = [];

  for (const report of reports) {
    const artifacts = await artifactRepo.listArtifactsForRun(report.agentRunId);
    if (artifacts.length === 0) {
      warnings.push(`No raw transcript/source material found for report ${report.id}`);
      continue;
    }

    let addedAny = false;
    for (const artifact of artifacts.slice(0, MAX_ARTIFACTS_PER_REPORT)) {
      let parsed: { content?: unknown; itemId?: unknown } | null = null;
      try {
        parsed = JSON.parse(artifact.payloadJson);
      } catch {
        parsed = null;
      }

      const content = typeof parsed?.content === 'string' ? parsed.content : null;
      if (!content) continue;

      excerpts.push(truncate(content));
      const itemId = typeof parsed?.itemId === 'string' && parsed.itemId.length > 0 ? parsed.itemId : artifact.id;
      sourceItemIds.push(itemId);
      addedAny = true;
    }

    if (!addedAny) {
      warnings.push(`No raw transcript/source material found for report ${report.id}`);
    }
  }

  return { excerptText: excerpts.join('\n\n'), sourceItemIds, warnings };
}
