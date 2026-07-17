import React, { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  List,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message
} from 'antd';
import {
  ArrowLeftOutlined,
  AudioOutlined,
  PlayCircleOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getDiscussion,
  listDiscussionRuns,
  triggerAudioRender,
  triggerDiscussionRun,
  type DiscussionDto,
  type DiscussionRunDto,
  type DiscussionRunEvidenceSnapshotDto,
  type DiscussionTurnDto
} from '../api/discussions';
import { useDiscussionStream } from '../hooks/useDiscussionStream';
import { useAppData } from '../context/AppDataContext';

const { Text, Paragraph } = Typography;

const FORMAT_COLORS: Record<string, string> = {
  free_form: 'blue',
  structured: 'purple',
  hosted: 'orange',
  hybrid: 'geekblue'
};

const SPEAKER_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

function TurnBubble({ turn, participantIndex, agentName }: { turn: DiscussionTurnDto; participantIndex: number; agentName: string }) {
  const color = SPEAKER_COLORS[participantIndex % SPEAKER_COLORS.length];
  // Alternate sides by participant index for a natural back-and-forth chat feel, instead of
  // every turn (regardless of speaker) always appearing flush-left in one undifferentiated
  // column - which is what made longer/denser turns look like one unreadable frame.
  const isReversed = participantIndex % 2 === 1;
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 16,
        flexDirection: isReversed ? 'row-reverse' : 'row'
      }}
    >
      <Avatar style={{ background: color, flexShrink: 0 }} size={32} icon={<UserOutlined />} />
      <Card
        size="small"
        style={{ maxWidth: '80%', background: `${color}12`, border: 'none' }}
        bodyStyle={{ padding: '8px 12px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <strong style={{ fontSize: 12, color }}>{agentName}</strong>
          {turn.segmentLabel && (
            <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
              {turn.segmentLabel}
            </Tag>
          )}
        </div>
        <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{turn.content}</Paragraph>
        {turn.audioUrl && (
          <audio src={turn.audioUrl} controls style={{ width: '100%', marginTop: 8, height: 28 }} />
        )}
      </Card>
    </div>
  );
}

