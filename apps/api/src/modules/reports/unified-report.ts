import type { CharacterType } from '../agents/types';
import type {
  FinanceExpertSection,
  SignalRecord,
  UnifiedCharacterReport,
  UnifiedCharacterSection,
  UnifiedReportCommonFields
} from './types';

export class ReportShapeValidationError extends Error {}

interface NormalizeUnifiedCharacterReportInput {
  characterType: CharacterType;
  candidate?: unknown;
  legacySummary?: string;
  legacySignals?: SignalRecord[];
}

const EMPTY_COMMON: UnifiedReportCommonFields = {
  summary: '',
  key_takeaways: [],
  sources_used: [],
  citations: []
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeCommon(candidate: unknown, fallbackSummary: string): UnifiedReportCommonFields {
  if (!candidate || typeof candidate !== 'object') {
    return { ...EMPTY_COMMON, summary: fallbackSummary };
  }
  const obj = candidate as Record<string, unknown>;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : fallbackSummary,
    key_takeaways: asStringArray(obj.key_takeaways),
    sources_used: asStringArray(obj.sources_used),
    citations: asStringArray(obj.citations)
  };
}

function ensureValidSignal(raw: unknown, index: number): SignalRecord {
  const signal = raw as Record<string, unknown>;
  if (!signal || typeof signal !== 'object') {
    throw new ReportShapeValidationError(`signal[${index}] must be an object`);
  }
  if (typeof signal.symbol !== 'string' || signal.symbol.length === 0) {
    throw new ReportShapeValidationError(`signal[${index}] symbol is required`);
  }
  if (signal.side !== 'long' && signal.side !== 'short') {
    throw new ReportShapeValidationError(`signal[${index}] side must be long or short`);
  }
  if (typeof signal.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 100) {
    throw new ReportShapeValidationError(`signal[${index}] confidence must be 0-100`);
  }
  return {
    symbol: signal.symbol,
    side: signal.side,
    confidence: signal.confidence,
    rationale: typeof signal.rationale === 'string' ? signal.rationale : '',
    citations: asStringArray(signal.citations)
  };
}

function emptySection(characterType: CharacterType): UnifiedCharacterSection {
  switch (characterType) {
    case 'finance_expert':
      return { character_type: 'finance_expert', market_summary: '', signals: [] };
    case 'teacher':
      return { character_type: 'teacher', lesson_explanation: '' };
    case 'trainer':
      return { character_type: 'trainer', qa_drill: [] };
    case 'philosopher':
      return { character_type: 'philosopher', argument_reflection: '' };
    case 'influencer':
      return { character_type: 'influencer', content_angles: [], hooks: [] };
    default:
      return { character_type: 'summarizer', bullet_digest: [] };
  }
}

function normalizeSection(characterType: CharacterType, candidate: unknown, legacySignals: SignalRecord[]): UnifiedCharacterSection {
  if (!candidate || typeof candidate !== 'object') {
    if (characterType === 'finance_expert') {
      return { character_type: 'finance_expert', market_summary: '', signals: legacySignals };
    }
    if (legacySignals.length > 0) {
      throw new ReportShapeValidationError('signals are only allowed for finance_expert');
    }
    return emptySection(characterType);
  }

  const section = candidate as Record<string, unknown>;
  const sectionType = section.character_type;
  if (sectionType !== characterType) {
    throw new ReportShapeValidationError(`section.character_type must be ${characterType}`);
  }

  if (characterType === 'finance_expert') {
    const rawSignals = Array.isArray(section.signals) ? section.signals.map((signal, index) => ensureValidSignal(signal, index)) : [];
    const financeSection: FinanceExpertSection = {
      character_type: 'finance_expert',
      market_summary: typeof section.market_summary === 'string' ? section.market_summary : '',
      signals: rawSignals.length > 0 ? rawSignals : legacySignals
    };
    return financeSection;
  }

  if (Array.isArray(section.signals) && section.signals.length > 0) {
    throw new ReportShapeValidationError('signals are only allowed for finance_expert');
  }

  switch (characterType) {
    case 'teacher':
      return { character_type: 'teacher', lesson_explanation: typeof section.lesson_explanation === 'string' ? section.lesson_explanation : '' };
    case 'trainer':
      return {
        character_type: 'trainer',
        qa_drill: Array.isArray(section.qa_drill)
          ? section.qa_drill
              .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
              .map((entry) => ({
                question: typeof entry.question === 'string' ? entry.question : '',
                answer: typeof entry.answer === 'string' ? entry.answer : ''
              }))
          : []
      };
    case 'philosopher':
      return {
        character_type: 'philosopher',
        argument_reflection: typeof section.argument_reflection === 'string' ? section.argument_reflection : ''
      };
    case 'influencer':
      return {
        character_type: 'influencer',
        content_angles: asStringArray(section.content_angles),
        hooks: asStringArray(section.hooks)
      };
    case 'summarizer':
    default:
      return {
        character_type: 'summarizer',
        bullet_digest: asStringArray(section.bullet_digest)
      };
  }
}

export function normalizeUnifiedCharacterReport(input: NormalizeUnifiedCharacterReportInput): UnifiedCharacterReport {
  const legacySummary = input.legacySummary ?? '';
  const legacySignals = input.legacySignals ?? [];

  const candidate = input.candidate && typeof input.candidate === 'object' ? (input.candidate as Record<string, unknown>) : null;

  const common = normalizeCommon(candidate?.common, legacySummary);
  const section = normalizeSection(input.characterType, candidate?.section, legacySignals);

  return { common, section };
}

