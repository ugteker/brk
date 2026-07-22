import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  List,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  AudioOutlined,
  PlayCircleOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { getAgentDisplayLabel } from '../utils/agent-label';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../data/character-types';
import { listAgentReports, type RunReportDto } from '../api/agents';
import { useParams, useLocation } from 'react-router-dom';
import { useSafeNavigate } from '../utils/useSafeNavigate';
import {
  getAudioRenderStatus,
  getDiscussion,
  getDiscussionRun,
  listDiscussionRuns,
  triggerAudioRender,
  triggerDiscussionRun,
  getDiscussionCapabilities,
  type DiscussionCapabilities,
  type DiscussionDto,
  type DiscussionRunDto,
  type DiscussionRunEvidenceSnapshotDto,
  type DiscussionTurnDto
} from '../api/discussions';
import { useAppData } from '../context/AppDataContext';
import { useRealtimeSubscription } from '../context/RealtimeContext';

const { Text, Paragraph } = Typography;

const SPEAKER_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

/** Everything the transcript needs to render a participant consistently. */
interface ParticipantInfo {
  name: string;
  characterType: string | null;
  index: number;
}

/** Client-side mirror of the backend sanitizeDiscussionTurnText logic.
 * Applied when rendering stored turns so that any historical JSON blobs (produced before
 * the backend sanitizer handled all shapes) are shown as readable prose in the UI. */
function sanitizeTurnContent(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(candidate); } catch { return trimmed; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return trimmed;

  const obj = parsed as Record<string, unknown>;
  const knownFields = ['content', 'text', 'message', 'response', 'dialogue', 'speech', 'summary'];
  for (const k of knownFields) {
    if (typeof obj[k] === 'string' && (obj[k] as string).trim().length > 0) return (obj[k] as string).trim();
  }
  const common = obj.common;
  if (common && typeof common === 'object' && !Array.isArray(common)) {
    const s = (common as Record<string, unknown>)['summary'];
    if (typeof s === 'string' && s.trim().length > 0) return s.trim();
  }
  const section = obj.section;
  if (section && typeof section === 'object' && !Array.isArray(section)) {
    for (const k of ['market_summary', 'lesson_explanation', 'argument_reflection']) {
      const s = (section as Record<string, unknown>)[k];
      if (typeof s === 'string' && s.trim().length > 0) return (s as string).trim();
    }
  }
  // Deep walk: collect all prose-like strings (≥30 chars, ≥4 words)
  const prose: string[] = [];
  function walk(v: unknown): void {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length >= 30 && t.split(/\s+/).length >= 4) prose.push(t);
    } else if (Array.isArray(v)) { v.forEach(walk); }
    else if (v && typeof v === 'object') { Object.values(v as Record<string, unknown>).forEach(walk); }
  }
  walk(obj);
  if (prose.length > 0) {
    return [...new Set(prose)].sort((a, b) => b.length - a.length).slice(0, 5).join('\n\n');
  }
  return trimmed;
}

function TurnBubble({ turn, participant }: { turn: DiscussionTurnDto; participant: ParticipantInfo }) {
  const color = SPEAKER_COLORS[participant.index % SPEAKER_COLORS.length];
  const displayContent = sanitizeTurnContent(turn.content);
  return (
    <div className="turn-fade-in" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${getCharacterTypeIconBg(participant.characterType)}`}
      >
        {getCharacterTypeEmoji(participant.characterType)}
      </div>
      <Card
        size="small"
        style={{ maxWidth: '80%', background: `${color}0d`, border: 'none' }}
        bodyStyle={{ padding: '8px 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <strong style={{ fontSize: 12, color }}>{participant.name}</strong>
          {turn.segmentLabel && (
            <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
              {turn.segmentLabel}
            </Tag>
          )}
        </div>
        <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{displayContent}</Paragraph>
        {turn.audioUrl && (
          <audio src={turn.audioUrl} controls style={{ width: '100%', marginTop: 8, height: 28 }} />
        )}
      </Card>
    </div>
  );
}

/** Speech-bubble-shaped placeholder with animated dots shown while the AI generates the next
 * speaker's turn - turn generation takes many seconds and without this the transcript looks
 * finished/stuck between turns. */
function TypingIndicator({ participant, label }: { participant: ParticipantInfo; label: string }) {
  const color = SPEAKER_COLORS[participant.index % SPEAKER_COLORS.length];
  return (
    <div className="turn-fade-in" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${getCharacterTypeIconBg(participant.characterType)}`}
      >
        {getCharacterTypeEmoji(participant.characterType)}
      </div>
      <Card size="small" style={{ background: `${color}0d`, border: 'none' }} bodyStyle={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 12, color }}>{participant.name}</strong>
          <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
          <span className="typing-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
        </div>
      </Card>
    </div>
  );
}

