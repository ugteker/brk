import type { Dispatch, SetStateAction } from 'react';
import { Badge, Button, Card, Empty, Input, Modal, Progress, Select, Steps, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioMutedOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MailOutlined,
  RobotFilled,
  RobotOutlined,
  ToolOutlined
} from '@ant-design/icons';
import type { AgentSummary } from '../../../api/agents';
import type { PlaybookRecord } from '../../../api/playbooks';
import type { SourceRecord } from '../../../api/sources';
import { AgentCurator, type CuratedAgent } from '../../../components/AgentCurator';
import { AgentSelectionView } from '../../../components/agent-selection/AgentSelectionView';
import { GhostCreateCard } from '../../../components/library/GhostCreateCard';
import { InlineDeleteButton } from '../../../components/InlineDeleteButton';
import { getCharacterTypeColor } from '../../../data/character-types';
import { getPromptCharacter, getPromptCharactersForPersona, getPromptPersona, PROMPT_PERSONAS } from '../../../data/prompt-personas';
import { getAgentDisplayLabel } from '../../../utils/agent-label';
import {
  SourceTypeBadge,
  WizardSelectableCard,
  formatPlaybookSchedule,
  getAgentCardDisplay,
  getSourceCoverImageUrl,
  getSourceDisplayTitle,
  PERSONA_ICON_BG_MAP
} from '../helpers';
import { TIMEZONE_OPTIONS } from '../types';
import type { ScheduleDraft } from './ScheduleEditModal';

const { Text } = Typography;

type HubUser = { id?: string | null; email?: string | null } | null | undefined;

interface FollowWizardModalProps {
  open: boolean;
  sources: SourceRecord[];
  agents: AgentSummary[];
  playbooks: PlaybookRecord[];
  user: HubUser;
  scheduleDraft: ScheduleDraft;
  followWizardSourcePreselected: boolean;
  playbookSourceIdDraft: string | null;
  setPlaybookSourceIdDraft: (id: string) => void;
  editingPlaybookId: string | null;
  playbookCreateStep: number;
  playbookAgentIdsDraft: string[];
  setPlaybookAgentIdsDraft: Dispatch<SetStateAction<string[]>>;
  wizardFocusedAgentId: string | null;
  wizardAlreadyLinkedPlaybooks: { agentId: string; playbookId: string }[];
  setWizardAlreadyLinkedAgentIds: Dispatch<SetStateAction<string[]>>;
  setWizardAlreadyLinkedPlaybooks: Dispatch<SetStateAction<{ agentId: string; playbookId: string }[]>>;
  wizardShowAdvanced: boolean;
  setWizardShowAdvanced: Dispatch<SetStateAction<boolean>>;
  showInlineAgentCreate: boolean;
  setShowInlineAgentCreate: Dispatch<SetStateAction<boolean>>;
  inlineAgentCurating: boolean;
  setInlineAgentCurating: Dispatch<SetStateAction<boolean>>;
  inlineCurationBaseAgentVersionId: string | null;
  inlineAgentStep: number;
  inlineAgentPersonaId: string;
  inlineAgentCharacterId: string;
  inlineAgentModel: string;
  setInlineAgentModel: Dispatch<SetStateAction<string>>;
  inlineAgentSystemPrompt: string;
  setInlineAgentSystemPrompt: Dispatch<SetStateAction<string>>;
  inlineAgentRiskLevel: 'low' | 'medium' | 'high';
  setInlineAgentRiskLevel: Dispatch<SetStateAction<'low' | 'medium' | 'high'>>;
  inlineAgentReportDetailLevel: 'brief' | 'standard' | 'detailed';
  setInlineAgentReportDetailLevel: Dispatch<SetStateAction<'brief' | 'standard' | 'detailed'>>;
  inlineAgentValidationError: string | null;
  isInlineAgentSaving: boolean;
  isPlaybookSaving: boolean;
  confirmingUnfollow: boolean;
  setConfirmingUnfollow: Dispatch<SetStateAction<boolean>>;
  setAgents: Dispatch<SetStateAction<AgentSummary[]>>;
  onCancelPlaybookCreate: () => void;
  handleAgentSelectionConnected: (playbook: PlaybookRecord) => void | Promise<void>;
  openInlineAgentCuration: (baseAgentVersionId?: string) => void;
  onInlineAgentCurated: (agent: CuratedAgent) => void | Promise<void>;
  onInlineAgentPersonaChange: (personaId: string) => void;
  onInlineAgentCharacterChange: (characterId: string) => void;
  onInlineAgentBack: () => void;
  onInlineAgentNext: () => void;
  onSaveInlineAgent: () => void | Promise<void>;
  onNextPlaybookCreateStep: () => void;
  onBackPlaybookCreateStep: () => void;
  onCreatePlaybook: () => void | Promise<void>;
  onUnfollowFromWizard: () => void | Promise<void>;
  getSourceKindLabel: (source: SourceRecord) => string;
  getSourceEpisodeCount: (source: SourceRecord) => number;
}

