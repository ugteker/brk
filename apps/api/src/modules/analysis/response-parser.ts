import type { ClaudeAnalysisResult } from './types';
import type { SignalRecord } from '../reports/types';
import { DEFAULT_CHARACTER_TYPE } from '../agents/types';
import type { CharacterType } from '../agents/types';
import { normalizeUnifiedCharacterReport, ReportShapeValidationError } from '../reports/unified-report';

interface RawSignal {
  symbol?: unknown;
  side?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  citations?: unknown;
}

interface RawClaudeResponse {
  summary?: unknown;
  signals?: unknown;
  common?: unknown;
  section?: unknown;
  sourceWarnings?: unknown;
  needsHumanReview?: unknown;
}

export class ClaudeResponseParseError extends Error {}

function parseSignal(raw: RawSignal, index: number): SignalRecord {
  if (typeof raw.symbol !== 'string' || raw.symbol.length === 0) {
    throw new ClaudeResponseParseError(`signal[${index}] is missing a symbol`);
  }
  if (raw.side !== 'long' && raw.side !== 'short') {
    throw new ClaudeResponseParseError(`signal[${index}] has an invalid side: ${String(raw.side)}`);
  }
  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 100) {
    throw new ClaudeResponseParseError(`signal[${index}] has an invalid confidence: ${String(raw.confidence)}`);
  }

  return {
    symbol: raw.symbol,
    side: raw.side,
    confidence: raw.confidence,
    rationale: typeof raw.rationale === 'string' ? raw.rationale : '',
    citations: Array.isArray(raw.citations) ? raw.citations.filter((c): c is string => typeof c === 'string') : []
  };
}

export function parseClaudeResponse(raw: RawClaudeResponse, characterType: CharacterType = DEFAULT_CHARACTER_TYPE): ClaudeAnalysisResult {
  const legacySummary = typeof raw.summary === 'string' ? raw.summary : '';
  const legacySignals = Array.isArray(raw.signals) ? raw.signals.map((signal, index) => parseSignal(signal as RawSignal, index)) : [];

  if (!raw.common && !raw.summary) {
    throw new ClaudeResponseParseError('response is missing a summary');
  }

  let report;
  try {
    report = normalizeUnifiedCharacterReport({
      characterType,
      candidate: raw.common || raw.section ? { common: raw.common, section: raw.section } : undefined,
      legacySummary,
      legacySignals
    });
  } catch (error) {
    if (error instanceof ReportShapeValidationError) {
      throw new ClaudeResponseParseError(error.message);
    }
    throw error;
  }

  return {
    summary: report.common.summary,
    signals: report.section.character_type === 'finance_expert' ? report.section.signals : [],
    report,
    sourceWarnings: Array.isArray(raw.sourceWarnings)
      ? raw.sourceWarnings.filter((w): w is string => typeof w === 'string')
      : [],
    needsHumanReview: raw.needsHumanReview === true
  };
}
