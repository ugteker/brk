import type { CharacterType } from '../agents/types';
import type {
  CardPresentation,
  FinanceExpertSection,
  ReportCardEmphasis,
  ReportCardPrimaryField,
  ReportCardSupportingField,
  ReportEntity,
  ReportEvidence,
  ReportResultType,
  ReportSourceReference,
  ReportTimeHorizon,
  ReportTone,
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
  citations: [],
  headline: '',
  short_summary: '',
  result_type: 'insight',
  keywords: [],
  relevance: 0,
  confidence: 0,
  evidence: [],
  entities: [],
  recommendation: '',
  open_questions: [],
  time_horizon: 'unspecified',
  tone: 'neutral',
  source_references: [],
  novelty: 0,
  card_presentation: {
    emphasis: 'standard',
    primary_field: 'headline',
    supporting_fields: [],
    hide_when_empty: true,
    rationale: ''
  }
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const REPORT_RESULT_TYPES: readonly ReportResultType[] = ['insight', 'summary', 'risk', 'recommendation', 'question', 'update'];
const REPORT_TIME_HORIZONS: readonly ReportTimeHorizon[] = ['immediate', 'short_term', 'medium_term', 'long_term', 'unspecified'];
const REPORT_TONES: readonly ReportTone[] = ['neutral', 'positive', 'cautious', 'critical', 'urgent'];
const REPORT_CARD_EMPHASIS: readonly ReportCardEmphasis[] = ['standard', 'attention', 'critical', 'positive'];
const REPORT_CARD_PRIMARY_FIELDS: readonly ReportCardPrimaryField[] = [
  'headline',
  'short_summary',
  'recommendation',
  'open_question',
  'key_takeaway'
];
const REPORT_CARD_SUPPORTING_FIELDS: readonly ReportCardSupportingField[] = [
  'result_type',
  'keywords',
  'relevance',
  'confidence',
  'time_horizon',
  'entities',
  'evidence',
  'novelty'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLiteral<T extends string>(value: unknown, supported: readonly T[], fallback: T): T {
  if (typeof value !== 'string') {
    return fallback;
  }
  return supported.find((option) => option === value) ?? fallback;
}

function normalizeTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (trimmed.length === 0 || unique.has(trimmed)) {
      continue;
    }

    unique.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

function normalizeScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

function normalizeEvidence(value: unknown): ReportEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const evidence: ReportEvidence[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const claim = normalizeTrimmedString(item.claim);
    if (claim.length === 0) {
      continue;
    }

    evidence.push({
      claim,
      citations: normalizeStringArray(item.citations, 10)
    });

    if (evidence.length >= 5) {
      break;
    }
  }

  return evidence;
}

function normalizeEntities(value: unknown): ReportEntity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entities: ReportEntity[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const name = normalizeTrimmedString(item.name);
    const type = normalizeTrimmedString(item.type);
    if (name.length === 0 || type.length === 0) {
      continue;
    }

    entities.push({ name, type });
    if (entities.length >= 8) {
      break;
    }
  }

  return entities;
}

function normalizeSourceReferences(value: unknown): ReportSourceReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sourceReferences: ReportSourceReference[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const label = normalizeTrimmedString(item.label);
    const reference = normalizeTrimmedString(item.reference);
    if (label.length === 0 || reference.length === 0) {
      continue;
    }

    sourceReferences.push({ label, reference });
    if (sourceReferences.length >= 10) {
      break;
    }
  }

  return sourceReferences;
}

function normalizeCardPresentation(value: unknown): CardPresentation {
  if (!isRecord(value)) {
    return { ...EMPTY_COMMON.card_presentation };
  }

  const supportingFields: ReportCardSupportingField[] = [];
  if (Array.isArray(value.supporting_fields)) {
    for (const field of value.supporting_fields) {
      if (typeof field !== 'string') {
        continue;
      }

      const trimmed = field.trim();
      const supportedField = REPORT_CARD_SUPPORTING_FIELDS.find((option) => option === trimmed);
      if (!supportedField || supportingFields.includes(supportedField)) {
        continue;
      }

      supportingFields.push(supportedField);
      if (supportingFields.length >= 3) {
        break;
      }
    }
  }

  return {
    emphasis: normalizeLiteral(value.emphasis, REPORT_CARD_EMPHASIS, EMPTY_COMMON.card_presentation.emphasis),
    primary_field: normalizeLiteral(value.primary_field, REPORT_CARD_PRIMARY_FIELDS, EMPTY_COMMON.card_presentation.primary_field),
    supporting_fields: supportingFields,
    hide_when_empty: typeof value.hide_when_empty === 'boolean' ? value.hide_when_empty : true,
    rationale: normalizeTrimmedString(value.rationale).slice(0, 280)
  };
}

function normalizeCommon(candidate: unknown, fallbackSummary: string): UnifiedReportCommonFields {
  if (!isRecord(candidate)) {
    return { ...EMPTY_COMMON, summary: fallbackSummary };
  }

  const obj = candidate;
  return {
    summary: typeof obj.summary === 'string' ? obj.summary : fallbackSummary,
    key_takeaways: normalizeStringArray(obj.key_takeaways, 5),
    sources_used: normalizeStringArray(obj.sources_used, 20),
    citations: normalizeStringArray(obj.citations, 20),
    headline: normalizeTrimmedString(obj.headline),
    short_summary: normalizeTrimmedString(obj.short_summary),
    result_type: normalizeLiteral(obj.result_type, REPORT_RESULT_TYPES, EMPTY_COMMON.result_type),
    keywords: normalizeStringArray(obj.keywords, 12),
    relevance: normalizeScore(obj.relevance),
    confidence: normalizeScore(obj.confidence),
    evidence: normalizeEvidence(obj.evidence),
    entities: normalizeEntities(obj.entities),
    recommendation: normalizeTrimmedString(obj.recommendation),
    open_questions: normalizeStringArray(obj.open_questions, 5),
    time_horizon: normalizeLiteral(obj.time_horizon, REPORT_TIME_HORIZONS, EMPTY_COMMON.time_horizon),
    tone: normalizeLiteral(obj.tone, REPORT_TONES, EMPTY_COMMON.tone),
    source_references: normalizeSourceReferences(obj.source_references),
    novelty: normalizeScore(obj.novelty),
    card_presentation: normalizeCardPresentation(obj.card_presentation)
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
