import { Button, Drawer, Tag } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { SourceRecord } from '../../api/sources';
import { getCharacterTypeEmoji } from '../../data/character-types';
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
  const { t } = useTranslation();

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={match?.name ?? t('library.chooseAgent')}
      width={360}
      destroyOnHidden
    >
      {match ? (
        <div className="space-y-5">
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
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{match.purpose}</p>
            </div>
          </div>

          {source ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('library.chooseAgent')}
              </p>
              <p className="mt-1 text-sm text-foreground">{getSourceLabel(source)}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('agentSelection.bestMatches')}
            </p>
            <div className="flex flex-wrap gap-2">
              {match.reasons.length > 0 ? match.reasons.map((reason) => (
                <Tag key={`${reason.code}:${reason.value}`} className="m-0 whitespace-normal py-1 text-xs">
                  {formatReason(reason.code, reason.value, t)}
                </Tag>
              )) : (
                <Tag className="m-0 py-1 text-xs">{t('agentSelection.yours')}</Tag>
              )}
            </div>
          </div>

          <Button type="primary" block loading={loading} onClick={() => onUse(match)}>
            {t('agentSelection.useAgent')}
          </Button>
          {match.ownership === 'curated' && onCreateVariant ? (
            <Button block onClick={() => onCreateVariant(match.agentVersionId)}>
              {t('agentSelection.createVariant')}
            </Button>
          ) : null}
          {match.updateAvailable && match.latestAgentVersionId && onUpdateAgent ? (
            <Button block onClick={() => void onUpdateAgent(match)}>
              {t('agentSelection.updateAgent')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