export function FollowWizardModal({
  open,
  sources,
  agents,
  playbooks,
  user,
  scheduleDraft,
  followWizardSourcePreselected,
  playbookSourceIdDraft,
  setPlaybookSourceIdDraft,
  editingPlaybookId,
  playbookCreateStep,
  playbookAgentIdsDraft,
  setPlaybookAgentIdsDraft,
  wizardFocusedAgentId,
  wizardAlreadyLinkedPlaybooks,
  setWizardAlreadyLinkedAgentIds,
  setWizardAlreadyLinkedPlaybooks,
  wizardShowAdvanced,
  setWizardShowAdvanced,
  showInlineAgentCreate,
  setShowInlineAgentCreate,
  inlineAgentCurating,
  setInlineAgentCurating,
  inlineCurationBaseAgentVersionId,
  inlineAgentStep,
  inlineAgentPersonaId,
  inlineAgentCharacterId,
  inlineAgentModel,
  setInlineAgentModel,
  inlineAgentSystemPrompt,
  setInlineAgentSystemPrompt,
  inlineAgentRiskLevel,
  setInlineAgentRiskLevel,
  inlineAgentReportDetailLevel,
  setInlineAgentReportDetailLevel,
  inlineAgentValidationError,
  isInlineAgentSaving,
  isPlaybookSaving,
  confirmingUnfollow,
  setConfirmingUnfollow,
  setAgents,
  onCancelPlaybookCreate,
  handleAgentSelectionConnected,
  openInlineAgentCuration,
  onInlineAgentCurated,
  onInlineAgentPersonaChange,
  onInlineAgentCharacterChange,
  onInlineAgentBack,
  onInlineAgentNext,
  onSaveInlineAgent,
  onNextPlaybookCreateStep,
  onBackPlaybookCreateStep,
  onCreatePlaybook,
  onUnfollowFromWizard,
  getSourceKindLabel,
  getSourceEpisodeCount
}: FollowWizardModalProps) {
  const { t } = useTranslation();
  return (
      <Modal
        title={(() => {
          if (followWizardSourcePreselected) {
            const src = sources.find((s) => s.id === playbookSourceIdDraft);
            const srcTitle = src ? getSourceDisplayTitle(src) : null;
            return editingPlaybookId
              ? t('listen.dialogTitleEdit', { title: srcTitle ?? t('listen.thisSource') })
              : t('listen.dialogTitleNew', { title: srcTitle ?? t('listen.thisSource') });
          }
          return editingPlaybookId ? t('listen.dialogTitleGenericEdit') : t('listen.dialogTitleGenericNew');
        })()}
        open={open}
        onCancel={onCancelPlaybookCreate}
        footer={null}
        destroyOnHidden
        width="min(720px, 95vw)"
        className="follow-source-modal mobile-fullscreen-modal"
        styles={{ body: { maxHeight: 'calc(100dvh - 9rem)', overflowX: 'hidden', overflowY: 'auto' } }}
      >
        {followWizardSourcePreselected && !showInlineAgentCreate ? (
          inlineAgentCurating ? (() => {
            const inlineCurationSource = sources.find((s) => s.id === playbookSourceIdDraft);
            return (
              <AgentCurator
                mode="create"
                baseAgentVersionId={inlineCurationBaseAgentVersionId}
                sourceContext={inlineCurationSource ? {
                  title: getSourceDisplayTitle(inlineCurationSource),
                  type: inlineCurationSource.type,
                  url: inlineCurationSource.value,
                  value: inlineCurationSource.value
                } : undefined}
                onCancel={() => setInlineAgentCurating(false)}
                onComplete={(agent) => void onInlineAgentCurated(agent)}
              />
            );
          })() : (
            <AgentSelectionView
              source={sources.find((s) => s.id === playbookSourceIdDraft) ?? null}
              ownedAgents={agents.filter((agent) => agent.ownerUserId === user?.id)}
              onAgentConnected={handleAgentSelectionConnected}
              onCurate={openInlineAgentCuration}
            />
          )
        ) : (
        <div className="space-y-3">
          {/* Unified steps indicator — morphs between pick-agent path and create-agent path */}
          {showInlineAgentCreate ? (
            <Steps
                size="small"
                labelPlacement="vertical"
                current={inlineAgentStep}
                items={[
                  { title: t('agent.stepCharacter') },
                  { title: t('agent.stepPersonality') },
                  { title: t('agent.stepSchedule') }
                ]}
                className="hidden sm:flex"
              />
          ) : (
            <Steps
              size="small"
              labelPlacement="vertical"
              current={followWizardSourcePreselected ? playbookCreateStep - 1 : playbookCreateStep}
              items={[
                ...(followWizardSourcePreselected ? [] : [{ title: t('listen.stepPickSource') }]),
                { title: t('listen.stepChooseAgent') },
                { title: t('listen.stepSetSchedule') }
              ]}
              className="hidden sm:flex"
            />
          )}
          <Progress
            data-testid="follow-wizard-mobile-progress"
            percent={
              showInlineAgentCreate
                ? ((inlineAgentStep + 1) / 3) * 100
                : followWizardSourcePreselected
                  ? playbookCreateStep === 1 ? 50 : 100
                  : ((playbookCreateStep + 1) / 3) * 100
            }
            showInfo={false}
            size="small"
            className="sm:hidden"
          />
          {/* Step 1 subtitle — shown when picking an agent (not inside sub-wizard) */}
          {playbookCreateStep === 1 && !showInlineAgentCreate ? (
            <p className="text-sm text-gray-500">
              {t('listen.stepSubtitle')}
            </p>
          ) : null}
          {playbookCreateStep === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {sources.map((source) => {
                const selected = playbookSourceIdDraft === source.id;

                return (
                  <WizardSelectableCard
                    key={source.id}
                    ariaLabel={`Select source ${getSourceDisplayTitle(source)}`}
                    selected={selected}
                    onClick={() => setPlaybookSourceIdDraft(source.id)}
                  >
                    <div className="grid grid-cols-[56px_1fr] gap-3">
                      {getSourceCoverImageUrl(source) ? (
                        <img
                          src={getSourceCoverImageUrl(source)!}
                          alt={`${getSourceDisplayTitle(source)} cover`}
                          className="h-14 w-14 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-[10px] text-gray-500">
                          {t('library.coverUnavailable')}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold">{getSourceDisplayTitle(source)}</div>
                          {selected ? <Tag color="purple">{t('common.selected')}</Tag> : null}
                        </div>
                        <Text type="secondary" className="text-xs">
                          {source.value}
                        </Text>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          <SourceTypeBadge type={source.type} />
                          <Tag>{getSourceKindLabel(source)}</Tag>
                          {(source.type === 'podcast_feeds' || source.type === 'youtube_videos') ? (
                            <Tag color="purple">{t('library.episodes', { count: getSourceEpisodeCount(source) })}</Tag>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
                      {source.metadata.previewItems.length > 0 ? (
                        <>
                          <div className="mb-1 font-medium">
                            {selected ? t('library.episodesPreview') : t('library.recentEpisodes')}
                          </div>
                          <ul className="list-inside list-disc space-y-1">
                            {(selected ? source.metadata.previewItems : source.metadata.previewItems.slice(0, 3)).map((item) => (
                              <li key={`${source.id}:${item.link ?? item.title}`}>{item.title}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        t('library.noEpisodes')
                      )}
                    </div>
                  </WizardSelectableCard>
                );
              })}
              {sources.length === 0 ? <Empty description="No sources available." /> : null}
            </div>
          ) : null}
          {playbookCreateStep === 1 ? (
            <>
            <div className="space-y-3">
              {/* Hide agent selection grid when the inline creation sub-wizard or AI curation is active */}
              {!showInlineAgentCreate && !inlineAgentCurating ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {agents.map((agent) => {
                  const selected = playbookAgentIdsDraft.includes(agent.id);
                  const anySelected = playbookAgentIdsDraft.length > 0;
                  const isFocused = wizardFocusedAgentId === agent.id;
                  const { intro, icon, characterLabel, personalityLabel, personaId } = getAgentCardDisplay(agent, t);
                  const iconBgClass = PERSONA_ICON_BG_MAP[personaId] ?? PERSONA_ICON_BG_MAP['summarizer'];
                  const tagColor = getCharacterTypeColor(personaId);

                  const linkedPlaybookEntry = wizardAlreadyLinkedPlaybooks.find((p) => p.agentId === agent.id);
                  // If this agent is already linked to the current source, show that playbook's schedule.
                  // Otherwise fall back to any playbook the agent owns (as a hint of their typical schedule).
                  const linkedPlaybook = linkedPlaybookEntry
                    ? playbooks.find((p) => p.id === linkedPlaybookEntry.playbookId)
                    : playbooks.find((p) => p.agentId === agent.id);
                  const linkedToThisSource = Boolean(linkedPlaybookEntry);

                  return (
                    <div
                      key={agent.id}
                      className={`transition-opacity ${anySelected && !selected ? 'opacity-40' : 'opacity-100'}`}
                    >
                    <WizardSelectableCard
                      ariaLabel={`Select agent ${getAgentDisplayLabel(agent)}`}
                      selected={selected}
                      onClick={() => {
                        // Always toggle — works in both create and edit modes
                        setPlaybookAgentIdsDraft((prev) =>
                          prev.includes(agent.id) ? prev.filter((id) => id !== agent.id) : [...prev, agent.id]
                        );
                        setShowInlineAgentCreate(false);
                      }}
                    >
                      {/* Row 1: icon pill + agent name + controls */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-start gap-2">
                          <span className={`shrink-0 rounded-md p-1.5 text-base leading-none ${iconBgClass}`}>
                            {icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <Badge status={agent.status === 'disabled' ? 'default' : 'success'} className="mr-1 align-top" />
                            <span className="break-words text-sm font-semibold">{getAgentDisplayLabel(agent)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isFocused ? (
                            <Tag color="purple" className="m-0 text-xs">{t('common.editing') || 'Editing'}</Tag>
                          ) : (
                            <InlineDeleteButton
                                ariaLabel={`Delete agent ${getAgentDisplayLabel(agent)}`}
                                confirmText={t('common.delete')}
                                onConfirm={async () => {
                                  setPlaybookAgentIdsDraft((prev) => prev.filter((id) => id !== agent.id));
                                  setWizardAlreadyLinkedAgentIds((prev) => prev.filter((id) => id !== agent.id));
                                  setWizardAlreadyLinkedPlaybooks((prev) => prev.filter((p) => p.agentId !== agent.id));
                                  setAgents((prev) => prev.filter((candidate) => candidate.id !== agent.id));
                                }}
                              />
                          )}
                        </div>
                      </div>
                      {/* Row 2: character + personality identity tags */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Tag color={tagColor}>{characterLabel}</Tag>
                        <Tag color="magenta">{personalityLabel}</Tag>
                      </div>
                      {/* Row 3: greeting intro — quoted and italic */}
                      <p className="mt-2 text-xs italic text-gray-500 dark:text-gray-400 leading-relaxed">
                        &ldquo;{intro}&rdquo;
                      </p>
                      {/* Row 4: schedule + recipients — current source if linked, otherwise from agent's other playbooks as a hint */}
                      {linkedPlaybook && (
                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                          {!linkedToThisSource && (
                            <span className="w-full text-gray-300 dark:text-gray-600 italic">{t('playbook.scheduleHint') || 'typical:'}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <ClockCircleOutlined />
                            {formatPlaybookSchedule(linkedPlaybook.schedule)}
                          </span>
                          {linkedPlaybook.recipients.length > 0 && (
                            <span className="flex items-center gap-1">
                              <MailOutlined />
                              {linkedPlaybook.recipients.slice(0, 2).join(', ')}
                              {linkedPlaybook.recipients.length > 2 && ` +${linkedPlaybook.recipients.length - 2}`}
                            </span>
                          )}
                        </div>
                      )}
                    </WizardSelectableCard>
                    </div>
                  );
                })}
                {/* "Create new agent" ghost card — AI curation */}
                <GhostCreateCard
                  ariaLabel="Curate with AI"
                  onClick={openInlineAgentCuration}
                  icon={<RobotOutlined />}
                  title="Curate with AI"
                  sub="Describe the agent you want — AI drafts it with you"
                />
              </div>
              ) : null}
              {inlineAgentCurating ? (() => {
                const inlineCurationSource = sources.find((s) => s.id === playbookSourceIdDraft);
                return (
                  <AgentCurator
                    mode="create"
                    sourceContext={inlineCurationSource ? {
                      title: getSourceDisplayTitle(inlineCurationSource),
                      type: inlineCurationSource.type,
                      url: inlineCurationSource.value,
                      value: inlineCurationSource.value
                    } : undefined}
                    onCancel={() => setInlineAgentCurating(false)}
                    onComplete={(agent) => void onInlineAgentCurated(agent)}
                  />
                );
              })() : null}
              {showInlineAgentCreate ? (() => {
                const inlinePersonaData = getPromptPersona(inlineAgentPersonaId);
                const inlineChars = getPromptCharactersForPersona(inlineAgentPersonaId);
                const inlineCharData = getPromptCharacter(inlineAgentPersonaId, inlineAgentCharacterId) ?? inlineChars[0];
                const inlinePersonaLabel = inlinePersonaData?.name ?? inlineAgentPersonaId;
                return (
                  <Card
                    size="small"
                    title={t('agent.createNew')}
                  >
                    {inlineAgentValidationError ? (
                      <p className="mb-3 text-sm text-red-600">{inlineAgentValidationError}</p>
                    ) : null}

                    {/* Step 0: Character type */}
                    {inlineAgentStep === 0 ? (
                      <div className="space-y-3">
                        {/* Character section */}
                        <div className="flex items-center gap-2 rounded-md bg-[rgba(114,46,209,0.12)] px-3 py-2 text-sm font-medium text-[#9d6fe8]">
                          <BulbOutlined />
                          {t('agent.chooseCharacter')}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {PROMPT_PERSONAS.map((persona) => (
                            <button
                              key={persona.id}
                              type="button"
                              onClick={() => onInlineAgentPersonaChange(persona.id)}
                              className={`relative rounded-md border-2 p-3 text-left text-foreground transition-all !bg-card ${inlineAgentPersonaId === persona.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                              aria-label={`Inline character ${t(`personas.${persona.id}.name`)}`}
                            >
                              {inlineAgentPersonaId === persona.id ? (
                                <span className="absolute top-1 right-1 text-sm leading-none text-[#9d6fe8]"><RobotFilled /></span>
                              ) : null}
                              <p className="font-semibold text-sm">{t(`personas.${persona.id}.name`)}</p>
                              <p className="text-xs text-muted-foreground">{t(`personas.${persona.id}.tagline`)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Step 1: Personality style + model + system prompt */}
                    {inlineAgentStep === 1 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t('agent.character')}:</span>
                          <Tag color="purple">{inlinePersonaLabel}</Tag>
                        </div>
                        {/* Personality section */}
                        <div className="flex items-center gap-2 rounded-md bg-[rgba(114,46,209,0.12)] px-3 py-2 text-sm font-medium text-[#9d6fe8]">
                          <ToolOutlined />
                          {t('agent.choosePersonality')}
                          <span className="ml-1 font-normal text-muted-foreground">{t('agent.forCharacter', { character: inlinePersonaLabel })}</span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                          {inlineChars.map((char) => (
                            <button
                              key={char.id}
                              type="button"
                              onClick={() => onInlineAgentCharacterChange(char.id)}
                              className={`relative rounded-md border-2 p-3 text-left text-foreground transition-all !bg-card ${inlineAgentCharacterId === char.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                              aria-label={`Inline personality ${t(`personas.${inlineAgentPersonaId}.characters.${char.id}.name`)}`}
                            >
                              {inlineAgentCharacterId === char.id ? (
                                <span className="absolute top-1 right-1 text-sm leading-none text-[#9d6fe8]"><RobotFilled /></span>
                              ) : null}
                              <p className="font-semibold text-sm">{t(`personas.${inlineAgentPersonaId}.characters.${char.id}.name`)}</p>
                              <p className="text-xs text-muted-foreground">{t(`personas.${inlineAgentPersonaId}.characters.${char.id}.tagline`)}</p>
                            </button>
                          ))}
                        </div>
                        <div className="border-t pt-3 space-y-3">
                          {/* Report detail level picker */}
                          <div>
                            <p className="mb-2 text-xs text-muted-foreground">{t('report.detail.label')}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {([
                                { id: 'brief' as const, label: t('report.detail.brief'), desc: t('report.detail.briefDesc'), icon: '⚡' },
                                { id: 'standard' as const, label: t('report.detail.standard'), desc: t('report.detail.standardDesc'), icon: '📊' },
                                { id: 'detailed' as const, label: t('report.detail.detailed'), desc: t('report.detail.detailedDesc'), icon: '🔬' },
                              ]).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setInlineAgentReportDetailLevel(opt.id)}
                                  className={`relative rounded-md border-2 p-3 text-left text-foreground transition-all !bg-card ${inlineAgentReportDetailLevel === opt.id ? 'border-[#722ed1] shadow-[0_0_0_3px_rgba(114,46,209,0.18)]' : 'border-border hover:border-[#9d6fe8]'}`}
                                >
                                  <div className="text-base mb-1">{opt.icon}</div>
                                  <p className="font-semibold text-sm">{opt.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                          {inlineAgentPersonaId === 'finance_expert' ? (
                            <div>
                              <p className="mb-1 text-xs text-muted-foreground">{t('agent.riskLevel')}</p>
                              <Select
                                  aria-label={t('agent.riskLevel')}
                                value={inlineAgentRiskLevel}
                                onChange={(v) => setInlineAgentRiskLevel(v as 'low' | 'medium' | 'high')}
                                options={[
                                    { value: 'low', label: t('agent.riskLow') },
                                    { value: 'medium', label: t('agent.riskMedium') },
                                    { value: 'high', label: t('agent.riskHigh') }
                                ]}
                                className="w-full"
                              />
                            </div>
                          ) : null}
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">{t('agent.model')}</p>
                            <Select
                              aria-label={t('agent.model')}
                              value={inlineAgentModel}
                              onChange={setInlineAgentModel}
                              options={[
                                { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
                                { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' }
                              ]}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">{t('agent.systemPrompt')}</p>
                            <Input.TextArea
                              aria-label={t('agent.systemPrompt')}
                              rows={5}
                              value={inlineAgentSystemPrompt}
                              onChange={(e) => setInlineAgentSystemPrompt(e.currentTarget.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Step 2: Schedule + Recipients */}
                    {inlineAgentStep === 2 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                          {t('schedule.intro')}
                        </p>
                        <Select
                          aria-label={t('schedule.mode')}
                          value={scheduleDraft.mode}
                          onChange={(value) => scheduleDraft.setMode(value as 'interval' | 'daily' | 'weekly')}
                          options={[
                            { value: 'interval', label: t('schedule.interval') },
                            { value: 'daily', label: t('schedule.daily') },
                            { value: 'weekly', label: t('schedule.weekly') }
                          ]}
                          className="w-full"
                        />
                        {scheduleDraft.mode === 'interval' ? (
                          <Input
                            aria-label={t('schedule.intervalAriaLabel')}
                            value={String(scheduleDraft.intervalMinutes)}
                            onChange={(event) => scheduleDraft.setIntervalMinutes(Math.max(15, Number(event.currentTarget.value) || 60))}
                            placeholder={t('schedule.intervalPlaceholder')}
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="grid gap-2 md:grid-cols-2">
                              <Input
                                aria-label={t('schedule.dailyTimeAriaLabel')}
                                value={scheduleDraft.dailyTime}
                                onChange={(event) => scheduleDraft.setDailyTime(event.currentTarget.value)}
                                placeholder="HH:mm"
                              />
                              <Select
                                aria-label={t('schedule.timezoneAriaLabel')}
                                value={scheduleDraft.timezone}
                                onChange={(value) => scheduleDraft.setTimezone(value)}
                                options={TIMEZONE_OPTIONS}
                                placeholder={t('schedule.timezonePlaceholder')}
                                showSearch
                                className="w-full"
                              />
                            </div>
                            {scheduleDraft.mode === 'weekly' ? (
                              <Select
                                aria-label={t('schedule.daysOfWeekAriaLabel')}
                                mode="multiple"
                                value={scheduleDraft.daysOfWeek}
                                onChange={(values) => scheduleDraft.setDaysOfWeek(values as number[])}
                                options={[
                                  { value: 1, label: t('schedule.days.mon') }, { value: 2, label: t('schedule.days.tue') },
                                  { value: 3, label: t('schedule.days.wed') }, { value: 4, label: t('schedule.days.thu') },
                                  { value: 5, label: t('schedule.days.fri') }, { value: 6, label: t('schedule.days.sat') },
                                  { value: 0, label: t('schedule.days.sun') }
                                ]}
                                className="w-full"
                              />
                            ) : null}
                          </div>
                        )}
                        <div className="border-t pt-3">
                          <p className="mb-1 text-xs text-gray-500">{t('schedule.recipients')}</p>
                          <Select
                           aria-label={t('schedule.recipients')}
                            mode="tags"
                            value={scheduleDraft.recipients}
                            onChange={(values) => scheduleDraft.setRecipients(() => values as string[])}
                            tokenSeparators={[',', ' ']}
                           placeholder={t('schedule.recipientsPlaceholder')}
                            className="w-full"
                          />
                          <p className="mt-1 text-xs text-gray-400">{t('schedule.recipientsHint')}</p>
                        </div>
                      </div>
                    ) : null}

                  </Card>
                );
              })() : null}
            </div>

            {/* Advanced settings for follow-source mode (replaces the separate step 2) */}
            {playbookCreateStep === 1 && followWizardSourcePreselected && !showInlineAgentCreate && !inlineAgentCurating ? (
              <div className="border-t pt-3">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  onClick={() => setWizardShowAdvanced((v) => !v)}
                >
                  <span>{wizardShowAdvanced ? '▾' : '▸'}</span>
                  <span>{t('listen.advancedSettings')}</span>
                </button>
                {wizardShowAdvanced ? (
                  <div className="mt-3 space-y-3">
                    <div className="text-xs text-gray-500 mb-1">{t('schedule.scheduleLabel')}</div>
                    <Select
                      aria-label={t('schedule.mode')}
                      value={scheduleDraft.mode}
                      onChange={(value) => scheduleDraft.setMode(value as 'interval' | 'daily' | 'weekly')}
                      options={[
                        { value: 'interval', label: t('schedule.interval') },
                        { value: 'daily', label: t('schedule.daily') },
                        { value: 'weekly', label: t('schedule.weekly') }
                      ]}
                    />
                    {scheduleDraft.mode === 'interval' ? (
                      <Input
                        aria-label={t('schedule.intervalAriaLabel')}
                        value={String(scheduleDraft.intervalMinutes)}
                        onChange={(event) => scheduleDraft.setIntervalMinutes(Math.max(15, Number(event.currentTarget.value) || 60))}
                        placeholder={t('schedule.intervalPlaceholder')}
                      />
                    ) : (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            aria-label={t('schedule.dailyTimeAriaLabel')}
                            value={scheduleDraft.dailyTime}
                            onChange={(event) => scheduleDraft.setDailyTime(event.currentTarget.value)}
                            placeholder="HH:mm"
                          />
                          <Select
                            aria-label={t('schedule.timezoneAriaLabel')}
                            value={scheduleDraft.timezone}
                            onChange={(value) => scheduleDraft.setTimezone(value)}
                            options={TIMEZONE_OPTIONS}
                            placeholder={t('schedule.timezonePlaceholder')}
                            showSearch
                            className="w-full"
                          />
                        </div>
                        {scheduleDraft.mode === 'weekly' ? (
                          <Select
                            aria-label={t('schedule.daysOfWeekAriaLabel')}
                            mode="multiple"
                            value={scheduleDraft.daysOfWeek}
                            onChange={(values) => scheduleDraft.setDaysOfWeek(values as number[])}
                            options={[
                              { value: 1, label: t('schedule.days.mon') },
                              { value: 2, label: t('schedule.days.tue') },
                              { value: 3, label: t('schedule.days.wed') },
                              { value: 4, label: t('schedule.days.thu') },
                              { value: 5, label: t('schedule.days.fri') },
                              { value: 6, label: t('schedule.days.sat') },
                              { value: 0, label: t('schedule.days.sun') }
                            ]}
                          />
                        ) : null}
                      </>
                    )}
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('schedule.recipients')}</div>
                      <Select
                        aria-label={t('schedule.recipients')}
                        mode="tags"
                        value={scheduleDraft.recipients}
                        onChange={(values) => scheduleDraft.setRecipients(() => values as string[])}
                        tokenSeparators={[',', ' ']}
                        placeholder={t('schedule.recipientsPlaceholder')}
                        className="w-full"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            </>
          ) : null}
          {playbookCreateStep === 2 ? (
            <>
              <Select
                aria-label={t('schedule.mode')}
                value={scheduleDraft.mode}
                onChange={(value) => scheduleDraft.setMode(value as 'interval' | 'daily' | 'weekly')}
                options={[
                  { value: 'interval', label: t('schedule.interval') },
                  { value: 'daily', label: t('schedule.daily') },
                  { value: 'weekly', label: t('schedule.weekly') }
                ]}
              />
              {scheduleDraft.mode === 'interval' ? (
                <Input
                  aria-label={t('schedule.intervalAriaLabel')}
                  value={String(scheduleDraft.intervalMinutes)}
                  onChange={(event) => scheduleDraft.setIntervalMinutes(Math.max(15, Number(event.currentTarget.value) || 60))}
                  placeholder={t('schedule.intervalPlaceholder')}
                />
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input
                      aria-label={t('schedule.dailyTimeAriaLabel')}
                      value={scheduleDraft.dailyTime}
                      onChange={(event) => scheduleDraft.setDailyTime(event.currentTarget.value)}
                      placeholder="HH:mm"
                    />
                    <Select
                      aria-label={t('schedule.timezoneAriaLabel')}
                      value={scheduleDraft.timezone}
                      onChange={(value) => scheduleDraft.setTimezone(value)}
                      options={TIMEZONE_OPTIONS}
                      placeholder={t('schedule.timezonePlaceholder')}
                      showSearch
                      className="w-full"
                    />
                  </div>
                  {scheduleDraft.mode === 'weekly' ? (
                    <Select
                      aria-label={t('schedule.daysOfWeekAriaLabel')}
                      mode="multiple"
                      value={scheduleDraft.daysOfWeek}
                      onChange={(values) => scheduleDraft.setDaysOfWeek(values as number[])}
                      options={[
                        { value: 1, label: t('schedule.days.mon') },
                        { value: 2, label: t('schedule.days.tue') },
                        { value: 3, label: t('schedule.days.wed') },
                        { value: 4, label: t('schedule.days.thu') },
                        { value: 5, label: t('schedule.days.fri') },
                        { value: 6, label: t('schedule.days.sat') },
                        { value: 0, label: t('schedule.days.sun') }
                      ]}
                    />
                  ) : null}
                </>
              )}
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('schedule.recipients')}</div>
                <Select
                  aria-label={t('schedule.recipients')}
                  mode="tags"
                  value={scheduleDraft.recipients}
                  onChange={(values) => scheduleDraft.setRecipients(() => values as string[])}
                  tokenSeparators={[',', ' ']}
                  placeholder={t('schedule.recipientsPlaceholder')}
                  className="w-full"
                  style={{ minHeight: 88 }}
                />
              </div>
            </>
          ) : null}
        </div>
        )}
        {/* While the AI curator is embedded, it owns the only nav buttons (← Back / Continue →) — hide the wizard footer. */}
        {inlineAgentCurating || followWizardSourcePreselected ? null : (
        <div className="mobile-workflow-actions mt-4 flex flex-row flex-wrap items-center justify-between gap-2 pt-3 pb-1">
          {showInlineAgentCreate || (!followWizardSourcePreselected && playbookCreateStep > 0) || editingPlaybookId ? (
          <div className={`flex flex-wrap items-center gap-2 ${showInlineAgentCreate ? 'shrink-0' : ''}`}>
            {showInlineAgentCreate || (!followWizardSourcePreselected && playbookCreateStep > 0) ? (
              <Button
                aria-label={showInlineAgentCreate && inlineAgentStep === 0 ? t('listen.stepChooseAgent') : t('common.back')}
                className="mobile-wizard-button"
                icon={<ArrowLeftOutlined />}
                onClick={showInlineAgentCreate ? onInlineAgentBack : onBackPlaybookCreateStep}
              >
                  <span className="mobile-button-label">
                    {showInlineAgentCreate && inlineAgentStep === 0 ? t('listen.stepChooseAgent') : t('common.back')}
                  </span>
              </Button>
            ) : null}
            {/* Stop listening — only shown when editing a playbook and NOT inside the agent sub-wizard */}
            {editingPlaybookId && !showInlineAgentCreate ? (
              confirmingUnfollow ? (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">{t('listen.stopListeningConfirm')}</span>
                  <Button
                    danger
                    size="small"
                    loading={false}
                    onClick={() => void onUnfollowFromWizard()}
                  >
                      {t('common.yes')}
                  </Button>
                  <Button size="small" onClick={() => setConfirmingUnfollow(false)}>
                      {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  danger
                  icon={<AudioMutedOutlined />}
                  onClick={() => setConfirmingUnfollow(true)}
                >
                    {t('listen.stopListening')}
                </Button>
              )
            ) : null}
          </div>
          ) : null}
          <div className={`ml-auto flex items-center justify-end gap-2 ${showInlineAgentCreate ? 'min-w-0 flex-1' : ''}`}>
            {!showInlineAgentCreate ? (
              <Button className="hidden sm:inline-flex" onClick={onCancelPlaybookCreate}>{t('common.cancel')}</Button>
            ) : null}
            {showInlineAgentCreate ? (
              inlineAgentStep < 2 ? (
                <Button
                  aria-label={t('common.next')}
                  className="mobile-wizard-button"
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={onInlineAgentNext}
                >
                    <span className="mobile-button-label">{t('common.next')}</span>
                </Button>
              ) : (
                <Button
                  aria-label={t('agent.create')}
                  className="mobile-wizard-button"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={isInlineAgentSaving}
                  onClick={() => void onSaveInlineAgent()}
                >
                    <span className="mobile-button-label">{t('agent.create')}</span>
                </Button>
              )
            ) : playbookCreateStep < 2 && !followWizardSourcePreselected ? (
              <Button
                aria-label={t('common.next')}
                className="mobile-wizard-button"
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={onNextPlaybookCreateStep}
              >
                  <span className="mobile-button-label">{t('common.next')}</span>
              </Button>
            ) : playbookCreateStep === 1 && followWizardSourcePreselected ? (
              <Button
                aria-label={t('common.save')}
                className="mobile-wizard-button"
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={isPlaybookSaving}
                onClick={() => void onCreatePlaybook()}
              >
                  <span className="mobile-button-label">{t('common.save')}</span>
              </Button>
            ) : playbookCreateStep < 2 ? (
              <Button
                aria-label={t('common.next')}
                className="mobile-wizard-button"
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={onNextPlaybookCreateStep}
              >
                  <span className="mobile-button-label">{t('common.next')}</span>
              </Button>
            ) : (
              <Button
                aria-label={editingPlaybookId ? t('playbook.updatePlaybook') : t('playbook.createPlaybook')}
                className="mobile-wizard-button"
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={isPlaybookSaving}
                onClick={onCreatePlaybook}
              >
                  <span className="mobile-button-label">
                    {editingPlaybookId ? t('playbook.updatePlaybook') : t('playbook.createPlaybook')}
                  </span>
              </Button>
            )}
          </div>
        </div>
        )}
      </Modal>
  );
}