/** Podcast-studio style header above the live transcript: every participant as an avatar,
 * with the currently speaking/thinking participant highlighted with a pulsing ring. */
function StudioPanel({
  participants,
  activeParticipantId
}: {
  participants: Array<{ id: string; info: ParticipantInfo }>;
  activeParticipantId: string | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 20,
        justifyContent: 'center',
        flexWrap: 'wrap',
        padding: '14px 12px',
        marginBottom: 16,
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(114,46,209,0.07), rgba(22,119,255,0.07))'
      }}
    >
      {participants.map(({ id, info }) => {
        const color = SPEAKER_COLORS[info.index % SPEAKER_COLORS.length];
        const active = id === activeParticipantId;
        return (
          <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}>
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${getCharacterTypeIconBg(info.characterType)} ${active ? 'speaker-active' : ''}`}
              style={active ? ({ '--speaker-color': color } as React.CSSProperties) : { opacity: 0.75 }}
            >
              {getCharacterTypeEmoji(info.characterType)}
            </div>
            <Text style={{ fontSize: 11, fontWeight: active ? 600 : 400, color: active ? color : undefined, maxWidth: 84 }} ellipsis>
              {info.name}
            </Text>
          </div>
        );
      })}
    </div>
  );
}

function EvidencePanel({
  evidenceSnapshot,
  legacyAgenda,
  participantInfoMap
}: {
  /** The run's frozen evidence snapshot. Null for legacy runs created before snapshots
   * existed - in that case we fall back to the discussion's *current* description, since
   * no frozen agenda was ever recorded for that run. */
  evidenceSnapshot: DiscussionRunEvidenceSnapshotDto | null;
  legacyAgenda: string;
  participantInfoMap: Record<string, ParticipantInfo>;
}) {
  const { t } = useTranslation();
  const { agents: allAgents } = useAppData();
  const agendaText = evidenceSnapshot ? evidenceSnapshot.agenda : legacyAgenda;

  // Resolve raw report IDs to human-readable headlines by fetching each involved
  // agent's reports once. Shared-pool reports may come from any agent, so in that
  // case we scan all agents. Falls back to the bare ID for reports we can't resolve.
  const [reportLabels, setReportLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!evidenceSnapshot) return;
    const agentIds = evidenceSnapshot.shared
      ? allAgents.map((a) => a.id)
      : [...new Set(evidenceSnapshot.participants.map((p) => p.agentId))];
    Promise.all(
      agentIds.map(async (agentId) => {
        try {
          return await listAgentReports(agentId);
        } catch {
          return [] as RunReportDto[];
        }
      })
    ).then((lists) => {
      const labels: Record<string, string> = {};
      for (const r of lists.flat()) {
        const headline = r.report?.common?.headline;
        labels[r.id] = headline && headline.trim() ? headline : r.summary.slice(0, 60);
      }
      setReportLabels(labels);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidenceSnapshot, allAgents]);

  function originTag(origin: string) {
    if (origin === 'explicit') return <Tag color="blue">{t('studio.evidenceOriginExplicit')}</Tag>;
    if (origin === 'none') return <Tag color="default">{t('studio.evidenceOriginNone')}</Tag>;
    return <Tag color="default">{t('studio.evidenceOriginFallback')}</Tag>;
  }

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Text strong>{t('studio.evidenceAgendaLabel')}: </Text>
        <Text>{agendaText || t('studio.evidenceNoAgenda')}</Text>
      </Card>
      {evidenceSnapshot?.shared && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <strong>{t('studio.evidenceSharedLabel')}</strong>
            {evidenceSnapshot.shared.reportIds.length > 0 && (
              <div>
                <Text type="secondary">{t('studio.evidenceReportsLabel')}: </Text>
                {evidenceSnapshot.shared.reportIds.map((id) => (
                  <Tag key={id} style={{ maxWidth: '100%', whiteSpace: 'normal' }}>
                    {reportLabels[id] ?? id}
                  </Tag>
                ))}
              </div>
            )}
            {evidenceSnapshot.shared.sourceItemIds.length > 0 && (
              <div>
                <Text type="secondary">{t('studio.evidenceSourceItemsLabel')}: </Text>
                {evidenceSnapshot.shared.sourceItemIds.map((id) => (
                  <Tag key={id} color="green">
                    {id}
                  </Tag>
                ))}
              </div>
            )}
            {evidenceSnapshot.shared.transcriptWarnings.length > 0 && (
              <div>
                <Text type="warning">{t('studio.evidenceWarningsLabel')}: </Text>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                  {evidenceSnapshot.shared.transcriptWarnings.map((w) => (
                    <li key={w}>
                      <Text type="warning">{w}</Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Space>
        </Card>
      )}
      {!evidenceSnapshot ? (
        <Text type="secondary">{t('studio.evidenceLegacyRun')}</Text>
      ) : evidenceSnapshot.shared ? null : (
        evidenceSnapshot.participants.map((p) => {
          const info = participantInfoMap[p.participantId];
          return (
            <Card key={p.participantId} size="small" style={{ marginBottom: 12 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space>
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm ${getCharacterTypeIconBg(info?.characterType)}`}
                  >
                    {getCharacterTypeEmoji(info?.characterType)}
                  </div>
                  <strong>{info?.name ?? p.agentId}</strong>
                  {originTag(p.origin)}
                </Space>
                {p.reportIds.length > 0 && (
                  <div>
                    <Text type="secondary">{t('studio.evidenceReportsLabel')}: </Text>
                    {p.reportIds.map((id) => (
                      <Tag key={id} style={{ maxWidth: '100%', whiteSpace: 'normal' }}>
                        {reportLabels[id] ?? id}
                      </Tag>
                    ))}
                  </div>
                )}
                {p.sourceItemIds.length > 0 && (
                  <div>
                    <Text type="secondary">{t('studio.evidenceSourceItemsLabel')}: </Text>
                    {p.sourceItemIds.map((id) => (
                      <Tag key={id} color="green">
                        {id}
                      </Tag>
                    ))}
                  </div>
                )}
                {p.transcriptWarnings.length > 0 && (
                  <div>
                    <Text type="warning">{t('studio.evidenceWarningsLabel')}: </Text>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: 20 }}>
                      {p.transcriptWarnings.map((w) => (
                        <li key={w}>
                          <Text type="warning">{w}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Space>
            </Card>
          );
        })
      )}
    </div>
  );
}

