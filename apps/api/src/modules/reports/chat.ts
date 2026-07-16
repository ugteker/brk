import type { PrismaClient } from '@prisma/client';
import type { ReportRepository } from './repository';
import type { ArtifactRepository } from '../artifacts/repository';
import type { PromptRepository } from '../prompts/repository';
import type { RunReportRecord } from './types';

// Keeps the grounding context safely inside the model's input window even for runs whose
// evidence was a very long transcript. Evidence beyond the budget is truncated, not dropped.
const EVIDENCE_CHAR_BUDGET = 24_000;
// Only the most recent turns are replayed to Claude - old turns fall out of the prompt (they
// stay persisted and visible in the UI).
const MAX_HISTORY_MESSAGES = 20;

export type ReportChatRole = 'user' | 'assistant';

export interface ReportChatMessageRecord {
  id: string;
  reportId: string;
  userId: string;
  role: ReportChatRole;
  content: string;
  createdAt: Date;
}

export interface ReportChatRepositoryLike {
  listMessages(reportId: string, userId: string): Promise<ReportChatMessageRecord[]>;
  saveMessage(input: { reportId: string; userId: string; role: ReportChatRole; content: string }): Promise<ReportChatMessageRecord>;
}

export class ReportChatRepository implements ReportChatRepositoryLike {
  constructor(private readonly db: Pick<PrismaClient, 'reportChatMessage'>) {}

  async listMessages(reportId: string, userId: string): Promise<ReportChatMessageRecord[]> {
    const rows = await this.db.reportChatMessage.findMany({
      where: { reportId, userId },
      orderBy: { createdAt: 'asc' }
    });
    return rows.map((row: any) => ({
      id: row.id,
      reportId: row.reportId,
      userId: row.userId,
      role: row.role as ReportChatRole,
      content: row.content,
      createdAt: row.createdAt
    }));
  }

  async saveMessage(input: { reportId: string; userId: string; role: ReportChatRole; content: string }): Promise<ReportChatMessageRecord> {
    const row = await this.db.reportChatMessage.create({ data: input });
    return {
      id: row.id,
      reportId: row.reportId,
      userId: row.userId,
      role: row.role as ReportChatRole,
      content: row.content,
      createdAt: row.createdAt
    };
  }
}

export class InMemoryReportChatRepository implements ReportChatRepositoryLike {
  messages: ReportChatMessageRecord[] = [];
  private seq = 0;

