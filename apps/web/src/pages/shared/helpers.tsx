import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Card, Tag } from 'antd';
import { AudioOutlined, FileTextOutlined, GlobalOutlined } from '@ant-design/icons';
import type { AgentSummary } from '../../api/agents';
import type { RunReportDto } from '../../api/agents';
import type { PlaybookRecord } from '../../api/playbooks';
import type { SourceRecord, SourceType } from '../../api/sources';
import { getCharacterTypeEmoji } from '../../data/character-types';
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona } from '../../data/prompt-personas';
import { extractYoutubeVideoId, getYoutubeCoverImageFallback, getYoutubeThumbnailUrl } from '../../utils/youtube';
import { WEEKDAY_LABELS, type ProbeKind } from './types';

export const BrainIcon = ({ style, className }: { style?: CSSProperties; className?: string }) => (
  <span role="img" aria-label="brain" className={`anticon${className ? ` ${className}` : ''}`} style={{ fontSize: '1em', lineHeight: 1, ...style }}>
    🧠
  </span>
);

export const YouTubeLogo = () => (
  <span className="inline-flex items-center gap-1" style={{ verticalAlign: 'middle' }}>
    <svg viewBox="0 0 18 15" width="18" height="15" aria-hidden="true">
      <path d="M17.6 3.2A2.3 2.3 0 0 0 15.9 1.5C14.5 1 9 1 9 1S3.5 1 2.1 1.5A2.3 2.3 0 0 0 .4 3.2C0 4.6 0 7.5 0 7.5s0 2.9.4 4.3c.2.9.9 1.5 1.7 1.7C3.5 14 9 14 9 14s5.5 0 6.9-.5c.9-.2 1.5-.8 1.7-1.7C18 10.4 18 7.5 18 7.5s0-2.9-.4-4.3z" fill="#FF0000"/>
      <path d="M7 10.5V4.5l5.5 3-5.5 3z" fill="white"/>
    </svg>
    <span style={{ fontWeight: 700, fontSize: '0.8em', letterSpacing: '-0.2px', lineHeight: 1 }} aria-label="YouTube">YouTube</span>
  </span>
);

export function SourceTypeBadge({ type }: { type: string }) {
  if (type === 'youtube_videos') return <YouTubeLogo />;
  if (type === 'podcast_feeds') return (
    <Tag icon={<AudioOutlined />} color="purple" className="m-0">Podcast</Tag>
  );
  if (type === 'synthetic_discussion') return (
    <Tag icon={<AudioOutlined />} color="geekblue" className="m-0">Discussion</Tag>
  );
  return <Tag icon={<GlobalOutlined />} className="m-0">Web</Tag>;
}

export function EpisodeArtwork({
  episodeImageUrl,
  coverImageUrl,
  sourceType
}: {
  episodeImageUrl?: string | null;
  coverImageUrl?: string | null;
  sourceType: SourceRecord['type'];
}) {
  const candidates = useMemo(
    () => Array.from(new Set([episodeImageUrl, coverImageUrl].filter((url): url is string => Boolean(url)))),
    [coverImageUrl, episodeImageUrl]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates.join('|')]);

  const imageUrl = candidates[candidateIndex];
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="h-12 w-[72px] shrink-0 rounded object-cover bg-muted sm:h-11 sm:w-16"
        onError={() => setCandidateIndex((index) => index + 1)}
      />
    );
  }

  return (
    <div className="flex h-12 w-[72px] shrink-0 items-center justify-center rounded bg-muted text-sm sm:h-11 sm:w-16">
      {sourceType === 'youtube_videos' ? '📺' : sourceType === 'podcast_feeds' ? '🎙️' : '🌐'}
    </div>
  );
}

export function WizardSelectableCard({
  ariaLabel,
  selected,
  onClick,
  children
}: {
  ariaLabel: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="relative block h-full w-full text-left cursor-pointer"
    >
      {selected && (
        <span
          aria-hidden
          className="absolute -top-[11px] right-2.5 z-10 flex h-[26px] w-[26px]
                     items-center justify-center rounded-full bg-violet-500 text-white text-[13px]
                     shadow-md ring-2 ring-white dark:ring-slate-900"
        >
          ✓
        </span>
      )}
      <Card
        size="small"
        hoverable={!selected}
        className={`h-full min-h-[190px] transition-all ${
          selected ? 'bg-violet-50 dark:bg-violet-950/40' : ''
        }`}
        style={{
          cursor: 'pointer',
          ...(selected ? { outline: '2px solid #8b5cf6', outlineOffset: '-2px' } : {})
        }}
      >
        {children}
      </Card>
    </div>
  );
}

export function detectSourceTypeCandidates(url: string): SourceType[] {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    return ['youtube_videos', 'podcast_feeds', 'web_urls'];
  }
  if (lower.endsWith('.xml') || lower.includes('/feed') || lower.includes('rss')) {
    return ['podcast_feeds', 'web_urls', 'youtube_videos'];
  }
  return ['web_urls', 'podcast_feeds', 'youtube_videos'];
}

export function probeRankScore(probe: { reachable: boolean; kind: ProbeKind; confidence?: number }, type: SourceType): number {
  let score = probe.reachable ? 100 : 0;
  if (probe.kind === 'feed') score += 30;
  if (probe.kind === 'listing_page') score += 20;
  if (probe.kind === 'single_page') score += 10;
  if (typeof probe.confidence === 'number') score += Math.round(probe.confidence * 10);
  if (type === 'podcast_feeds' && probe.kind === 'feed') score += 8;
  if (type === 'youtube_videos' && probe.kind !== 'unknown') score += 5;
  return score;
}

