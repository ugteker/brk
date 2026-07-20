import type { ReportCardEmphasisDto, ReportResultTypeDto } from '../api/agents';

/**
 * A feed/report card's accent color encodes what kind of report it is, so a reader can
 * triage the feed at a glance instead of every card being the same brand violet.
 *
 * The backend's `card_presentation.emphasis` wins when it says something stronger than
 * "standard"; otherwise we derive the accent from the report's `result_type`. Violet is
 * the neutral brand default (unchanged look for ordinary insights/summaries).
 */
export type ReportAccent = 'violet' | 'rose' | 'amber' | 'emerald';

export interface ReportAccentClasses {
  /** result-type badge Tag className */
  badge: string;
  /** focus callout box: full border + tint */
  focusBox: string;
  /** focus callout label text */
  focusLabel: string;
  /** focus callout body text */
  focusText: string;
  /** small dot shown before the focus callout label */
  focusDot: string;
  /** top emphasis band background (shown only for critical emphasis) */
  bar: string;
  /** relevance chip className */
  chip: string;
}

export function getReportAccent(
  emphasis?: ReportCardEmphasisDto | null,
  resultType?: ReportResultTypeDto | null
): ReportAccent {
  switch (emphasis) {
    case 'critical':
      return 'rose';
    case 'positive':
      return 'emerald';
    case 'attention':
      return 'amber';
    default:
      break;
  }
  switch (resultType) {
    case 'risk':
      return 'rose';
    case 'question':
    case 'update':
      return 'amber';
    default:
      return 'violet';
  }
}

const ACCENT_CLASSES: Record<ReportAccent, ReportAccentClasses> = {
  violet: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/70 dark:text-violet-200',
    focusBox: 'border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40',
    focusLabel: 'text-violet-700 dark:text-violet-200',
    focusText: 'text-violet-950 dark:text-violet-100',
    focusDot: 'bg-violet-500 dark:bg-violet-400',
    bar: 'bg-violet-500',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-200'
  },
  rose: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-200',
    focusBox: 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40',
    focusLabel: 'text-rose-700 dark:text-rose-200',
    focusText: 'text-rose-950 dark:text-rose-100',
    focusDot: 'bg-rose-500 dark:bg-rose-400',
    bar: 'bg-rose-500',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-200'
  },
  amber: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-200',
    focusBox: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
    focusLabel: 'text-amber-700 dark:text-amber-200',
    focusText: 'text-amber-950 dark:text-amber-100',
    focusDot: 'bg-amber-500 dark:bg-amber-400',
    bar: 'bg-amber-500',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-200'
  },
  emerald: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200',
    focusBox: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40',
    focusLabel: 'text-emerald-700 dark:text-emerald-200',
    focusText: 'text-emerald-950 dark:text-emerald-100',
    focusDot: 'bg-emerald-500 dark:bg-emerald-400',
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200'
  }
};

export function getReportAccentClasses(accent: ReportAccent): ReportAccentClasses {
  return ACCENT_CLASSES[accent];
}