  async listMessages(reportId: string, userId: string): Promise<ReportChatMessageRecord[]> {
    return this.messages
      .filter((m) => m.reportId === reportId && m.userId === userId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async saveMessage(input: { reportId: string; userId: string; role: ReportChatRole; content: string }): Promise<ReportChatMessageRecord> {
    this.seq += 1;
    const record: ReportChatMessageRecord = { id: `chat-${this.seq}`, createdAt: new Date(), ...input };
    this.messages.push(record);
    return record;
  }
}

function formatSignalsForPrompt(report: RunReportRecord): string {
  if (report.signals.length === 0) return '(no signals in this report)';
  return report.signals
    .map((s) => `- ${s.symbol} ${s.side.toUpperCase()} (confidence ${s.confidence}%): ${s.rationale}`)
    .join('\n');
}

export function buildReportChatSystemPrompt(input: {
  agentName: string;
  personaSystemPrompt: string;
  report: RunReportRecord;
  evidenceTexts: Array<{ sourceRef: string; content: string }>;
}): string {
  let remaining = EVIDENCE_CHAR_BUDGET;
  const evidenceSections: string[] = [];
  for (const block of input.evidenceTexts) {
    if (remaining <= 0) break;
    const slice = block.content.slice(0, remaining);
    remaining -= slice.length;
    evidenceSections.push(`### Source: ${block.sourceRef}\n${slice}`);
  }

  return [
    input.personaSystemPrompt,
    '',
    '---',
    `You are now answering follow-up questions about a report you (analyst "${input.agentName}") previously produced.`,
    'Ground every answer strictly in the report and the evidence below. If the answer is not supported by them, say so explicitly instead of speculating. Keep answers concise. This is informational analysis only - never present it as financial advice.',
    '',
    '## Report summary',
    input.report.summary,
    '',
    '## Report signals',
    formatSignalsForPrompt(input.report),
    '',
    '## Evidence the report was based on',
    evidenceSections.length > 0 ? evidenceSections.join('\n\n') : '(evidence unavailable for this report)'
  ].join('\n');
}

export interface ReportChatClaudeLike {
  chat(params: {
    model: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<{ text: string }>;
}

export interface ReportChatServiceDeps {
  reportRepository: Pick<ReportRepository, 'getReportById'>;
  artifactRepository: Pick<ArtifactRepository, 'listArtifactsForRun'>;
  promptRepository: Pick<PromptRepository, 'getLatestPromptVersion'>;
  agentRepository: { getAgent(agentId: string): Promise<{ id: string; name: string } | null> };
  chatRepository: ReportChatRepositoryLike;
  claudeClient: ReportChatClaudeLike;
}

export type AskResult =
  | { ok: true; messages: ReportChatMessageRecord[] }
  | { ok: false; code: 'not_found' | 'missing_prompt_version' };

export class ReportChatService {
  constructor(private readonly deps: ReportChatServiceDeps) {}

  async listMessages(reportId: string, userId: string): Promise<ReportChatMessageRecord[]> {
    return this.deps.chatRepository.listMessages(reportId, userId);
  }

  /**
   * Persists the user's question, asks Claude with the report + its crawled evidence as grounding
   * context (plus recent chat history for follow-ups), persists the answer, and returns both new
   * messages. The user message is saved before the Claude call so a failed/interrupted answer
   * doesn't lose the question.
   */
  async ask(agentId: string, reportId: string, userId: string, question: string): Promise<AskResult> {
    const report = await this.deps.reportRepository.getReportById(reportId);
    if (!report || report.agentId !== agentId) {
      return { ok: false, code: 'not_found' };
    }
    const agent = await this.deps.agentRepository.getAgent(agentId);
    if (!agent) {
      return { ok: false, code: 'not_found' };
    }
    const promptVersion = await this.deps.promptRepository.getLatestPromptVersion(agentId);
    if (!promptVersion) {
      return { ok: false, code: 'missing_prompt_version' };
    }

    const artifacts = await this.deps.artifactRepository.listArtifactsForRun(report.agentRunId);
    const evidenceTexts = artifacts
      .filter((artifact) => artifact.kind === 'normalized_evidence')
      .map((artifact) => {
        try {
          const parsed = JSON.parse(artifact.payloadJson) as { sourceRef?: string; title?: string; content?: string };
          return { sourceRef: parsed.title || parsed.sourceRef || artifact.sourceRef, content: parsed.content ?? '' };
        } catch {
          return { sourceRef: artifact.sourceRef, content: '' };
        }
      })
      .filter((block) => block.content.length > 0);

    const history = await this.deps.chatRepository.listMessages(reportId, userId);
    const userMessage = await this.deps.chatRepository.saveMessage({ reportId, userId, role: 'user', content: question });

    const system = buildReportChatSystemPrompt({
      agentName: agent.name,
      personaSystemPrompt: promptVersion.systemPrompt,
      report,
      evidenceTexts
    });
    const conversation = [...history.slice(-MAX_HISTORY_MESSAGES), userMessage].map((message) => ({
      role: message.role,
      content: message.content
    }));

    const answer = await this.deps.claudeClient.chat({
      model: promptVersion.model,
      system,
      messages: conversation
    });
    const assistantMessage = await this.deps.chatRepository.saveMessage({
      reportId,
      userId,
      role: 'assistant',
      content: answer.text
    });

    return { ok: true, messages: [userMessage, assistantMessage] };
  }
}