export function formatPlaybookSchedule(schedule: PlaybookRecord['schedule']): string {
  if (!schedule || typeof schedule !== 'object' || !('mode' in schedule)) {
    return 'Schedule unavailable';
  }
  if (schedule.mode === 'manual') return 'Manual (run on demand)';
  if (schedule.mode === 'interval') return `Every ${schedule.intervalMinutes} min`;
  if (schedule.mode === 'daily') return `Daily ${schedule.dailyTime} (${schedule.timezone})`;
  const weeklyDays = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
  const days = (weeklyDays.length > 0 ? weeklyDays : [1]).map((d) => WEEKDAY_LABELS[d] ?? d).join(', ');
  return `Weekly ${schedule.dailyTime} on ${days} (${schedule.timezone})`;
}

export const PersonaIcon = ({ personaId, style }: { personaId: string; style?: CSSProperties }) => {
  const emoji = getCharacterTypeEmoji(personaId);
  return (
    <span role="img" aria-label={personaId} className="anticon" style={{ fontSize: '1em', lineHeight: 1, ...style }}>
      {emoji}
    </span>
  );
};

export function getCharacterIcon(characterType?: AgentSummary['characterType']) {
  return <PersonaIcon personaId={characterType ?? 'summarizer'} />;
}

export function humanizeCharacterType(characterType?: AgentSummary['characterType']): string {
  if (!characterType) return 'Summarizer';
  return characterType
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function getAgentCharacterLabel(agent: AgentSummary): string {
  return getPromptPersona(agent.characterType ?? 'summarizer')?.name ?? humanizeCharacterType(agent.characterType);
}

export function getAgentPersonalityLabel(agent: AgentSummary): string {
  const personaId = agent.characterType ?? 'summarizer';
  const personalityId = agent.promptConfig?.personality_id;
  if (personalityId) {
    const mapped = getPromptCharacter(personaId, personalityId);
    if (mapped) return mapped.name;
  }
  if (agent.promptConfig?.personality_label?.trim()) {
    return agent.promptConfig.personality_label;
  }
  const defaultCharacter = getPromptCharactersForPersona(personaId)[0];
  return defaultCharacter?.name ?? 'Default Personality';
}

export const PERSONA_ICON_MAP: Record<string, ReactNode> = {
  finance_expert: <PersonaIcon personaId="finance_expert" />,
  teacher:        <PersonaIcon personaId="teacher" />,
  influencer:     <PersonaIcon personaId="influencer" />,
  trainer:        <PersonaIcon personaId="trainer" />,
  philosopher:    <PersonaIcon personaId="philosopher" />,
  summarizer:     <PersonaIcon personaId="summarizer" />,
};

export const PERSONA_ICON_BG_MAP: Record<string, string> = {
  finance_expert: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300',
  teacher:        'bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-300',
  influencer:     'bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-300',
  trainer:        'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300',
  philosopher:    'bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-300',
  summarizer:     'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

export function getAgentCardDisplay(agent: AgentSummary, t: (key: string) => string): { intro: string; icon: ReactNode; characterLabel: string; personalityLabel: string; personaId: string } {
  const characterId = agent.promptConfig?.personality_id ?? '';
  const personaId = agent.characterType ?? 'summarizer';
  const introKey = `personas.${personaId}.characters.${characterId}.intro`;
  const intro = t(introKey) !== introKey
    ? t(introKey)
    : `I'm a ${getAgentPersonalityLabel(agent)} in the ${getAgentCharacterLabel(agent)} family. Give me a source and I'll get to work.`;
  const icon = PERSONA_ICON_MAP[personaId] ?? <FileTextOutlined />;
  const characterLabel = getAgentCharacterLabel(agent);
  const personalityLabel = getAgentPersonalityLabel(agent);
  return { intro, icon, characterLabel, personalityLabel, personaId };
}

/** Only podcast/YouTube sources have "episodes" to pick from - web_urls sources (single/listing
 * pages) keep the old "run now = crawl immediately" behavior with no picker. */
export function hasEpisodicSource(agent: AgentSummary): boolean {
  return agent.sources.some((source) => source.type === 'podcast_feeds' || source.type === 'youtube_videos');
}

export function getSourceDisplayTitle(source: SourceRecord): string {
  if (source.metadata.title?.trim()) return source.metadata.title;
  // Synthetic discussions store the name in config (for sources created before libraryCard.title was set)
  if (source.type === 'synthetic_discussion' && typeof source.config.name === 'string' && source.config.name.trim()) {
    return source.config.name.trim();
  }
  try {
    const url = new URL(source.value);
    return url.hostname;
  } catch {
    return source.value;
  }
}

export function getSourceSpeakers(source: SourceRecord): string[] {
  if (source.type !== 'synthetic_discussion') return [];
  const p = source.config.participants;
  if (Array.isArray(p)) return p.filter((n): n is string => typeof n === 'string');
  return [];
}

export function getSourceCoverImageUrl(source: SourceRecord): string | null {
  if (source.metadata.coverImageUrl) return source.metadata.coverImageUrl;
  if (source.type !== 'youtube_videos') return null;
  const firstPreviewVideoId = extractYoutubeVideoId(source.metadata.previewItems[0]?.link);
  if (firstPreviewVideoId) return getYoutubeThumbnailUrl(firstPreviewVideoId);
  return getYoutubeCoverImageFallback(source.value);
}

// A report's own cited video URL is fresher and more accurate than the source's cached
// (creation-time-only, never refreshed by crawls) preview snapshot above — prefer it.
export function getReportEpisodeThumbnailUrl(report: RunReportDto): string | null {
  const references = report.report?.common?.source_references ?? [];
  for (const reference of references) {
    const videoId = extractYoutubeVideoId(reference.reference);
    if (videoId) return getYoutubeThumbnailUrl(videoId);
  }
  return null;
}
