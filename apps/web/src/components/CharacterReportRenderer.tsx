import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { UnifiedCharacterReportDto } from '../api/agents';
import { isHttpUrl } from '../utils/links';

interface CharacterReportRendererProps {
  report: UnifiedCharacterReportDto;
}

/** Section wrapper: emoji icon chip + sentence-case title */
function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-[13px]">
          {icon}
        </span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function DotList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className="space-y-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
          {isHttpUrl(item) ? (
            <a href={item} target="_blank" rel="noreferrer" className="break-all">
              {item}
            </a>
          ) : (
            <span>{item}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function entityEmoji(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized.startsWith('person')) return '👤';
  if (normalized.startsWith('organi')) return '🏛️';
  if (normalized.startsWith('ort') || normalized.startsWith('loc') || normalized.startsWith('place')) return '📍';
  return '🏷️';
}

function CharacterSection({ report }: CharacterReportRendererProps) {
  const { t } = useTranslation();
  const section = report.section;
  if (section.character_type === 'finance_expert') {
    return (
      <div className="space-y-5">
        <Section icon="📈" title={t('report.marketSummary')}>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{section.market_summary || '—'}</p>
        </Section>
        <Section icon="📊" title={t('report.signals')}>
          {section.signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300">
              {section.signals.map((signal) => (
                <li key={`${signal.symbol}-${signal.side}`} className="flex items-center gap-2">
                  <span aria-hidden="true">{signal.side === 'long' ? '▲' : '▼'}</span>
                  <span className="font-medium">{signal.symbol}</span>
                  <span className="text-muted-foreground">
                    · {signal.side === 'long' ? 'Long' : 'Short'} · {signal.confidence}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    );
  }
  if (section.character_type === 'teacher') {
    return (
      <Section icon="🎓" title={t('report.lessonExplanation')}>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{section.lesson_explanation || '—'}</p>
      </Section>
    );
  }
  if (section.character_type === 'trainer') {
    return (
      <Section icon="🏋️" title={t('report.qaDrill')}>
        {section.qa_drill.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-2.5">
            {section.qa_drill.map((qa, index) => (
              <li key={`${qa.question}-${index}`} className="rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
                <p className="text-sm font-medium text-foreground">{qa.question}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{qa.answer}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    );
  }
  if (section.character_type === 'philosopher') {
    return (
      <Section icon="🦉" title={t('report.argumentReflection')}>
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{section.argument_reflection || '—'}</p>
      </Section>
    );
  }
  if (section.character_type === 'influencer') {
    return (
      <div className="space-y-5">
        <Section icon="📣" title={t('report.contentAngles')}>
          <DotList items={section.content_angles} />
        </Section>
        <Section icon="🪝" title={t('report.hooks')}>
          <DotList items={section.hooks} />
        </Section>
      </div>
    );
  }
  return (
    <Section icon="📝" title={t('report.bulletDigest')}>
      <DotList items={section.bullet_digest} />
    </Section>
  );
}

export function CharacterReportRenderer({ report }: CharacterReportRendererProps) {
  const { t } = useTranslation();
  const common = report.common;
  const keywords = common.keywords ?? [];
  const leadText = common.short_summary?.trim();
  const detailText = common.summary?.trim();
  const takeaways = common.key_takeaways ?? [];
  const recommendation = common.recommendation?.trim();
  const openQuestions = common.open_questions ?? [];
  const entities = common.entities ?? [];
  const sourcesUsed = common.sources_used ?? [];
  const citations = common.citations ?? [];

  return (
    <div className="space-y-6">
      {keywords.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/60 dark:text-violet-300"
            >
              #{keyword}
            </span>
          ))}
        </div>
      ) : null}

      <Section icon="📋" title={t('report.summary')}>
        {leadText ? (
          <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">{leadText}</p>
        ) : null}
        {detailText && detailText !== leadText ? (
          <p className={`${leadText ? 'mt-2 text-sm text-gray-500 dark:text-gray-400' : 'text-[15px] text-gray-700 dark:text-gray-300'} leading-relaxed`}>
            {detailText}
          </p>
        ) : null}
        {!leadText && !detailText ? <p className="text-sm text-muted-foreground">—</p> : null}
      </Section>

      {takeaways.length > 0 ? (
        <Section icon="💡" title={t('report.keyTakeaways')}>
          <ol className="space-y-2">
            {takeaways.map((takeaway, index) => (
              <li
                key={takeaway}
                className="flex gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  {index + 1}
                </span>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{takeaway}</p>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {recommendation ? (
        <Section icon="🧭" title={t('report.recommendation')}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
              {t('report.recommendedNextSteps')}
            </span>
            <p className="mt-1 text-sm font-medium leading-relaxed text-amber-950 dark:text-amber-100">{recommendation}</p>
          </div>
        </Section>
      ) : null}

      {openQuestions.length > 0 ? (
        <Section icon="❓" title={t('report.openQuestions')}>
          <DotList items={openQuestions} />
        </Section>
      ) : null}

      {entities.length > 0 ? (
        <Section icon="🏷️" title={t('report.entities')}>
          <div className="flex flex-wrap gap-1.5">
            {entities.map((entity) => (
              <span
                key={`${entity.name}:${entity.type}`}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-gray-600 dark:text-gray-300"
              >
                <span aria-hidden="true">{entityEmoji(entity.type)}</span> {entity.name}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="border-t border-border pt-5">
        <CharacterSection report={report} />
      </div>

      {sourcesUsed.length > 0 || citations.length > 0 ? (
        <div className="space-y-5 border-t border-border pt-5">
          {sourcesUsed.length > 0 ? (
            <Section icon="🔗" title={t('report.sourcesUsed')}>
              <DotList items={sourcesUsed} />
            </Section>
          ) : null}
          {citations.length > 0 ? (
            <Section icon="📚" title={t('report.citations')}>
              <DotList items={citations} />
            </Section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
