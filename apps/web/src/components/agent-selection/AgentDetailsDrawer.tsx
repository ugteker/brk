import { Button, Drawer, Tag } from 'antd';
import { CheckCircleOutlined, RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { SourceRecord } from '../../api/sources';
import { getCharacterTypeEmoji } from '../../data/character-types';
import { getPromptPersona } from '../../data/prompt-personas';
import { type AgentMatchDto } from './CompactAgentCard';

export interface AgentDetailsDrawerProps {
  open: boolean;
  loading: boolean;
  match: AgentMatchDto | null;
  source: SourceRecord | null;
  onClose: () => void;
  onUse: (match: AgentMatchDto) => void;
  onCreateVariant?: (agentVersionId: string) => void;
  onUpdateAgent?: (match: AgentMatchDto) => void | Promise<void>;
}

function getSourceTypeLabel(value: string): string {
  switch (value) {
    case 'web_urls':
      return 'web';
    case 'podcast_feeds':
      return 'podcasts';
    case 'youtube_videos':
      return 'YouTube';
    case 'synthetic_discussion':
      return 'discussions';
    default:
      return value.replace(/_/g, ' ');
  }
}

function getLocalizedSourceTypeLabel(
  value: string,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  switch (value) {
    case 'web_urls':
      return t('source.type.web');
    case 'podcast_feeds':
      return t('source.type.podcast');
    case 'youtube_videos':
      return t('source.type.youtube');
    case 'synthetic_discussion':
      return t('agentSelection.detailsDiscussion');
    default:
      return getSourceTypeLabel(value);
  }
}

function formatReason(code: AgentMatchDto['reasons'][number]['code'], value: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (code) {
    case 'topic':
      return t('agentSelection.reason.topic', { value });
    case 'source_type':
      return t('agentSelection.reason.sourceType', { value: getSourceTypeLabel(value) });
    case 'language':
      return t('agentSelection.reason.language', { value: value.toUpperCase() });
    default:
      return value;
  }
}

function getSourceLabel(source: SourceRecord | null): string {
  if (!source) return '';
  return source.metadata.title?.trim() || source.value;
}

export function AgentDetailsDrawer({ open, loading, match, source, onClose, onUse, onCreateVariant, onUpdateAgent }: AgentDetailsDrawerProps) {
  const { t, i18n } = useTranslation();
  const personaLabel = match?.characterType
    ? getPromptPersona(match.characterType)?.name ?? match.characterType.replace(/_/g, ' ')
    : t('agentSelection.detailsNotSpecified');
  const languageLabel = match?.language
    ? new Intl.DisplayNames([i18n.resolvedLanguage ?? i18n.language], { type: 'language' }).of(match.language) ?? match.language.toUpperCase()
    : t('agentSelection.detailsNotSpecified');
  const introduction = match
    ? match.purpose
      ? t('agentSelection.detailsIntroduction', { name: match.name, purpose: match.purpose })
      : t('agentSelection.detailsIntroductionFallback', { name: match.name })
    : '';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={match?.name ?? t('library.chooseAgent')}
      width="min(440px, 100vw)"
      destroyOnHidden
      footer={match ? (
        <div className="space-y-2">
          <Button type="primary" block loading={loading} onClick={() => onUse(match)}>
            {t('agentSelection.useAgent')}
          </Button>
          <div className="flex gap-2">
            {match.ownership === 'curated' && onCreateVariant ? (
              <Button className="flex-1" onClick={() => onCreateVariant(match.agentVersionId)}>
                {t('agentSelection.createVariant')}
              </Button>
            ) : null}
            {match.updateAvailable && match.latestAgentVersionId && onUpdateAgent ? (
              <Button className="flex-1" onClick={() => void onUpdateAgent(match)}>
                {t('agentSelection.updateAgent')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    >
      {match ? (
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-muted/70 text-2xl ring-1 ring-border/60">
              {match.iconAssetKey ? (
                <img src={`/agent-icons/${match.iconAssetKey}.svg`} alt="" className="h-8 w-8" />
              ) : match.characterType ? (
                <span aria-hidden>{getCharacterTypeEmoji(match.characterType)}</span>
              ) : (
                <RobotOutlined />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-foreground">{match.name}</p>
                <Tag color={match.ownership === 'owned' ? 'purple' : 'blue'} className="m-0">
                  {match.ownership === 'owned' ? t('agentSelection.yours') : t('agentSelection.curated')}
                </Tag>
              </div>
            </div>
          </div>

          <section
            className="space-y-2 rounded-xl border border-violet-200/70 bg-violet-50/60 p-4 dark:border-violet-500/25 dark:bg-violet-950/25"
            aria-labelledby="agent-details-introduction"
          >
            <h3 id="agent-details-introduction" className="text-sm font-semibold text-foreground">
              {t('agentSelection.detailsMeetAgent')}
            </h3>
            <p className="text-sm leading-6 text-foreground/90">
              {introduction}
            </p>
          </section>

          {source ? (
            <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-4" aria-labelledby="agent-details-match">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('agentSelection.detailsSelectedSource')}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{getSourceLabel(source)}</p>
              </div>
              <div className="border-t border-border pt-3">
                <h3 id="agent-details-match" className="text-sm font-semibold text-foreground">
                  {t('agentSelection.detailsWhyMatch')}
                </h3>
                <div className="mt-2 space-y-2">
                  {match.reasons.length > 0 ? match.reasons.map((reason) => (
                    <div key={`${reason.code}:${reason.value}`} className="flex items-start gap-2 text-sm text-foreground/85">
                      <CheckCircleOutlined className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>{formatReason(reason.code, reason.value, t)}</span>
                    </div>
                  )) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      {t('agentSelection.detailsMatchFallback')}
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-3 border-t border-border pt-5" aria-labelledby="agent-details-profile">
            <h3 id="agent-details-profile" className="text-sm font-semibold text-foreground">
              {t('agentSelection.detailsProfile')}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t('agentSelection.detailsPersona')}</dt>
                <dd className="mt-1 font-medium capitalize text-foreground">{personaLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('agentSelection.detailsLanguage')}</dt>
                <dd className="mt-1 font-medium text-foreground">{languageLabel}</dd>
              </div>
            </dl>
            {match.sourceTypes.length > 0 ? (
              <div>
                <p className="text-xs text-muted-foreground">{t('agentSelection.detailsSourceTypes')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {match.sourceTypes.map((sourceType) => (
                    <Tag key={sourceType} className="m-0">{getLocalizedSourceTypeLabel(sourceType, t)}</Tag>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 border-t border-border pt-5" aria-labelledby="agent-details-topics">
            <h3 id="agent-details-topics" className="text-sm font-semibold text-foreground">
              {t('agentSelection.detailsTopics')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {match.topics.length > 0 ? match.topics.map((topic) => (
                <Tag key={topic} className="m-0 whitespace-normal">{topic}</Tag>
              )) : (
                <p className="text-sm text-muted-foreground">{t('agentSelection.detailsNoTopics')}</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