function EvidencePanel({
  evidenceSnapshot,
  legacyAgenda,
  participantIndexMap
}: {
  /** The run's frozen evidence snapshot. Null for legacy runs created before snapshots
   * existed - in that case we fall back to the discussion's *current* description, since
   * no frozen agenda was ever recorded for that run. */
  evidenceSnapshot: DiscussionRunEvidenceSnapshotDto | null;
  legacyAgenda: string;
  participantIndexMap: Record<string, number>;
}) {
  const { t } = useTranslation();
  const agendaText = evidenceSnapshot ? evidenceSnapshot.agenda : legacyAgenda;

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Text strong>{t('studio.evidenceAgendaLabel')}: </Text>
        <Text>{agendaText || t('studio.evidenceNoAgenda')}</Text>
      </Card>
      {!evidenceSnapshot ? (
        <Text type="secondary">{t('studio.evidenceLegacyRun')}</Text>
      ) : (
        evidenceSnapshot.participants.map((p) => (
          <Card key={p.participantId} size="small" style={{ marginBottom: 12 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Space>
                <Avatar size={24} icon={<UserOutlined />} />
                <strong>
                  {t('studio.participants')} {(participantIndexMap[p.participantId] ?? 0) + 1}
                </strong>
                <Tag color={p.origin === 'explicit' ? 'blue' : 'default'}>
                  {p.origin === 'explicit' ? t('studio.evidenceOriginExplicit') : t('studio.evidenceOriginFallback')}
                </Tag>
              </Space>
              <div>
                <Text type="secondary">{t('studio.evidenceReportsLabel')}: </Text>
                {p.reportIds.map((id) => (
                  <Tag key={id}>{id}</Tag>
                ))}
              </div>
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
        ))
      )}
    </div>
  );
}

export function DiscussionDetail() {
  const { t } = useTranslation();
  const { discussionId } = useParams<{ discussionId: string }>();
  const navigate = useNavigate();
  const { agents } = useAppData();

  const [discussion, setDiscussion] = useState<DiscussionDto | null>(null);
  const [runs, setRuns] = useState<DiscussionRunDto[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [liveRun, setLiveRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [renderingAudio, setRenderingAudio] = useState(false);

  const { turns: liveTurns, status: liveStatus } = useDiscussionStream(discussionId ?? '', liveRun);

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
    setRenderingAudio(true);
    try {
      await triggerAudioRender(discussionId, selectedRunId);
      message.success(t('studio.audioRendering'));
    } catch {
      message.error('Audio render failed');
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

  const participantIndexMap = Object.fromEntries(discussion.participants.map((p, i) => [p.id, i]));
  const participantAgentNameMap = Object.fromEntries(
    discussion.participants.map((p) => [p.id, agents.find((a) => a.id === p.agentId)?.name ?? p.agentId])
  );
  const selectedRun = runs.find((r) => r.id === selectedRunId);
  const displayTurns: DiscussionTurnDto[] =
    liveRun && liveRun === selectedRunId ? liveTurns : selectedRun?.turns ?? [];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/studio')}
            style={{ marginBottom: 8, paddingLeft: 0 }}
          >
            {t('studio.title')}
          </Button>
          <h2 style={{ margin: 0 }}>
            <AudioOutlined style={{ marginRight: 8 }} />
            {discussion.name}
          </h2>
          <Space style={{ marginTop: 4 }}>
            <Tag color={FORMAT_COLORS[discussion.format] ?? 'default'}>{t(`studio.format_${discussion.format}`)}</Tag>
            <Tag color="default">{discussion.participants.length} {t('studio.participants')}</Tag>
          </Space>
        </div>
        <Space>
          <Button
            icon={<PlayCircleOutlined />}
            type="primary"
            loading={triggering}
            onClick={handleRunNow}
          >
            {runs.length === 0 ? t('studio.runNow') : t('studio.runAgain')}
          </Button>
          {selectedRunId && (
            <Button loading={renderingAudio} onClick={handleRenderAudio} icon={<AudioOutlined />}>
              {t('studio.renderAudio')}
            </Button>
          )}
        </Space>
      </div>

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
                  {liveStatus === 'running' && liveRun === selectedRunId && (
                    <div style={{ marginBottom: 12 }}>
                      <Spin size="small" style={{ marginRight: 8 }} />
                      <Text type="secondary">Generating…</Text>
                    </div>
                  )}
                  {displayTurns.length === 0 && !(liveStatus === 'running' && liveRun === selectedRunId) ? (
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
                    <List
                      dataSource={displayTurns}
                      renderItem={(turn) => (
                        <TurnBubble
                          key={turn.id}
                          turn={turn}
                          participantIndex={participantIndexMap[turn.participantId] ?? 0}
                          agentName={participantAgentNameMap[turn.participantId] ?? 'Agent'}
                        />
                      )}
                    />
                  )}
                </div>
              )
            },
            {
              key: 'audio',
              label: t('studio.audioPlayer'),
              children: selectedRun?.audioUrl ? (
                <audio src={selectedRun.audioUrl} controls style={{ width: '100%' }} />
              ) : (
                <Text type="secondary">No audio yet. Click &quot;{t('studio.renderAudio')}&quot; to generate a podcast.</Text>
              )
            },
            {
              key: 'evidence',
              label: t('studio.evidencePanel'),
              children: (
                <EvidencePanel
                  evidenceSnapshot={selectedRun?.evidenceSnapshot ?? null}
                  legacyAgenda={discussion.description}
                  participantIndexMap={participantIndexMap}
                />
              )
            }
          ]}
        />
      )}
    </div>
  );
}
