import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  AudioOutlined,
  ControlOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  SendOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../../data/character-types';
import { listAgentReports, type RunReportDto } from '../../api/agents';
import { useParams, useLocation } from 'react-router-dom';
import { useSafeNavigate } from '../../utils/useSafeNavigate';
import {
  getAudioRenderStatus,
  createDiscussion,
  getDiscussion,
  getDiscussionRun,
  listDiscussionRuns,
  triggerAudioRender,
  triggerDiscussionRun,
  updateDiscussion,
  getDiscussionCapabilities,
  submitDiscussionQuestion,
  type DiscussionCapabilities,
  type DiscussionDto,
  type DiscussionLiveQuestionDto,
  type DiscussionPreselect,
  type DiscussionRunDto,
  type DiscussionRunEvidenceSnapshotDto,
  type DiscussionTurnDto
} from '../../api/discussions';
import { useAppData } from '../../context/AppDataContext';
import { useRealtimeSubscription } from '../../context/RealtimeContext';
import { LiveVoiceBar } from './LiveVoiceBar';
import {
  CastingStage,
  StudioBoard,
  applyPreselect,
  draftFromDiscussion,
  emptyDraft,
  type ShowDraft
} from './StudioBoard';

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
  const fromRight = participant.index % 2 === 1;
  return (
    <div
      className={fromRight ? 'turn-in-right' : 'turn-in-left'}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 16,
        flexDirection: fromRight ? 'row-reverse' : 'row'
      }}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${getCharacterTypeIconBg(participant.characterType)}`}
      >
        {getCharacterTypeEmoji(participant.characterType)}
      </div>
      <Card
        size="small"
        className="turn-bubble"
        style={{ maxWidth: '80%', background: `${color}0d`, border: 'none', ['--speaker-color' as never]: color }}
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
      </Card>
    </div>
  );
}

function UserQuestion({ question }: { question: DiscussionLiveQuestionDto }) {
  const { t } = useTranslation();
  return (
    <div className="studio-user-question">
      <div className="studio-user-question-label">{t('studio.yourLiveQuestion')}</div>
      <div>{question.content}</div>
      {!question.answeredByTurnId && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('studio.questionQueued')}
        </Text>
      )}
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
      <Card size="small" className="turn-bubble" style={{ background: `${color}0d`, border: 'none', ['--speaker-color' as never]: color }} bodyStyle={{ padding: '8px 12px' }}>
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
  activeParticipantId,
  voiceReactive
}: {
  participants: Array<{ id: string; info: ParticipantInfo }>;
  activeParticipantId: string | null;
  /** When true, the active ring follows the real audio amplitude (--voice-level set by LiveVoiceBar). */
  voiceReactive?: boolean;
}) {
  return (
    <div
      className="studio-participant-stage"
      style={{
        display: 'flex',
        gap: 20,
        justifyContent: 'center',
        flexWrap: 'wrap',
        padding: '10px 12px'
      }}
    >
      {participants.map(({ id, info }) => {
        const color = SPEAKER_COLORS[info.index % SPEAKER_COLORS.length];
        const active = id === activeParticipantId;
        return (
          <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}>
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${getCharacterTypeIconBg(info.characterType)} ${active ? `${voiceReactive ? 'speaker-voice' : 'speaker-active'} on-air-ring` : ''}`}
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

/** /studio/new: the studio in setup mode - the stage casts, the board configures, GO LIVE
 * creates the show and drops straight into the live room. */
