import type { ReportSelectionOrigin } from './types';

export interface ReportResolutionRepo {
  listReportsForAgent(agentId: string): Promise<Array<{ id: string; agentId: string; agentRunId: string; createdAt: Date }>>;
  getReportById(reportId: string): Promise<{ id: string; agentId: string; agentRunId: string } | null>;
}

export interface ParticipantForResolution {
  id: string;
  agentId: string;
  /** Explicit report IDs the user picked for this participant. Empty means "use the fallback". */
  reportIds: string[];
}

export interface ResolvedParticipantReports {
  participantId: string;
  agentId: string;
  reportIds: string[];
  origin: ReportSelectionOrigin;
}

export interface ParticipantResolutionError {
  participantId: string;
  agentId: string;
  message: string;
}

export interface ReportResolutionOutcome {
  resolved: ResolvedParticipantReports[];
  errors: ParticipantResolutionError[];
}

/**
 * Resolves, per discussion participant, which reports should be used as context for the run.
 * If the participant explicitly selected report IDs, those are used (filtered down to reports
 * that actually belong to that participant's agent). Otherwise, falls back to that agent's
 * `latestReportLimit` most recent reports. A participant that resolves to zero reports either
 * way is surfaced as an error instead of being silently dropped, so callers can reject the run.
 */
export async function resolveParticipantReports(
  participants: ParticipantForResolution[],
  repo: ReportResolutionRepo,
  latestReportLimit: number
): Promise<ReportResolutionOutcome> {
  const resolved: ResolvedParticipantReports[] = [];
  const errors: ParticipantResolutionError[] = [];

  for (const participant of participants) {
    let reportIds: string[];
    let origin: ReportSelectionOrigin;

    if (participant.reportIds.length > 0) {
      origin = 'explicit';
      const found = await Promise.all(participant.reportIds.map((id) => repo.getReportById(id)));
      reportIds = found
        .filter((report): report is { id: string; agentId: string; agentRunId: string } => report !== null)
        .filter((report) => report.agentId === participant.agentId)
        .map((report) => report.id);
    } else {
      origin = 'fallback';
      const latest = await repo.listReportsForAgent(participant.agentId);
      reportIds = latest.slice(0, latestReportLimit).map((report) => report.id);
    }

    if (reportIds.length === 0) {
      errors.push({
        participantId: participant.id,
        agentId: participant.agentId,
        message: 'No reports resolved for this participant'
      });
      continue;
    }

    resolved.push({ participantId: participant.id, agentId: participant.agentId, reportIds, origin });
  }

  return { resolved, errors };
}
