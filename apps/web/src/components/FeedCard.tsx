import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Tag } from 'antd';
import { ExportOutlined, EyeInvisibleOutlined, LinkOutlined, MessageOutlined, ReadOutlined } from '@ant-design/icons';
import type { CharacterType, RunReportDto } from '../api/agents';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../data/character-types';
import { getReportAccent, getReportAccentClasses } from '../utils/reportAccent';

export interface FeedDayGroup<T> {
  key: string;
  kind: 'today' | 'yesterday' | 'date';
  /** ISO timestamp of a report in the group, used to render a localized date label */
  dateISO: string;
  reports: T[];
}

/**
 * Group already-sorted (newest-first) reports into calendar-day buckets. Buckets keep the
 * input order, so a newest-first list yields Today → Yesterday → older dates.
 */
export function groupReportsByDay<T extends { createdAt: string }>(
  reports: T[],
  now: Date = new Date()
): FeedDayGroup<T>[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const dayMs = 86_400_000;
  const groups: FeedDayGroup<T>[] = [];
  const byKey = new Map<string, FeedDayGroup<T>>();
  for (const report of reports) {
    const d = new Date(report.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let group = byKey.get(key);
    if (!group) {
      const dayStart = startOfDay(d);
      const kind = dayStart === today ? 'today' : dayStart === today - dayMs ? 'yesterday' : 'date';
      group = { key, kind, dateISO: report.createdAt, reports: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.reports.push(report);
  }
  return groups;
}

export interface FeedCardProps {
  report: RunReportDto;
  characterType?: CharacterType | null;
  /** Character label, e.g. "Teacher" */
  characterLabel: string;
  /** The agent's specific personality within its character, e.g. "Balanced Analyst" */
  personalityLabel?: string;
  /** Source or playbook title shown in the meta row / banner */
  sourceTitle: string;
  sourceCoverImageUrl: string | null;
  isSyntheticSource: boolean;
  /** Opens the full report (all takeaways, entities, evidence, character section) */
  onOpenFullReport: () => void;
  /** Jumps to the source in the Library hub, when the source can be resolved */
  onOpenSource?: () => void;
  onDiscuss: () => void;
  /** Hides the report from the feed (it stays in the Library's report list). */
  onDismiss?: () => void;
}

export function FeedCard({
  report,
  characterType,
  characterLabel,
  personalityLabel,
  sourceTitle,
  sourceCoverImageUrl,
  isSyntheticSource,
  onOpenFullReport,
  onOpenSource,
  onDiscuss,
  onDismiss
}: FeedCardProps) {
  const { t, i18n } = useTranslation();
  const common = report.report?.common;
  const presentation = common?.card_presentation;
  const supportingFields = presentation?.supporting_fields ?? [];
  const resultType = common?.result_type ?? 'summary';
  const emphasis = presentation?.emphasis ?? 'standard';
  const accent = getReportAccentClasses(getReportAccent(emphasis, common?.result_type));
  const signals = report.signals ?? [];
  const personaEmoji = getCharacterTypeEmoji(characterType);

  const episodeReference = common?.source_references?.find((sourceReference) => {
    try {
      const url = new URL(sourceReference.reference);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  });

  // Which episode/article the report is about - shown as a visible subtitle so the
  // AI-generated headline is anchored to its source item, not just the source.
  const episodeTitle = (episodeReference?.label ?? common?.source_references?.[0]?.label)?.trim() || null;

  const isUnread = report.readAt == null;
  // Keeps the "new" pill mounted just long enough to fade out once the report is read,
  // then removes it so read cards reclaim the space.
  const [showNewBadge, setShowNewBadge] = useState(isUnread);
  useEffect(() => {
    if (isUnread) {
      setShowNewBadge(true);
      return;
    }
    if (!showNewBadge) return;
    const timer = setTimeout(() => setShowNewBadge(false), 1200);
    return () => clearTimeout(timer);
  }, [isUnread, showNewBadge]);

  const fallbackHeadline = common?.headline?.trim() || report.summary;
  const primaryText = (() => {
    switch (presentation?.primary_field) {
      case 'recommendation':
        return common?.recommendation?.trim() || fallbackHeadline;
      case 'open_question':
        return common?.open_questions?.[0]?.trim() || fallbackHeadline;
      case 'key_takeaway':
        return common?.key_takeaways?.[0]?.trim() || fallbackHeadline;
      case 'short_summary':
        return common?.short_summary?.trim() || fallbackHeadline;
      case 'headline':
      default:
        return fallbackHeadline;
    }
  })();

  const focusContent = (() => {
    if (common?.recommendation?.trim()) {
      return { label: t('feedCard.focus.recommendation'), text: common.recommendation.trim() };
    }
    if (resultType === 'risk' && common?.key_takeaways?.[0]?.trim()) {
      return { label: t('feedCard.focus.risk'), text: common.key_takeaways[0].trim() };
    }
    if (common?.open_questions?.[0]?.trim()) {
      return { label: t('feedCard.focus.openQuestion'), text: common.open_questions[0].trim() };
    }
    if (common?.key_takeaways?.[0]?.trim()) {
      return { label: t('feedCard.focus.keyTakeaway'), text: common.key_takeaways[0].trim() };
    }
    return null;
  })();

  const metadataChips: Array<{ key: string; label: string; className?: string }> = [];
  if (supportingFields.includes('relevance') && (common?.relevance ?? 0) > 0) {
    metadataChips.push({ key: 'relevance', label: t('feedCard.relevance', { value: common!.relevance }), className: accent.chip });
  }
  if (supportingFields.includes('confidence') && (common?.confidence ?? 0) >= 50) {
    const confidenceLevel = common!.confidence! >= 70 ? 'high' : 'medium';
    metadataChips.push({
      key: 'confidence',
      label: t(`feedCard.confidence.${confidenceLevel}`),
      className:
        confidenceLevel === 'high'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-200'
    });
  }
  if (supportingFields.includes('time_horizon') && common?.time_horizon && common.time_horizon !== 'unspecified') {
    metadataChips.push({ key: 'time_horizon', label: t(`feedCard.timeHorizon.${common.time_horizon}`) });
  }
  // Keywords render as hashtags under the headline, so they are omitted from the chips.
  if (supportingFields.includes('entities')) {
    for (const entity of common?.entities?.slice(0, 2) ?? []) {
      metadataChips.push({ key: `entity:${entity.name}:${entity.type}`, label: entity.name });
    }
  }
  if (supportingFields.includes('novelty') && (common?.novelty ?? 0) > 0) {
    metadataChips.push({ key: 'novelty', label: t('feedCard.novelty', { value: common!.novelty }) });
  }

  const showSignals = characterType === 'finance_expert' && signals.length > 0;

  return (
    <Card
      size="small"
      hoverable
      className="relative cursor-pointer overflow-hidden border border-violet-100 bg-white shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg dark:border-violet-950 dark:bg-gray-900 dark:hover:border-violet-800"
      styles={{ body: { padding: 0 } }}
      onClick={onOpenFullReport}
    >
      {/* Accent top band (always visible, colour driven by emphasis/result_type) */}
      <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] ${accent.bar}`} />

      <div className="p-4">
        {/* Meta row: square cover thumbnail (ID-card style) + agent labels + result badge */}
        <div className="flex items-center gap-3">
          <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-gray-200 dark:ring-gray-700">
            {isSyntheticSource ? (
              <div
                data-testid="feed-card-synthetic-thumb"
                className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1e1239] via-[#54239a] to-[#164e78]"
              >
                <span aria-hidden="true" className="text-3xl">{personaEmoji}</span>
              </div>
            ) : sourceCoverImageUrl ? (
              <img
                data-testid="feed-card-cover"
                src={sourceCoverImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                data-testid="feed-card-placeholder"
                className={`flex h-full w-full items-center justify-center ${getCharacterTypeIconBg(characterType)}`}
              >
                <span aria-hidden="true" className="text-3xl">{personaEmoji}</span>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-gray-800 dark:text-gray-200">{characterLabel}</span>
              {personalityLabel ? <span className="text-muted-foreground">· {personalityLabel}</span> : null}
              <Tag className={`m-0 ml-1 shrink-0 border-0 text-[10px] font-semibold ${accent.badge}`}>
                {t(`feedCard.resultType.${resultType}`)}
              </Tag>
              {showNewBadge ? (
                <span
                  data-testid="feed-card-unread"
                  className={`ml-auto flex shrink-0 items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white transition-opacity duration-1000 motion-reduce:transition-none dark:bg-violet-500 ${isUnread ? 'opacity-100' : 'opacity-0'}`}
                >
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-white/90" />
                  {t('feedCard.new')}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="truncate">{sourceTitle}</span>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{new Date(report.createdAt).toLocaleDateString(i18n.language)}</span>
            </div>
            {episodeTitle && episodeTitle !== sourceTitle ? (
              <div
                data-testid="feed-card-episode-title"
                className="mt-0.5 truncate text-[11px] font-medium text-gray-600 dark:text-gray-300"
                title={episodeTitle}
              >
                <span aria-hidden="true">↳ </span>
                {t('feedCard.episode', { title: episodeTitle })}
              </div>
            ) : null}
          </div>
        </div>

        <h3 className="mt-3 text-[15px] font-semibold leading-snug text-foreground">{primaryText}</h3>

        {(common?.keywords?.length ?? 0) > 0 ? (
          <div
            data-testid="feed-card-keywords"
            className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] font-medium text-violet-600 dark:text-violet-400"
          >
            {common!.keywords!.slice(0, 3).map((keyword) => (
              <span key={keyword}>#{keyword}</span>
            ))}
          </div>
        ) : null}

        {focusContent ? (
          <div className={`mt-3 rounded-xl border px-4 py-3 ${accent.focusBox}`}>
            <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${accent.focusLabel}`}>
              <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${accent.focusDot}`} />
              {focusContent.label}
            </span>
            <p className={`mt-1 text-sm font-medium leading-relaxed ${accent.focusText}`}>{focusContent.text}</p>
          </div>
        ) : null}

        {metadataChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {metadataChips.slice(0, 3).map((chip) => (
              <Tag key={chip.key} className={`m-0 border-0 text-[11px] ${chip.className ?? 'bg-muted text-muted-foreground'}`}>
                {chip.label}
              </Tag>
            ))}
            {metadataChips.length > 3 ? (
              <Tag className="m-0 border-0 text-[11px] bg-muted text-muted-foreground">
                +{metadataChips.length - 3}
              </Tag>
            ) : null}
          </div>
        ) : null}

        {showSignals ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {signals.slice(0, 3).map((signal, index) => (
              <Tag key={`${signal.symbol}:${index}`} color={signal.side === 'long' ? 'green' : 'red'} className="m-0 text-xs">
                {signal.side === 'long' ? '▲' : '▼'} {signal.symbol}
              </Tag>
            ))}
            {signals.length > 3 ? <Tag className="m-0 text-xs text-muted-foreground">+{signals.length - 3}</Tag> : null}
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            {onOpenSource ? (
              <button
                type="button"
                aria-label={t('feedCard.viewSource', { title: sourceTitle })}
                className="flex min-w-0 items-center gap-1 truncate rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:bg-violet-100 hover:text-violet-700 dark:hover:bg-violet-950/60 dark:hover:text-violet-200"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenSource();
                }}
              >
                <LinkOutlined className="text-[11px]" />
                <span className="truncate">{sourceTitle}</span>
              </button>
            ) : null}
            {episodeReference ? (
              <button
                type="button"
                aria-label={t('feedCard.episode', { title: episodeReference.label })}
                title={t('feedCard.episode', { title: episodeReference.label })}
                className="flex shrink-0 items-center justify-center rounded-full bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-violet-100 hover:text-violet-700 dark:hover:bg-violet-950/60 dark:hover:text-violet-200"
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(episodeReference.reference, '_blank', 'noopener,noreferrer');
                }}
              >
                <ExportOutlined className="text-[11px]" />
              </button>
            ) : null}
            {onDismiss ? (
              <button
                type="button"
                aria-label={t('feedCard.dismiss')}
                title={t('feedCard.dismiss')}
                className="flex shrink-0 items-center justify-center rounded-full bg-muted p-1.5 text-muted-foreground transition-colors hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-200"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismiss();
                }}
              >
                <EyeInvisibleOutlined className="text-[11px]" />
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button
              type="text"
              size="small"
              icon={<MessageOutlined />}
              className="h-auto px-0 text-xs font-medium text-violet-600 hover:!text-violet-800 dark:text-violet-300 dark:hover:!text-violet-100"
              onClick={(event) => {
                event.stopPropagation();
                onDiscuss();
              }}
            >
              {t('feedCard.discuss')}
            </Button>
            <Button
              type="text"
              size="small"
              icon={<ReadOutlined />}
              className="h-auto px-0 text-xs font-semibold text-violet-600 hover:!text-violet-800 dark:text-violet-300 dark:hover:!text-violet-100"
              onClick={(event) => {
                event.stopPropagation();
                onOpenFullReport();
              }}
            >
              {t('feedCard.openReport')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