function SetupRoom() {
  const { t, i18n } = useTranslation();
  const navigate = useSafeNavigate();
  const location = useLocation();
  const [draft, setDraft] = useState<ShowDraft>(() => {
    const base = emptyDraft(i18n.language);
    const preselect = (location.state as { preselect?: DiscussionPreselect } | null)?.preselect;
    return preselect && preselect.entries.length > 0 ? applyPreselect(base, preselect) : base;
  });
  const [preselectLabel, setPreselectLabel] = useState<string | null>(
    () => (location.state as { preselect?: DiscussionPreselect } | null)?.preselect?.contextLabel ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  // "Entering the studio": while the show is being created, the setup board folds down into
  // the bottom bar (visually becoming the live room's chat composer) instead of a bare spinner.
  const [entering, setEntering] = useState(false);
  // In-place handoff to the live room: navigating would remount the whole page (blank gap),
  // so instead the URL is swapped via replaceState and LiveRoom renders right here, seeded
  // with the just-created discussion - the studio reveals where the board folded away.
  const [handoff, setHandoff] = useState<{ discussion: DiscussionDto; runId: string } | null>(null);
  const [capabilities, setCapabilities] = useState<DiscussionCapabilities>({ tts: false, ttsProviders: [] });
  const { agents } = useAppData();

  useEffect(() => {
    getDiscussionCapabilities().then(setCapabilities).catch(() => undefined);
  }, []);

  const effectiveTtsProvider: 'google' | 'openai' | null =
    draft.ttsProvider !== 'auto' && capabilities.ttsProviders.includes(draft.ttsProvider)
      ? draft.ttsProvider
      : capabilities.ttsProviders.includes('openai')
        ? 'openai'
        : capabilities.ttsProviders.includes('google')
          ? 'google'
          : null;

  function suggestedName(): string {
    const name = draft.name.trim();
    if (name) return name;
    const q = draft.agenda.trim();
    if (q) return q.length > 60 ? `${q.slice(0, 57)}…` : q;
    return draft.cast
      .map((m) => {
        const agent = agents.find((a) => a.id === m.agentId);
        return agent ? getAgentDisplayLabel(agent) : m.agentId;
      })
      .join(' × ');
  }

  async function submit(runNow: boolean) {
    setSubmitting(true);
    if (runNow) setEntering(true);
    // The fold animation plays during the network wait; hold navigation briefly so a fast
    // network doesn't cut it off mid-motion.
    const minHold = runNow ? new Promise((resolve) => setTimeout(resolve, 700)) : Promise.resolve();
    try {
      const disc = await createDiscussion({
        name: suggestedName(),
        description: draft.agenda.trim() || undefined,
        format: draft.format,
        formatConfig: {
          totalTurnTarget: draft.totalTurnTarget,
          language: draft.language,
          turnLength: draft.turnLength,
          // No title input in the create flow: the backend names the show from the first
          // turn; suggestedName() above is only the interim fallback shown until then.
          autoTitle: true,
          ...(draft.ttsProvider !== 'auto' ? { ttsProvider: draft.ttsProvider } : {}),
          grounding: {
            mode: draft.groundingMode,
            ...(draft.groundingMode === 'material'
              ? { reportIds: draft.reportIds, artifactIds: draft.transcriptIds }
              : {})
          }
        },
        participants: draft.cast.map((m, i) => ({ ...m, speakerOrder: i, reportIds: [] }))
      });
      if (runNow) {
        const run = await triggerDiscussionRun(disc.id);
        await minHold;
        window.history.replaceState(null, '', `/studio/${disc.id}`);
        setHandoff({ discussion: disc, runId: run.id });
      } else {
        navigate(`/studio/${disc.id}`);
      }
    } catch {
      message.error(t('studio.failedToCreateDiscussion'));
      setSubmitting(false);
      setEntering(false);
    }
  }

  if (handoff) {
    return (
      <LiveRoom
        key={handoff.discussion.id}
        discussionId={handoff.discussion.id}
        initialDiscussion={handoff.discussion}
        initialLiveRunId={handoff.runId}
      />
    );
  }

  return (
    <div className={`studio-live-room ${entering ? 'studio-entering' : ''}`}>
      <header className="studio-live-header">
        <Tooltip title={t('studio.title')}>
          <Button
            type="text"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            aria-label={t('studio.title')}
            onClick={() => navigate('/studio')}
          />
        </Tooltip>
        <div className="studio-live-title">
          <h1>{draft.name.trim() || t('studio.newShowTitle')}</h1>
          <Text type="secondary">{entering ? t('studio.enteringStudio') : t('studio.standby')}</Text>
        </div>
        <span />
      </header>
      <div className={`studio-casting-callout ${draft.cast.length === 0 ? 'studio-casting-callout-empty' : ''}`}>
        <div className="studio-board-section-title">
          <TeamOutlined />
          {t('studio.castStageTitle')}
        </div>
        <CastingStage
          cast={draft.cast}
          onChange={(cast) => setDraft((d) => ({ ...d, cast }))}
          effectiveTtsProvider={effectiveTtsProvider}
          language={draft.language}
        />
      </div>
      <div className="studio-setup-main">
        <StudioBoard
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          capabilities={capabilities}
          mode="create"
          submitting={submitting}
          onGoLive={() => void submit(true)}
          onSave={() => void submit(false)}
          preselectLabel={preselectLabel}
          onClearPreselect={() => {
            setPreselectLabel(null);
            setDraft((d) => ({ ...d, cast: [], reportIds: [] }));
          }}
        />
      </div>
    </div>
  );
}

export function DiscussionDetail() {
  const { discussionId } = useParams<{ discussionId: string }>();
  if (!discussionId) return <SetupRoom />;
  return <LiveRoom key={discussionId} discussionId={discussionId} />;
}

function LiveRoom({
  discussionId,
  initialDiscussion,
  initialLiveRunId
}: {
  discussionId: string;
  // Handoff seeds from SetupRoom's On Air: skip the loading spinner entirely so the
  // studio appears in place while the board folds away.
  initialDiscussion?: DiscussionDto;
  initialLiveRunId?: string;
}) {
  const { t } = useTranslation();
  const navigate = useSafeNavigate();
  const location = useLocation();
  const { agents, refreshSources } = useAppData();

  const [discussion, setDiscussion] = useState<DiscussionDto | null>(initialDiscussion ?? null);
  const [runs, setRuns] = useState<DiscussionRunDto[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(initialLiveRunId ?? null);
  const [liveRun, setLiveRun] = useState<string | null>(initialLiveRunId ?? null);
  const [loading, setLoading] = useState(!initialDiscussion);
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
  const [liveQuestions, setLiveQuestions] = useState<DiscussionLiveQuestionDto[]>([]);
  const [liveQuestionsOpen, setLiveQuestionsOpen] = useState(true);
  const [liveStatus, setLiveStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  // Transcript/voice sync: while a run's audio is playing, only turns whose clip has started
  // are shown. Keyed by run id so the gate survives the run finishing *generation* (voice
  // usually lags generation) and only lifts when playback itself drains.
  const [revealedTurnCount, setRevealedTurnCount] = useState(0);
  const [syncRunId, setSyncRunId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  // Console drawer edit state: seeded from the loaded discussion, applied via updateDiscussion.
  const [editDraft, setEditDraft] = useState<ShowDraft | null>(
    initialDiscussion ? draftFromDiscussion(initialDiscussion) : null
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [question, setQuestion] = useState('');
  const [submittingQuestion, setSubmittingQuestion] = useState(false);

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
      setLiveQuestions(run.questions ?? []);
      setLiveQuestionsOpen(run.questionsClosedAt == null);
      setLiveStatus(run.status === 'pending' ? 'running' : run.status);
    } catch {
      setLiveStatus('error');
    }
  }, [discussionId]);

  useEffect(() => {
    if (!liveRun) return;
    setLiveStatus('running');
    setLiveTurns([]);
    setLiveQuestions([]);
    setLiveQuestionsOpen(true);
    setRevealedTurnCount(0);
    setSyncRunId(liveRun);
    refreshLiveRun(liveRun);
  }, [liveRun, refreshLiveRun]);

  const handleActiveTurnIndexChange = useCallback((index: number) => {
    if (detachTimerRef.current != null) {
      window.clearTimeout(detachTimerRef.current);
      detachTimerRef.current = null;
    }
    setRevealedTurnCount((count) => Math.max(count, index + 1));
  }, []);
  // Playback drained. If an encore answer is still pending (question submitted while the
  // show played), stay attached so its turn + clip can arrive and play; otherwise detach.
  // ponytail: 60s safety timer covers an encore whose audio never renders.
  const detachTimerRef = useRef<number | null>(null);
  const handlePlaybackEnded = useCallback(() => {
    setLiveQuestions((questions) => {
      if (questions.some((q) => !q.answeredByTurnId)) {
        if (detachTimerRef.current == null) {
          detachTimerRef.current = window.setTimeout(() => {
            detachTimerRef.current = null;
            setSyncRunId(null);
            setLiveRun(null);
          }, 60000);
        }
      } else {
        setSyncRunId(null);
        setLiveRun(null);
      }
      return questions;
    });
  }, []);
  useEffect(() => () => {
    if (detachTimerRef.current != null) window.clearTimeout(detachTimerRef.current);
  }, []);

  useRealtimeSubscription(['discussion.changed'], (event) => {
    if (!liveRun) return;
    if (event.topic === 'resync' || event.entityId === discussionId) {
      refreshLiveRun(liveRun);
      // The orchestrator may have just auto-named the show - pick the title up live.
      if (discussionId) {
        getDiscussion(discussionId).then(setDiscussion).catch(() => undefined);
      }
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
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const [followingLive, setFollowingLive] = useState(true);
  useEffect(() => {
    const conversation = conversationRef.current;
    if (liveStatus === 'running' && followingLive && conversation) {
      conversation.scrollTo({ top: conversation.scrollHeight, behavior: 'smooth' });
    }
  }, [followingLive, liveTurns.length, liveQuestions.length, liveStatus]);

  function handleConversationScroll() {
    const conversation = conversationRef.current;
    if (!conversation) return;
    setFollowingLive(conversation.scrollHeight - conversation.scrollTop - conversation.clientHeight < 48);
  }

  function returnToLive() {
    const conversation = conversationRef.current;
    if (!conversation) return;
    setFollowingLive(true);
    conversation.scrollTo({ top: conversation.scrollHeight, behavior: 'smooth' });
  }

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!discussionId) return;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const [disc, runList] = await Promise.all([getDiscussion(discussionId), listDiscussionRuns(discussionId)]);
      setDiscussion(disc);
      setEditDraft(draftFromDiscussion(disc));
      setRuns(runList);
      if (runList.length > 0 && !selectedRunId) {
        setSelectedRunId(runList[0].id);
      }
      const running = runList.find((run) => run.status === 'pending' || run.status === 'running');
      if (running && !liveRun) {
        setLiveRun(running.id);
        setSelectedRunId(running.id);
      }
    } catch {
      message.error(t('studio.failedToLoadDiscussion'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [discussionId, liveRun, selectedRunId]);

  useEffect(() => {
    // Handoff already has the discussion in hand - refresh silently, no spinner.
    loadData({ silent: Boolean(initialDiscussion) });
  }, [discussionId]);

  useEffect(() => {
    if (liveStatus === 'done' || liveStatus === 'error') {
      void loadData({ silent: true });
      // Stay attached to the run while its audio still plays: encore questions target it
      // and the realtime refetch must keep flowing. Detach immediately when there's no
      // audio to wait for (error, TTS off, or nothing rendered).
      setLiveTurns((turns) => {
        if (liveStatus === 'error' || !ttsAvailable || !turns.some((turn) => turn.audioUrl)) {
          setSyncRunId(null);
          setLiveRun(null);
        }
        return turns;
      });
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
      message.error(t('studio.failedToStartRun'));
    } finally {
      setTriggering(false);
    }
  }

  /** Applies console-drawer changes (name, cast, format knobs). Material/agenda stay
   * locked after creation, mirroring the old edit wizard. */
  async function handleSaveEdit() {
    if (!editDraft) return;
    setSavingEdit(true);
    try {
      const disc = await updateDiscussion(discussionId, {
        name: editDraft.name.trim() || undefined,
        format: editDraft.format,
        formatConfig: {
          totalTurnTarget: editDraft.totalTurnTarget,
          language: editDraft.language,
          turnLength: editDraft.turnLength,
          ...(editDraft.ttsProvider !== 'auto' ? { ttsProvider: editDraft.ttsProvider } : {})
        },
        participants: editDraft.cast.map((m, i) => ({ ...m, speakerOrder: i }))
      });
      setDiscussion(disc);
      setEditDraft(draftFromDiscussion(disc));
      setConsoleOpen(false);
    } catch {
      message.error(t('studio.failedToUpdateDiscussion'));
    } finally {
      setSavingEdit(false);
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
          await loadData({ silent: true });
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

  async function handleQuestionSubmit() {
    const content = question.trim();
    if (!discussionId || !liveRun || !content) return;
    setSubmittingQuestion(true);
    try {
      const submitted = await submitDiscussionQuestion(discussionId, liveRun, content);
      setLiveQuestions((current) => current.some((item) => item.id === submitted.id) ? current : [...current, submitted]);
      setQuestion('');
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('studio.questionFailed'));
    } finally {
      setSubmittingQuestion(false);
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
  const displayQuestions: DiscussionLiveQuestionDto[] =
    liveRun && liveRun === selectedRunId ? liveQuestions : selectedRun?.questions ?? [];
  const isLive = liveStatus === 'running' && liveRun === selectedRunId;
  const syncTranscriptToAudio = ttsAvailable && selectedRunId !== null && selectedRunId === syncRunId;
  const visibleTurns = syncTranscriptToAudio ? displayTurns.slice(0, revealedTurnCount) : displayTurns;
  const visibleTurnIds = new Set(visibleTurns.map((turn) => turn.id));
  const visibleQuestions = displayQuestions.filter(
    (item) => !item.answeredByTurnId || visibleTurnIds.has(item.answeredByTurnId)
  );
  // Encore window: run finished generating but its audio is still playing - the show is
  // still "live" for the audience, so the composer stays open (late questions get an
  // encore answer turn from the backend).
  const encoreOpen = !isLive && liveStatus === 'done' && liveRun === selectedRunId && syncRunId === selectedRunId;
  const questionsOpen = (isLive && liveQuestionsOpen) || encoreOpen;
  const hasCompleteTurnAudio = displayTurns.length > 0 && displayTurns.every((turn) => turn.audioUrl);
  const turnTarget = discussion.formatConfig.totalTurnTarget ?? 12;
  // Participants in speaking order for the studio panel and round-robin prediction of the
  // next speaker (mirrors the orchestrator's contexts[turn % contexts.length]).
  const activeParticipants = discussion.participants.filter((participant) => participant.active);
  const orderedParticipants = activeParticipants
    .slice()
    .sort((a, b) => a.speakerOrder - b.speakerOrder)
    .map((p) => ({ id: p.id, info: participantInfoMap[p.id] ?? { name: t('studio.agentFallback'), characterType: null, index: 0 } }));
  const thinkingParticipant =
    isLive && orderedParticipants.length > 0
      ? orderedParticipants[visibleTurns.length % orderedParticipants.length]
      : null;
  const lastVisibleSpeakerId = visibleTurns.length > 0 ? visibleTurns[visibleTurns.length - 1].participantId : null;
  // While audio drives the transcript, the flashing avatar must be whoever is actually
  // talking (the last revealed turn) - not the round-robin prediction of the NEXT speaker.
  const activeParticipantId = syncTranscriptToAudio
    ? lastVisibleSpeakerId
    : thinkingParticipant?.id ?? (isLive ? lastVisibleSpeakerId : null);
  const speakerNames = Object.fromEntries(
    Object.entries(participantInfoMap).map(([id, info]) => [id, info.name])
  );

  const questionLimitReached = displayQuestions.length >= 10;
  const composerDisabled = !questionsOpen || questionLimitReached;

  return (
    <div className={`studio-live-room ${initialDiscussion ? 'studio-reveal' : ''}`}>
      <header className="studio-live-header">
        <Tooltip title={t('studio.title')}>
          <Button
            type="text"
            shape="circle"
            icon={<ArrowLeftOutlined />}
            aria-label={t('studio.title')}
            onClick={() => navigate('/studio')}
          />
        </Tooltip>
        <div className="studio-live-title">
          <h1>{discussion.name}</h1>
          <Text type="secondary">
            {isLive
              ? t('studio.liveProgress', { current: Math.min(visibleTurns.length, turnTarget), target: turnTarget })
              : t(`studio.format_${discussion.format}`)}
          </Text>
        </div>
        <div className="studio-live-header-actions">
          <Tooltip title={t('studio.more')}>
            <Button
              type="text"
              shape="circle"
              icon={<MoreOutlined />}
              aria-label={t('studio.more')}
              onClick={() => setMoreOpen(true)}
            />
          </Tooltip>
        </div>
      </header>

      <StudioPanel participants={orderedParticipants} activeParticipantId={activeParticipantId} voiceReactive={syncTranscriptToAudio} />

      {runs.length > 0 && (
        <div className="studio-episode-shelf" role="tablist" aria-label={t('studio.runHistory')}>
          {runs.map((run, index) => {
            const number = runs.length - index;
            const runIsLive = liveRun === run.id && liveStatus === 'running';
            return (
              <button
                key={run.id}
                type="button"
                role="tab"
                aria-selected={selectedRunId === run.id}
                className={`studio-episode-chip ${selectedRunId === run.id ? 'studio-episode-chip-active' : ''}`}
                onClick={() => setSelectedRunId(run.id)}
              >
                {runIsLive ? <span className="studio-episode-live-dot" aria-hidden="true" /> : <PlayCircleOutlined />}
                <b>{t('studio.episodeChip', { number })}</b>
                <span>
                  {runIsLive ? t('studio.episodeLiveNow') : new Date(run.createdAt).toLocaleDateString()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <LiveVoiceBar
        runId={selectedRunId}
        runStatus={isLive ? 'running' : selectedRun?.status}
        runStartedAt={selectedRun?.startedAt ?? selectedRun?.createdAt}
        turns={displayTurns}
        fallbackUrl={selectedRun?.audioUrl}
        speakerNames={speakerNames}
        waitingMessage={t(`studio.warmup${warmupIndex}`)}
        audioAvailable={ttsAvailable}
        onActiveTurnIndexChange={handleActiveTurnIndexChange}
        onPlaybackEnded={handlePlaybackEnded}
      />

      <div
        ref={conversationRef}
        className="studio-conversation"
        role="log"
        aria-live="polite"
        aria-label={t('studio.transcript')}
        tabIndex={0}
        onScroll={handleConversationScroll}
      >
        {isLive && (
          <div className="studio-generation-status">
            <Spin size="small" />
            <Text type="secondary">
              {visibleTurns.length === 0
                ? t(`studio.warmup${warmupIndex}`)
                : t('studio.turnProgress', { current: Math.min(visibleTurns.length, turnTarget), target: turnTarget })}
            </Text>
          </div>
        )}

        {visibleTurns.length === 0 && visibleQuestions.length === 0 && !isLive ? (
          <div className="studio-room-empty">
            <AudioOutlined />
            <Text type={selectedRun?.status === 'error' ? 'danger' : 'secondary'}>
              {selectedRun?.status === 'error'
                ? t('studio.runFailed', { message: selectedRun.errorMessage ?? t('studio.unknownError') })
                : t('studio.noRuns')}
            </Text>
            {selectedRun?.status === 'error' && (
              <Button icon={<PlayCircleOutlined />} loading={triggering} onClick={handleRunNow}>
                {t('studio.tryAgain')}
              </Button>
            )}
            {!selectedRun && (
              <Button type="primary" icon={<PlayCircleOutlined />} loading={triggering} onClick={handleRunNow}>
                {t('studio.runNow')}
              </Button>
            )}
          </div>
        ) : (
          <>
            {visibleTurns.map((turn) => (
              <React.Fragment key={turn.id}>
                {visibleQuestions
                  .filter((item) => item.answeredByTurnId === turn.id)
                  .map((item) => <UserQuestion key={item.id} question={item} />)}
                <TurnBubble
                  turn={turn}
                  participant={
                    participantInfoMap[turn.participantId] ?? {
                      name: t('studio.agentFallback'),
                      characterType: null,
                      index: 0
                    }
                  }
                />
              </React.Fragment>
            ))}
            {visibleQuestions
              .filter((item) => !item.answeredByTurnId)
              .map((item) => <UserQuestion key={item.id} question={item} />)}
            {isLive && thinkingParticipant && (
              <TypingIndicator participant={thinkingParticipant.info} label={t('studio.speakerThinking')} />
            )}
            {!isLive && !syncTranscriptToAudio && selectedRun?.status === 'done' && displayTurns.length > 0 && (
              <div className="studio-wrapped-card">
                <div className="studio-wrapped-title">{t('studio.showWrapped')}</div>
                <Text type="secondary">{t('studio.showWrappedDesc', { count: displayTurns.length })}</Text>
                <div className="studio-wrapped-actions">
                  <Button type="primary" icon={<PlayCircleOutlined />} loading={triggering} onClick={handleRunNow}>
                    {t('studio.newEpisode')}
                  </Button>
                  <Button onClick={() => navigate('/studio')}>{t('studio.backToLobby')}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!followingLive && isLive && (
        <Button className="studio-new-messages" size="small" onClick={returnToLive}>
          {t('studio.newMessages')}
        </Button>
      )}

      <form
        className="studio-question-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void handleQuestionSubmit();
        }}
      >
        {/* The setup board folded down into this bar - its control lives here as the
            command-panel entry to the full console drawer. */}
        <Tooltip title={t('studio.console')}>
          <Button
            type="text"
            shape="circle"
            className="studio-composer-console"
            icon={<ControlOutlined />}
            aria-label={t('studio.console')}
            onClick={() => setConsoleOpen(true)}
          />
        </Tooltip>
        <Input
          value={question}
          maxLength={500}
          disabled={composerDisabled}
          placeholder={
            questionLimitReached
              ? t('studio.questionLimitReached')
              : questionsOpen
                ? t('studio.questionPlaceholder')
                : t('studio.questionLiveOnly')
          }
          aria-label={t('studio.questionPlaceholder')}
          onChange={(event) => setQuestion(event.target.value)}
          suffix={
            <Button
              type="primary"
              shape="circle"
              htmlType="submit"
              icon={<SendOutlined />}
              loading={submittingQuestion}
              disabled={composerDisabled || !question.trim()}
              aria-label={t('studio.sendQuestion')}
            />
          }
        />
        {questionsOpen && (
          <Text type="secondary" className="studio-question-count">
            {t('studio.questionsRemaining', { count: Math.max(0, 10 - displayQuestions.length) })}
          </Text>
        )}
      </form>

      <Drawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t('studio.discussionOptions')}
        width={420}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={triggering}
              disabled={isLive}
              onClick={handleRunNow}
            >
              {runs.length === 0 ? t('studio.runNow') : t('studio.runAgain')}
            </Button>
            {ttsAvailable && selectedRunId && !hasCompleteTurnAudio && (
              <Button
                loading={renderingAudio}
                disabled={selectedRun?.status !== 'done'}
                onClick={handleRenderAudio}
                icon={<AudioOutlined />}
              >
                {t('studio.renderAudio')}
              </Button>
            )}
          </Space>

          <div className="studio-detail-grid">
            <div><Text type="secondary">{t('studio.detailsFormat')}</Text><strong>{t(`studio.format_${discussion.format}`)}</strong></div>
            <div><Text type="secondary">{t('studio.detailsLanguage')}</Text><strong>{(discussion.formatConfig.language ?? 'en') === 'de' ? t('studio.languageGerman') : t('studio.languageEnglish')}</strong></div>
            <div><Text type="secondary">{t('studio.detailsCreated')}</Text><strong>{new Date(discussion.createdAt).toLocaleDateString()}</strong></div>
            <div><Text type="secondary">{t('studio.participants')}</Text><strong>{activeParticipants.length}</strong></div>
          </div>

          <div>
            <Text strong>{t('studio.detailsSpeakers')}</Text>
            <div className="studio-speaker-tags">
              {activeParticipants.map((participant) => {
                const info = participantInfoMap[participant.id];
                return (
                  <Tag key={participant.id}>
                    {getCharacterTypeEmoji(info?.characterType ?? null)} {info?.name ?? participant.agentId}
                  </Tag>
                );
              })}
            </div>
          </div>

          {selectedRun && (
            <div>
              <Text strong>{t('studio.evidencePanel')}</Text>
              <div style={{ marginTop: 8 }}>
                <EvidencePanel
                  evidenceSnapshot={selectedRun.evidenceSnapshot ?? null}
                  legacyAgenda={discussion.description}
                  participantInfoMap={participantInfoMap}
                />
              </div>
            </div>
          )}
        </Space>
      </Drawer>

      <Drawer
        open={consoleOpen}
        onClose={() => {
          setConsoleOpen(false);
          // Discard unsaved knob changes so reopening shows the persisted state.
          if (discussion) setEditDraft(draftFromDiscussion(discussion));
        }}
        title={t('studio.console')}
        width={480}
        className="studio-console-drawer"
      >
        {isLive ? (
          <Alert type="info" showIcon message={t('studio.consoleLockedLive')} />
        ) : editDraft ? (
          <div className="studio-console-content">
            <CastingStage
              cast={editDraft.cast}
              onChange={(cast) => setEditDraft((d) => (d ? { ...d, cast } : d))}
              effectiveTtsProvider={
                capabilities.ttsProviders.includes('openai')
                  ? 'openai'
                  : capabilities.ttsProviders.includes('google')
                    ? 'google'
                    : null
              }
              language={editDraft.language}
            />
            <Alert type="info" showIcon message={t('studio.expertChangesFutureRuns')} />
            <StudioBoard
              draft={editDraft}
              onChange={(patch) => setEditDraft((d) => (d ? { ...d, ...patch } : d))}
              capabilities={capabilities}
              mode="edit"
              submitting={savingEdit}
              onSave={() => void handleSaveEdit()}
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
