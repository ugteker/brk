import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, Form, Input, Modal, Popover, Segmented, Select, Spin, Tooltip, Typography, message } from 'antd';
import { PlusOutlined, EditOutlined, NotificationOutlined, ReadOutlined, SaveOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { useAppData } from '../../context/AppDataContext';
import { listAgentReports, type AgentSummary, type RunReportDto } from '../../api/agents';
import {
  listTranscriptOptions,
  type DiscussionCapabilities,
  type DiscussionDto,
  type DiscussionPreselect,
  type TranscriptOptionDto,
  type TtsProviderDto
} from '../../api/discussions';
import { cloneMarketplaceAgent, listMarketplaceAgents, type MarketplaceAgentListItem } from '../../api/marketplace';
import { AgentCurator, type CuratedAgent } from '../../components/AgentCurator';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { getCharacterTypeEmoji, getCharacterTypeIconBg } from '../../data/character-types';

const { Text } = Typography;

export type Format = 'free_form' | 'structured' | 'hosted' | 'hybrid';
export type Voice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export const VOICES: Voice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

/** Human-readable voice labels: the stored IDs are provider-neutral - the backend maps
 * them to OpenAI voices or Google Neural2 voices (EN/DE) depending on which TTS provider
 * is configured, so labels describe the voice character rather than a provider name. */
const VOICE_LABELS: Record<Voice, string> = {
  alloy: 'Alloy · neutral',
  echo: 'Echo · male',
  fable: 'Fable · warm',
  onyx: 'Onyx · deep male',
  nova: 'Nova · female',
  shimmer: 'Shimmer · bright female'
};

/** Mirrors the backend's Google voice mapping (google-tts-client.ts VOICE_MAP) so the picker
 * can show which actual Google voice a character maps to when Google renders the audio. */
const GOOGLE_VOICE_NAMES: Record<'en' | 'de', Record<Voice, string>> = {
  en: {
    alloy: 'en-US-Neural2-C',
    echo: 'en-US-Neural2-D',
    fable: 'en-US-Neural2-F',
    onyx: 'en-US-Neural2-J',
    nova: 'en-US-Neural2-E',
    shimmer: 'en-US-Neural2-G'
  },
  de: {
    alloy: 'de-DE-Neural2-C',
    echo: 'de-DE-Neural2-D',
    fable: 'de-DE-Neural2-F',
    onyx: 'de-DE-Neural2-B',
    nova: 'de-DE-Neural2-A',
    shimmer: 'de-DE-Neural2-C'
  }
};

export interface CastMember {
  agentId: string;
  role: 'speaker' | 'host';
  voiceId: Voice;
}

/** Everything the studio board configures for the next episode. */
export interface ShowDraft {
  name: string;
  format: Format;
  totalTurnTarget: number;
  turnLength: 'short' | 'medium' | 'long';
  language: 'en' | 'de';
  ttsProvider: TtsProviderDto;
  groundingMode: 'material' | 'free';
  reportIds: string[];
  transcriptIds: string[];
  agenda: string;
  cast: CastMember[];
}

export function emptyDraft(uiLanguage: string): ShowDraft {
  return {
    name: '',
    format: 'hosted',
    totalTurnTarget: 8,
    turnLength: 'long',
    language: uiLanguage.startsWith('de') ? 'de' : 'en',
    ttsProvider: 'auto',
    groundingMode: 'material',
    reportIds: [],
    transcriptIds: [],
    agenda: '',
    cast: []
  };
}

export function draftFromDiscussion(discussion: DiscussionDto): ShowDraft {
  const grounding = discussion.formatConfig.grounding;
  return {
    name: discussion.name,
    format: discussion.format,
    totalTurnTarget: discussion.formatConfig.totalTurnTarget ?? 12,
    turnLength: discussion.formatConfig.turnLength ?? 'medium',
    language: discussion.formatConfig.language ?? 'en',
    ttsProvider: discussion.formatConfig.ttsProvider ?? 'auto',
    groundingMode: grounding?.mode === 'free' ? 'free' : 'material',
    reportIds: grounding?.reportIds ?? [],
    transcriptIds: grounding?.artifactIds ?? [],
    agenda: discussion.description,
    cast: discussion.participants
      .filter((p) => p.active)
      .slice()
      .sort((a, b) => a.speakerOrder - b.speakerOrder)
      .map((p) => ({ agentId: p.agentId, role: p.role, voiceId: p.voiceId as Voice }))
  };
}

export function applyPreselect(draft: ShowDraft, preselect: DiscussionPreselect): ShowDraft {
  return {
    ...draft,
    groundingMode: 'material',
    reportIds: [...new Set(preselect.entries.flatMap((e) => e.reportIds))],
    cast: preselect.entries.map((e, i) => ({
      agentId: e.agentId,
      role: (draft.format === 'hosted' && i === 0 ? 'host' : 'speaker') as 'host' | 'speaker',
      voiceId: VOICES[i % VOICES.length]
    }))
  };
}

type PresetKey = 'debate' | 'explainer' | 'interview' | 'deepdive';

const PRESETS: Record<PresetKey, { emoji: string; format: Format; turns: number; length: 'short' | 'medium' | 'long' }> = {
  debate: { emoji: '⚔️', format: 'free_form', turns: 12, length: 'medium' },
  explainer: { emoji: '💡', format: 'hosted', turns: 8, length: 'long' },
  interview: { emoji: '🎤', format: 'hosted', turns: 10, length: 'medium' },
  deepdive: { emoji: '🌊', format: 'structured', turns: 16, length: 'long' }
};

function activePreset(draft: ShowDraft): PresetKey | null {
  for (const [key, p] of Object.entries(PRESETS) as Array<[PresetKey, (typeof PRESETS)[PresetKey]]>) {
    if (p.format === draft.format && p.turns === draft.totalTurnTarget && p.length === draft.turnLength) return key;
  }
  return null;
}

function AgentAvatar({ agent, size = 'h-12 w-12 text-xl' }: { agent: AgentSummary | undefined; size?: string }) {
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full ${getCharacterTypeIconBg(agent?.characterType ?? null)}`}>
      {getCharacterTypeEmoji(agent?.characterType ?? null)}
    </div>
  );
}

/** Modal that adds a guest to the stage: pick one of your agents, clone a public one, or
 * build a new agent with the curator. Cloning happens immediately on pick, mirroring the
 * wizard's rule that a discussion can only reference agents the user owns. */
function AgentPickerModal({
  open,
  cast,
  onPick,
  onClose
}: {
  open: boolean;
  cast: CastMember[];
  onPick: (agentId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { agents, refreshAgents } = useAppData();
  const { user } = useAuth();
  const [publicAgents, setPublicAgents] = useState<MarketplaceAgentListItem[]>([]);
  const [publicLoaded, setPublicLoaded] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [showCurator, setShowCurator] = useState(false);

  useEffect(() => {
    if (!open || publicLoaded) return;
    listMarketplaceAgents()
      .then(setPublicAgents)
      .catch(() => {})
      .finally(() => setPublicLoaded(true));
  }, [open, publicLoaded]);

  const castIds = new Set(cast.map((m) => m.agentId));
  // Admin accounts see every agent platform-wide via GET /api/agents - narrow to owned.
  const ownedAgents = agents.filter((a) => a.ownerUserId === user?.id && !castIds.has(a.id));
  const ownedIds = new Set(agents.filter((a) => a.ownerUserId === user?.id).map((a) => a.id));
  const visiblePublic = publicAgents.filter((item) => !ownedIds.has(item.agent.id));

  async function pickPublic(item: MarketplaceAgentListItem) {
    setCloningId(item.publicationId);
    try {
      const result = await cloneMarketplaceAgent(item.publicationId);
      await refreshAgents();
      onPick(result.agent.id);
    } catch (err) {
      message.error(err instanceof Error ? err.message : t('studio.cloningAgents'));
    } finally {
      setCloningId(null);
    }
  }

  async function completeCuration(agent: CuratedAgent) {
    await refreshAgents();
    setShowCurator(false);
    onPick(agent.id);
  }

  return (
    <Modal
      open={open}
      onCancel={() => { setShowCurator(false); onClose(); }}
      footer={null}
      title={showCurator ? t('studio.buildAgent') : t('studio.castPickerTitle')}
      width={showCurator ? 700 : 520}
      destroyOnHidden
    >
      {showCurator ? (
        <AgentCurator
          mode="create"
          onCancel={() => setShowCurator(false)}
          onComplete={(agent) => void completeCuration(agent)}
        />
      ) : (
        <div className="space-y-4">
          {ownedAgents.length > 0 && (
            <div className="space-y-2">
              <Text type="secondary">{t('studio.castYourAgents')}</Text>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ownedAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className="studio-cast-option"
                    onClick={() => onPick(agent.id)}
                  >
                    <AgentAvatar agent={agent} size="h-9 w-9 text-base" />
                    <span className="min-w-0 truncate font-medium">{getAgentDisplayLabel(agent)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Text type="secondary">{t('studio.publicAgents')}</Text>
            {!publicLoaded ? (
              <Spin size="small" />
            ) : visiblePublic.length === 0 ? (
              <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>—</Text>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visiblePublic.map((item) => (
                  <button
                    key={item.publicationId}
                    type="button"
                    className="studio-cast-option"
                    disabled={cloningId !== null}
                    onClick={() => void pickPublic(item)}
                  >
                    {cloningId === item.publicationId ? <Spin size="small" /> : <AgentAvatar agent={undefined} size="h-9 w-9 text-base" />}
                    <span className="min-w-0 truncate font-medium">{item.agent.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button icon={<PlusOutlined />} onClick={() => setShowCurator(true)}>
            {t('studio.buildAgent')}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** The participant stage in casting mode: occupied chairs open a voice/role popover, the
 * dashed empty chair opens the agent picker. Live runs render the read-only StudioPanel
 * in DiscussionDetail instead. */
export function CastingStage({
  cast,
  onChange,
  effectiveTtsProvider,
  language
}: {
  cast: CastMember[];
  onChange: (cast: CastMember[]) => void;
  effectiveTtsProvider: 'google' | 'openai' | null;
  language: 'en' | 'de';
}) {
  const { t } = useTranslation();
  const { agents } = useAppData();
  const [pickerOpen, setPickerOpen] = useState(false);

  function update(index: number, patch: Partial<CastMember>) {
    onChange(cast.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function voiceOptions() {
    return VOICES.map((voice) => ({
      value: voice,
      label: effectiveTtsProvider === 'google' ? `${VOICE_LABELS[voice]} · ${GOOGLE_VOICE_NAMES[language][voice]}` : VOICE_LABELS[voice]
    }));
  }

  return (
    <div className="studio-participant-stage studio-casting-stage">
      {cast.map((member, index) => {
        const agent = agents.find((a) => a.id === member.agentId);
        return (
          <Popover
            key={member.agentId}
            trigger="click"
            content={
              <div className="studio-chair-pop">
                <Form layout="vertical" size="small">
                  <Form.Item label={t('studio.voiceLabel')} style={{ marginBottom: 8 }}>
                    <Select
                      value={member.voiceId}
                      onChange={(v) => update(index, { voiceId: v as Voice })}
                      options={voiceOptions()}
                      style={{ width: 210 }}
                    />
                  </Form.Item>
                  <Form.Item label={t('studio.roleLabel')} style={{ marginBottom: 8 }}>
                    <Select
                      value={member.role}
                      onChange={(v) => update(index, { role: v as 'speaker' | 'host' })}
                      options={[
                        { value: 'speaker', label: t('studio.roleSpeaker') },
                        { value: 'host', label: t('studio.roleHost') }
                      ]}
                      style={{ width: 210 }}
                    />
                  </Form.Item>
                </Form>
                <Button danger type="text" size="small" onClick={() => onChange(cast.filter((_, i) => i !== index))}>
                  {t('studio.removeFromStage')}
                </Button>
              </div>
            }
          >
            <button type="button" className="studio-chair" aria-label={agent ? getAgentDisplayLabel(agent) : member.agentId}>
              {member.role === 'host' && <span className="studio-chair-role">{t('studio.roleHost')}</span>}
              <AgentAvatar agent={agent} />
              <Text style={{ fontSize: 11, fontWeight: 600, maxWidth: 84 }} ellipsis>
                {agent ? getAgentDisplayLabel(agent) : member.agentId}
              </Text>
              <span className="studio-chair-voice">{VOICE_LABELS[member.voiceId].split(' ·')[0]}</span>
            </button>
          </Popover>
        );
      })}
      <button type="button" className="studio-chair studio-chair-empty" onClick={() => setPickerOpen(true)}>
        <span className="studio-chair-seat"><PlusOutlined /></span>
        <Text type="secondary" style={{ fontSize: 11 }}>{t('studio.inviteGuest')}</Text>
      </button>
      <AgentPickerModal
        open={pickerOpen}
        cast={cast}
        onClose={() => setPickerOpen(false)}
        onPick={(agentId) => {
          onChange([
            ...cast,
            { agentId, role: cast.length === 0 ? 'host' : 'speaker', voiceId: VOICES[cast.length % VOICES.length] }
          ]);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

/** Lazily loads the shared material pool (any agent's reports + downloaded transcripts)
 * the first time the modal opens. */
function MaterialModal({
  open,
  reportIds,
  transcriptIds,
  onApply,
  onClose
}: {
  open: boolean;
  reportIds: string[];
  transcriptIds: string[];
  onApply: (reportIds: string[], transcriptIds: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { agents } = useAppData();
  const [allReports, setAllReports] = useState<Array<RunReportDto & { agentName: string }>>([]);
  const [transcriptOptions, setTranscriptOptions] = useState<TranscriptOptionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draftReports, setDraftReports] = useState<string[]>(reportIds);
  const [draftTranscripts, setDraftTranscripts] = useState<string[]>(transcriptIds);

  useEffect(() => {
    if (!open) return;
    setDraftReports(reportIds);
    setDraftTranscripts(transcriptIds);
    if (loaded || loading) return;
    setLoading(true);
    Promise.all([
      Promise.all(
        agents.map(async (agent) => {
          try {
            const reports = await listAgentReports(agent.id);
            return reports.map((r) => ({ ...r, agentName: getAgentDisplayLabel(agent) }));
          } catch {
            return [];
          }
        })
      ),
      listTranscriptOptions().catch(() => [] as TranscriptOptionDto[])
    ])
      .then(([nested, transcripts]) => {
        setAllReports(nested.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setTranscriptOptions(transcripts);
        setLoaded(true);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      title={t('studio.materialModalTitle')}
      onCancel={onClose}
      onOk={() => { onApply(draftReports, draftTranscripts); onClose(); }}
      okText={t('common.save')}
      destroyOnHidden={false}
    >
      <Form layout="vertical">
        <Form.Item label={t('studio.materialReportsLabel')}>
          <Select
            mode="multiple"
            allowClear
            value={draftReports}
            onChange={setDraftReports}
            loading={loading}
            placeholder={t('studio.reportPickerPlaceholder')}
            notFoundContent={loading ? t('studio.reportPickerLoading') : t('studio.reportPickerEmpty')}
            optionFilterProp="label"
            options={allReports.map((report) => ({
              value: report.id,
              label: `${report.agentName} · ${new Date(report.createdAt).toLocaleDateString()} — ${report.summary.slice(0, 80)}`
            }))}
          />
        </Form.Item>
        <Form.Item label={t('studio.materialTranscriptsLabel')}>
          <Select
            mode="multiple"
            allowClear
            value={draftTranscripts}
            onChange={setDraftTranscripts}
            loading={loading}
            placeholder={t('studio.transcriptPickerPlaceholder')}
            notFoundContent={loading ? t('studio.transcriptPickerLoading') : t('studio.transcriptPickerEmpty')}
            optionLabelProp="label"
            options={transcriptOptions.map((option) => ({
              value: option.artifactId,
              label: option.title,
              desc: option.preview
            }))}
            optionRender={(option) => (
              <div>
                <div style={{ fontWeight: 500 }}>{option.data.label}</div>
                <div style={{ color: '#888', fontSize: 12, whiteSpace: 'normal' }}>{option.data.desc}</div>
              </div>
            )}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export interface StudioBoardProps {
  draft: ShowDraft;
  onChange: (patch: Partial<ShowDraft>) => void;
  capabilities: DiscussionCapabilities;
  /** create = new show (material editable, GO LIVE). edit = existing show via the console
   * drawer (material locked like the old wizard's edit mode, save applies immediately). */
  mode: 'create' | 'edit';
  submitting?: boolean;
  onGoLive?: () => void;
  onSave?: () => void;
  preselectLabel?: string | null;
  onClearPreselect?: () => void;
}

export function StudioBoard({
  draft,
  onChange,
  capabilities,
  mode,
  submitting,
  onGoLive,
  onSave,
  preselectLabel,
  onClearPreselect
}: StudioBoardProps) {
  const { t } = useTranslation();
  const [materialOpen, setMaterialOpen] = useState(false);
  const preset = activePreset(draft);

  const blocker = useMemo(() => {
    if (draft.cast.length < 2) return t('studio.boardNeedCast');
    if (draft.groundingMode === 'free' && !draft.agenda.trim()) return t('studio.boardNeedQuestion');
    if (draft.groundingMode === 'material' && draft.reportIds.length + draft.transcriptIds.length === 0) {
      return t('studio.boardNeedMaterial');
    }
    return null;
  }, [draft, t]);

  return (
    <div className="studio-board">
      {mode === 'create' && preselectLabel && (
        <Alert
          type="info"
          showIcon
          message={t('studio.preselectBanner', { context: preselectLabel })}
          action={
            <Button size="small" type="text" onClick={onClearPreselect}>
              {t('studio.startFromScratch')}
            </Button>
          }
        />
      )}

      <div className="studio-board-row">
        <Input
          className="studio-board-name"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t('studio.discussionNamePlaceholder')}
          suffix={<EditOutlined style={{ opacity: 0.45 }} />}
        />
        <Segmented
          value={draft.language}
          onChange={(v) => onChange({ language: v as 'en' | 'de' })}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'de', label: 'DE' }
          ]}
        />
      </div>

      <div>
        <div className="studio-board-section-title">
          <NotificationOutlined />
          {t('studio.boardFormatTitle')}
        </div>
        <div className="studio-board-presets">
          {(Object.entries(PRESETS) as Array<[PresetKey, (typeof PRESETS)[PresetKey]]>).map(([key, p]) => (
            <button
              key={key}
              type="button"
              className={`studio-preset ${preset === key ? 'studio-preset-selected' : ''}`}
              onClick={() => onChange({ format: p.format, totalTurnTarget: p.turns, turnLength: p.length })}
            >
              <span className="studio-preset-emoji" aria-hidden="true">{p.emoji}</span>
              <b>{t(`studio.preset_${key}`)}</b>
              <span>{t(`studio.preset_${key}_desc`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="studio-board-section-title">
          <ReadOutlined />
          {t('studio.boardTopicTitle')}
        </div>
        {mode === 'edit' ? (
          <Alert
            type="info"
            showIcon
            message={t('studio.materialLocked')}
            description={
              draft.groundingMode === 'free'
                ? draft.agenda
                : t('studio.materialSummary', { reports: draft.reportIds.length, transcripts: draft.transcriptIds.length })
            }
          />
        ) : (
          <>
            <Segmented
              value={draft.groundingMode}
              onChange={(v) => onChange({ groundingMode: v as 'material' | 'free' })}
              options={[
                { value: 'material', label: `📚 ${t('studio.sourceMaterial')}` },
                { value: 'free', label: `💬 ${t('studio.sourceFree')}` }
              ]}
              style={{ marginBottom: 10 }}
            />
            {draft.groundingMode === 'material' ? (
              <>
                <div className="studio-board-material">
                  <div className="studio-board-material-summary">
                    {t('studio.materialCount', { reports: draft.reportIds.length, transcripts: draft.transcriptIds.length })}
                  </div>
                  <Button onClick={() => setMaterialOpen(true)}>{t('studio.chooseMaterial')}</Button>
                </div>
                <Input.TextArea
                  value={draft.agenda}
                  onChange={(e) => onChange({ agenda: e.target.value })}
                  placeholder={t('studio.agendaPlaceholder')}
                  rows={2}
                  style={{ marginTop: 10 }}
                />
              </>
            ) : (
              <Input.TextArea
                value={draft.agenda}
                onChange={(e) => onChange({ agenda: e.target.value })}
                placeholder={t('studio.freeQuestionPlaceholder')}
                rows={3}
              />
            )}
          </>
        )}
      </div>

      <Collapse
        ghost
        items={[
          {
            key: 'fine',
            label: t('studio.boardFineTuning', {
              turns: draft.totalTurnTarget,
              length: t(`studio.turnLength${draft.turnLength[0].toUpperCase()}${draft.turnLength.slice(1)}`),
              format: t(`studio.format_${draft.format}`)
            }),
            children: (
              <Form layout="vertical">
                <Form.Item label={t('studio.totalTurnsLabel')}>
                  <Select
                    value={draft.totalTurnTarget}
                    onChange={(v) => onChange({ totalTurnTarget: v })}
                    options={[6, 8, 10, 12, 16, 20].map((n) => ({ value: n, label: t('studio.turnsCount', { count: n }) }))}
                  />
                </Form.Item>
                <Form.Item label={t('studio.turnLengthLabel')}>
                  <Select
                    value={draft.turnLength}
                    onChange={(v) => onChange({ turnLength: v as ShowDraft['turnLength'] })}
                    options={[
                      { value: 'short', label: t('studio.turnLengthShort') },
                      { value: 'medium', label: t('studio.turnLengthMedium') },
                      { value: 'long', label: t('studio.turnLengthLong') }
                    ]}
                  />
                </Form.Item>
                <Form.Item label={t('studio.formatLabel')}>
                  <Select
                    value={draft.format}
                    onChange={(v) => onChange({ format: v as Format })}
                    options={(['free_form', 'structured', 'hosted', 'hybrid'] as Format[]).map((f) => ({
                      value: f,
                      label: t(`studio.format_${f}`)
                    }))}
                  />
                </Form.Item>
                {capabilities.ttsProviders.length > 1 && (
                  <Form.Item label={t('studio.voiceApiLabel')} extra={t('studio.voiceApiHint')}>
                    <Select
                      value={draft.ttsProvider}
                      onChange={(v) => onChange({ ttsProvider: v as TtsProviderDto })}
                      options={[
                        { value: 'auto', label: t('studio.voiceApiAuto') },
                        ...capabilities.ttsProviders.map((provider) => ({
                          value: provider,
                          label: provider === 'google' ? t('studio.voiceApiGoogle') : t('studio.voiceApiOpenai')
                        }))
                      ]}
                    />
                  </Form.Item>
                )}
              </Form>
            )
          }
        ]}
      />

      {mode === 'create' ? (
        <div className="studio-board-golive-row">
          <Tooltip title={blocker}>
            <Button
              type="primary"
              size="large"
              className="studio-board-golive"
              icon={<NotificationOutlined />}
              loading={submitting}
              disabled={Boolean(blocker)}
              onClick={onGoLive}
            >
              {t('studio.goLive')}
            </Button>
          </Tooltip>
          <Button type="text" disabled={Boolean(blocker) || submitting} onClick={onSave}>
            {t('studio.saveWithoutStart')}
          </Button>
        </div>
      ) : (
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={onSave} block>
          {t('studio.saveDiscussion')}
        </Button>
      )}

      <MaterialModal
        open={materialOpen}
        reportIds={draft.reportIds}
        transcriptIds={draft.transcriptIds}
        onApply={(reportIds, transcriptIds) => onChange({ reportIds, transcriptIds })}
        onClose={() => setMaterialOpen(false)}
      />
    </div>
  );
}