export function DiscussionDetail() {
  const { t } = useTranslation();
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useSafeNavigate();
  const location = useLocation();
  const { agents, refreshSources } = useAppData();

  const [discussion, setDiscussion] = useState<DiscussionDto | null>(null);
  const [runs, setRuns] = useState<DiscussionRunDto[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [renderingAudio, setRenderingAudio] = useState(false);
  // Rotating "warming up the studio" copy shown while a live run has produced no
  // turns yet - generating the first turn can take a while and a bare spinner
  // reads like a hang.
  const WARMUP_MESSAGE_COUNT = 5;
  const [warmupIndex, setWarmupIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setWarmupIndex((i) => (i + 1) % WARMUP_MESSAGE_COUNT), 4000);
    return () => clearInterval(interval);
  }, []);
  // Hide the "Render audio" button entirely when the backend has no TTS configured.
  const [capabilities, setCapabilities] = useState<DiscussionCapabilities>({ tts: false, ttsProviders: [] });
  const ttsAvailable = capabilities.tts;

  useEffect(() => {
    getDiscussionCapabilities()
      .then(setCapabilities)
      .catch(() => setCapabilities({ tts: false, ttsProviders: [] }));
  }, []);

  // Live run turns/status, kept up to date by the global `discussion.changed` realtime
  // subscription below instead of a per-run EventSource (`/api/discussions/:id/runs/:runId/stream`,
  // now removed).
  const [liveTurns, setLiveTurns] = useState<DiscussionTurnDto[]>([]);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  // Refetches the tracked live run and merges its turns (by turn id) into local state, then
  // maps its status onto the UI's running/done/error states. 'pending' is treated the same
  // as 'running' since the transcript view has no separate "queued" UI.
  const refreshLiveRun = useCallback(async (runId: string) => {
    if (!discussionId) return;
    try {
      const run = await getDiscussionRun(discussionId, runId);
      setLiveTurns((prev) => {
        const byId = new Map(prev.map((turn) => [turn.id, turn]));
        for (const turn of run.turns) byId.set(turn.id, turn);
        return [...byId.values()].sort((a, b) => a.turnIndex - b.turnIndex);
      });
      setLiveStatus(run.status === 'pending' ? 'running' : run.status);
    } catch {
      setLiveStatus('error');
    }
  }, [discussionId]);

  useEffect(() => {
    if (!liveRun) return;
    setLiveStatus('running');
    setLiveTurns([]);
    refreshLiveRun(liveRun);
  }, [liveRun, refreshLiveRun]);

  useRealtimeSubscription(['discussion.changed'], (event) => {
    if (!liveRun) return;
    if (event.topic === 'resync') {
      refreshLiveRun(liveRun);
      return;
    }
    if (event.entityId === discussionId) {
      refreshLiveRun(liveRun);
    }
  });

  // The wizard's "run now" already triggered a run and hands its ID over via
  // navigation state - attach to that run's live stream instead of requiring
  // the user to click "Run now" a second time.
  useEffect(() => {
    const incoming = (location.state as { liveRunId?: string } | null)?.liveRunId;
    if (incoming) {
      setLiveRun(incoming);
      setSelectedRunId(incoming);
      // Clear the state so a page refresh doesn't re-attach to a finished run.
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest live turn in view while the discussion is generating.
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (liveStatus === 'running' && liveTurns.length > 0) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [liveTurns.length, liveStatus]);

  const loadData = useCallback(async () => {
    if (!discussionId) return;
    setLoading(true);
    try {
      const [disc, runList] = await Promise.all([getDiscussion(discussionId), listDiscussionRuns(discussionId)]);
      setDiscussion(disc);
      setRuns(runList);
      if (runList.length > 0 && !selectedRunId) {
        setSelectedRunId(runList[0].id);
      }
    } catch {
      message.error('Failed to load discussion');
    } finally {
      setLoading(false);
    }
  }, [discussionId, selectedRunId]);

  useEffect(() => {
    loadData();
  }, [discussionId]);

  useEffect(() => {
    if (liveStatus === 'done' || liveStatus === 'error') {
      setLiveRun(null);
      loadData();
    }
    if (liveStatus === 'done') {
      // The completed run just (re)created/updated the synthetic library card;
      // refresh the app-wide sources so the Library shows it without a reload.
      void refreshSources();
    }
  }, [liveStatus]);

  async function handleRunNow() {
    if (!discussionId) return;
    setTriggering(true);
    try {
      const run = await triggerDiscussionRun(discussionId);
      setLiveRun(run.id);
      setSelectedRunId(run.id);
    } catch {
      message.error('Failed to start run');
    } finally {
      setTriggering(false);
    }
  }

  async function handleRenderAudio() {
    if (!discussionId || !selectedRunId) return;
    const runId = selectedRunId;
    setRenderingAudio(true);
    try {
      await triggerAudioRender(discussionId, runId);
      message.info(t('studio.audioRendering'));
      // Poll until the detached render finishes (or fails) so the player appears
      // without a manual page reload. Capped at 5 minutes.
      for (let i = 0; i < 100; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const status = await getAudioRenderStatus(discussionId, runId);
        if (status.state === 'done') {
          message.success(t('studio.audioReady'));
          await loadData();
          return;
        }
        if (status.state === 'error') {
          message.error(t('studio.audioFailed'));
          return;
        }
      }
      message.warning(t('studio.audioFailed'));
    } catch (error) {
      message.error(
        error instanceof Error && error.message === 'tts_not_configured'
          ? t('studio.audioNotConfigured')
          : t('studio.audioFailed')
      );
    } finally {
      setRenderingAudio(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!discussion) return null;

  const participantInfoMap: Record<string, ParticipantInfo> = Object.fromEntries(
    discussion.participants.map((p, i) => {
      const agent = agents.find((candidate) => candidate.id === p.agentId);
      return [
        p.id,
        {
          name: agent ? getAgentDisplayLabel(agent) : p.agentId,
          characterType: agent?.characterType ?? null,
          index: i
        }
      ];
    })
  );
  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const displayTurns: DiscussionTurnDto[] =
    liveRun && liveRun === selectedRunId ? liveTurns : selectedRun?.turns ?? [];
  const isLive = liveStatus === 'running' && liveRun === selectedRunId;
  const turnTarget = discussion.formatConfig.totalTurnTarget ?? 12;
  // Participants in speaking order for the studio panel and round-robin prediction of the
  // next speaker (mirrors the orchestrator's contexts[turn % contexts.length]).
  const orderedParticipants = discussion.participants
    .slice()
    .sort((a, b) => a.speakerOrder - b.speakerOrder)
    .map((p) => ({ id: p.id, info: participantInfoMap[p.id] ?? { name: 'Agent', characterType: null, index: 0 } }));
  const thinkingParticipant =
    isLive && orderedParticipants.length > 0 && displayTurns.length < turnTarget
      ? orderedParticipants[displayTurns.length % orderedParticipants.length]
      : null;
  const activeParticipantId =
    thinkingParticipant?.id ?? (isLive && displayTurns.length > 0 ? displayTurns[displayTurns.length - 1].participantId : null);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/studio')}
            style={{ marginBottom: 8, paddingLeft: 0 }}
          >
            {t('studio.title')}
          </Button>
          <h2 className="m-0 break-words text-[clamp(1.25rem,6vw,1.5rem)]">
            <AudioOutlined style={{ marginRight: 8 }} />
            {discussion.name}
          </h2>
          <Space style={{ marginTop: 4 }} size={4}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t(`studio.format_${discussion.format}`)} · {discussion.participants.length}{' '}
              {t('studio.participants')}
            </Text>
          </Space>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
          <Button
            className="flex-1 sm:flex-none"
            icon={<PlayCircleOutlined />}
            type="primary"
            loading={triggering}
            onClick={handleRunNow}
          >
            {runs.length === 0 ? t('studio.runNow') : t('studio.runAgain')}
          </Button>
          {ttsAvailable && selectedRunId && (
            <Tooltip title={selectedRun?.status !== 'done' ? t('studio.renderAudioNeedsRun') : undefined}>
              <Button
                className="flex-1 sm:flex-none"
                loading={renderingAudio}
                disabled={selectedRun?.status !== 'done'}
                onClick={handleRenderAudio}
                icon={<AudioOutlined />}
              >
                {t('studio.renderAudio')}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <Card size="small" style={{ marginBottom: 16 }} title={t('studio.detailsTitle')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', fontSize: 13 }}>
          <span>
            <Text type="secondary">{t('studio.detailsFormat')}: </Text>
            {t(`studio.format_${discussion.format}`)}
          </span>
          <span>
            <Text type="secondary">{t('studio.detailsLanguage')}: </Text>
            {(discussion.formatConfig.language ?? 'en') === 'de' ? t('studio.languageGerman') : t('studio.languageEnglish')}
          </span>
          {ttsAvailable && (
            <span>
              <Text type="secondary">{t('studio.detailsVoiceService')}: </Text>
              {(() => {
                const chosen = discussion.formatConfig.ttsProvider;
                const effective =
                  chosen === 'google' || chosen === 'openai'
                    ? chosen
                    : capabilities.ttsProviders.includes('google')
                      ? 'google'
                      : capabilities.ttsProviders.includes('openai')
                        ? 'openai'
                        : null;
                if (!effective) return t('studio.voiceApiAuto');
                const label = effective === 'google' ? t('studio.voiceApiGoogle') : t('studio.voiceApiOpenai');
                return chosen === 'google' || chosen === 'openai' ? label : `${t('studio.voiceApiAuto')} · ${label}`;
              })()}
            </span>
          )}
          <span>
            <Text type="secondary">{t('studio.detailsCreated')}: </Text>
            {new Date(discussion.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>{t('studio.detailsSpeakers')}: </Text>
          {discussion.participants.map((p) => {
            const info = participantInfoMap[p.id];
            return (
              <Tag key={p.id} style={{ margin: 0 }}>
                {getCharacterTypeEmoji(info?.characterType ?? null)} {info?.name ?? p.agentId} · {p.voiceId}
              </Tag>
            );
          })}
        </div>
      </Card>

      {runs.length === 0 && !liveRun ? (
        <Card>
          <Text type="secondary">{t('studio.noRuns')}</Text>
        </Card>
      ) : (
        <Tabs
          items={[
            {
              key: 'transcript',
              label: t('studio.transcript'),
              children: (
                <div>
                  {runs.length > 1 && (
                    <Select
                      value={selectedRunId ?? undefined}
                      onChange={setSelectedRunId}
                      style={{ width: 260, marginBottom: 16 }}
                      options={runs.map((r, i) => ({
                        value: r.id,
                        label: `Run ${i + 1} — ${new Date(r.createdAt).toLocaleDateString()}`
                      }))}
                    />
                  )}
                  {isLive && (
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Spin size="small" />
                      <Text type="secondary">
                        {displayTurns.length === 0
                          ? t(`studio.warmup${warmupIndex}`)
                          : t('studio.turnProgress', { current: displayTurns.length, target: turnTarget })}
                      </Text>
                    </div>
                  )}
                  {isLive && orderedParticipants.length > 0 && (
                    <StudioPanel participants={orderedParticipants} activeParticipantId={activeParticipantId} />
                  )}
                  {displayTurns.length === 0 && !isLive ? (
                    selectedRun?.status === 'error' ? (
                      <Text type="danger">
                        {t('studio.runFailed', { message: selectedRun.errorMessage ?? 'Unknown error' })}
                      </Text>
                    ) : selectedRun?.status === 'pending' || selectedRun?.status === 'running' ? (
                      <Text type="secondary">{t('studio.runPending')}</Text>
                    ) : (
                      <Text type="secondary">{t('studio.noRuns')}</Text>
                    )
                  ) : (
                    <>
                      <List
                        dataSource={displayTurns}
                        renderItem={(turn) => (
                          <TurnBubble
                            key={turn.id}
                            turn={turn}
                            participant={
                              participantInfoMap[turn.participantId] ?? {
                                name: 'Agent',
                                characterType: null,
                                index: 0
                              }
                            }
                          />
                        )}
                      />
                      {isLive && thinkingParticipant && displayTurns.length > 0 && (
                        <TypingIndicator
                          participant={thinkingParticipant.info}
                          label={t('studio.speakerThinking')}
                        />
                      )}
                      {!isLive && selectedRun?.status === 'done' && displayTurns.length > 0 && (
                        <div style={{ textAlign: 'center', margin: '16px 0 8px' }}>
                          <Text type="secondary" style={{ fontSize: 13 }}>
                            🏁 {t('studio.discussionFinished')}
                          </Text>
                          {ttsAvailable && !selectedRun.audioUrl && (
                            <div style={{ marginTop: 8 }}>
                              <Button
                                size="small"
                                loading={renderingAudio}
                                onClick={handleRenderAudio}
                                icon={<AudioOutlined />}
                              >
                                {t('studio.renderAudio')}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                      <div ref={transcriptEndRef} />
                    </>
                  )}
                </div>
              )
            },
            {
              key: 'audio',
              label: t('studio.audioPlayer'),
              children: selectedRun?.audioUrl ? (
                <audio src={selectedRun.audioUrl} controls style={{ width: '100%' }} />
              ) : ttsAvailable ? (
                <Text type="secondary">No audio yet. Click &quot;{t('studio.renderAudio')}&quot; to generate a podcast.</Text>
              ) : (
                <Text type="secondary">{t('studio.audioNotConfigured')}</Text>
              )
            },
            {
              key: 'evidence',
              label: t('studio.evidencePanel'),
              children: (
                <EvidencePanel
                  evidenceSnapshot={selectedRun?.evidenceSnapshot ?? null}
                  legacyAgenda={discussion.description}
                  participantInfoMap={participantInfoMap}
                />
              )
            }
          ]}
        />
      )}
    </div>
  );
}
