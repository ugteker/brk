import type { ClaudeAnalysisResult } from './types';
import type { SignalRecord } from '../reports/types';

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

export function parseClaudeResponse(raw: RawClaudeResponse): ClaudeAnalysisResult {
  if (typeof raw.summary !== 'string') {
    throw new ClaudeResponseParseError('response is missing a summary');
  }
  if (!Array.isArray(raw.signals)) {
    throw new ClaudeResponseParseError('response is missing a signals array');
  }

  return {
    summary: raw.summary,
    signals: raw.signals.map((signal, index) => parseSignal(signal as RawSignal, index)),
    sourceWarnings: Array.isArray(raw.sourceWarnings)
      ? raw.sourceWarnings.filter((w): w is string => typeof w === 'string')
      : [],
    needsHumanReview: raw.needsHumanReview === true
  };
}
