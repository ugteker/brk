import { Button, Card, Skeleton, Tag } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { CharacterType } from '../../api/agents';
import { getCharacterTypeEmoji } from '../../data/character-types';

export interface AgentMatchReasonDto {
  code: 'topic' | 'source_type' | 'language';
  value: string;
}

export interface AgentMatchDto {
  agentVersionId: string;
  publicationId: string | null;
  ownership: 'owned' | 'curated';
  name: string;
  purpose: string;
  iconAssetKey: string | null;
  reasons: AgentMatchReasonDto[];
  score: number;
  agentId?: string | null;
  characterType?: CharacterType | null;
  updateAvailable?: boolean;
  latestAgentVersionId?: string | null;
}

export interface CompactAgentCardProps {
  match: AgentMatchDto;
  loading: boolean;
  onUse: (match: AgentMatchDto) => void;
  onDetails: (match: AgentMatchDto) => void;
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

function formatReason(reason: AgentMatchReasonDto, t: (key: string, options?: Record<string, unknown>) => string): string {
  switch (reason.code) {
    case 'topic':
      return t('agentSelection.reason.topic', { value: reason.value });
    case 'source_type':
      return t('agentSelection.reason.sourceType', { value: getSourceTypeLabel(reason.value) });
    case 'language':
      return t('agentSelection.reason.language', { value: reason.value.toUpperCase() });
    default:
      return reason.value;
  }
}

export function CompactAgentCard({ match, loading, onUse, onDetails }: CompactAgentCardProps) {
  const { t } = useTranslation();
  const ownershipLabel = match.ownership === 'owned' ? t('agentSelection.yours') : t('agentSelection.curated');
  const tone = match.ownership === 'owned' ? 'purple' : 'blue';

  if (loading) {
    return (
      <Card size="small" className="h-full min-h-[188px]">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Skeleton.Avatar active shape="square" size={52} className="shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton.Input active size="small" style={{ width: '55%' }} block />
              <Skeleton.Input active size="small" style={{ width: '100%' }} block />
              <Skeleton.Input active size="small" style={{ width: '70%' }} block />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton.Button active size="small" style={{ width: 92 }} />
            <Skeleton.Button active size="small" style={{ width: 112 }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Skeleton.Button active size="small" style={{ width: 92 }} />
            <Skeleton.Button active size="small" style={{ width: 112 }} />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card size="small" className="h-full min-h-[188px]">
      <div
        tabIndex={-1}
        data-agent-version-id={match.agentVersionId}
        className="flex h-full flex-col gap-3 outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-xl ring-1 ring-border/60">
              {match.iconAssetKey ? (
                <img
                  src={`/agent-icons/${match.iconAssetKey}.svg`}
                  alt=""
                  className="h-7 w-7"
                />
              ) : match.characterType ? (
                <span aria-hidden>{getCharacterTypeEmoji(match.characterType)}</span>
              ) : (
                <RobotOutlined />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">{match.name}</p>
                <Tag color={tone} className="m-0 text-[11px]">
                  {ownershipLabel}
                </Tag>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                {match.purpose}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-auto flex min-h-8 flex-wrap gap-1.5">
          {match.reasons.slice(0, 2).map((reason) => (
            <Tag key={`${reason.code}:${reason.value}`} className="m-0 text-[11px]">
              {formatReason(reason, t)}
            </Tag>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="link" className="px-0" onClick={() => onDetails(match)}>
            {t('agentSelection.viewDetails')}
          </Button>
          <Button type="primary" onClick={() => onUse(match)}>
            {t('agentSelection.useAgent')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
