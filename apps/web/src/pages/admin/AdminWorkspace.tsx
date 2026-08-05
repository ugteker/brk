import { Badge, Button, Card, Input, Modal, Skeleton, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, CaretRightOutlined, ClockCircleOutlined, CompassOutlined, EditOutlined, FileTextOutlined, LoadingOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusCircleOutlined, RocketOutlined, SearchOutlined } from '@ant-design/icons';
import { AgentCurator } from '../../components/AgentCurator';
import { AgentForm } from '../../components/AgentForm';
import { AgentPromptEditor } from '../../components/AgentPromptEditor';
import { AgentReportsBrowser } from '../../components/AgentReportsBrowser';
import { AgentRunsBrowser } from '../../components/AgentRunsBrowser';
import { AgentStatusCard } from '../../components/AgentStatusCard';
import { EntityActions } from '../../components/EntityActions';
import { InlineDeleteButton } from '../../components/InlineDeleteButton';
import { GhostCreateCard } from '../../components/library/GhostCreateCard';
import { TouchSafeTooltip } from '../../components/TouchSafeTooltip';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { BrainIcon, formatPlaybookSchedule, getAgentCharacterLabel, getAgentPersonalityLabel, getCharacterIcon, getSourceDisplayTitle } from '../shared/helpers';

const { Title } = Typography;

export function AdminWorkspace({ ctx, tab }: { ctx: any; tab: 'agents' | 'playbooks' }) {
  const { accessGrantCount, activePlaybookTab, agentEditor, agents, agentsSearch, cloningPublicationId, completeAgentCuration, executionAgent, filteredAgents, filteredMarketplaceAgents, filteredMarketplacePlaybooks, filteredPlaybooks, grantAgentAccess, highlightedReportId, isLoadingEditTarget, loadState, marketplaceAgentCount, marketplaceAgentsSearch, marketplacePlaybookCount, marketplacePlaybooks, marketplacePlaybooksSearch, onCloneMarketplaceAgent, onCloneMarketplacePlaybook, onDeleteAgent, onDeletePlaybook, onEditAgent, onEditPlaybook, onImproveAgentWithAI, onRunNow, onTogglePause, onTogglePlaybookEnabled, onViewReport, openCurationCreate, openPlaybookCreate, playbooksLoadState, playbooksSearch, prompt, publishAgent, publishPlaybook, refreshAgents, refreshMarketplaceCounts, runningAgentId, runs, selectedAgent, selectedPlaybook, selectedPlaybookReports, setActiveHub, setActivePlaybookTab, setAgentEditor, setAgentsSearch, setMarketplaceAgentsSearch, setMarketplacePlaybooksSearch, setPlaybooksSearch, setSelectedAgentId, setSelectedPlaybookId, setShowAgentsMarketplace, setShowPlaybooksMarketplace, setViewingSymbol, sharePlaybook, showAgentsMarketplace, showPlaybooksMarketplace, sources, t, togglingAgentId, togglingPlaybookId, user } = ctx;

  if (tab === 'agents') {
    return (
                  <div
                    className={
                      agentEditor || selectedAgent
                        ? 'grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]'
                        : 'min-w-0'
                    }
                  >
                    {agentEditor?.mode === 'manual-create' ? (
                      <AgentForm
                        onCancel={() => setAgentEditor(null)}
                        onComplete={() => {
                          setAgentEditor(null);
                          refreshAgents();
                        }}
                      />
                    ) : agentEditor?.mode === 'manual-edit' ? (
                      <AgentForm
                        key={agentEditor.detail.id}
                        agent={agentEditor.detail}
                        initialPrompt={
                          agentEditor.prompt
                            ? { model: agentEditor.prompt.model, systemPrompt: agentEditor.prompt.systemPrompt }
                            : null
                        }
                        onCancel={() => setAgentEditor(null)}
                        onComplete={() => {
                          setAgentEditor(null);
                          refreshAgents();
                        }}
                      />
                    ) : agentEditor?.mode === 'curation-create' ? (
                      <Modal
                        title="Curate with AI"
                        open
                        onCancel={() => setAgentEditor(null)}
                        footer={null}
                        destroyOnHidden
                        width="min(720px, 95vw)"
                        className="agent-curator-modal mobile-fullscreen-modal"
                        styles={{ body: { maxHeight: 'calc(100dvh - 9rem)', overflowX: 'hidden', overflowY: 'auto' } }}
                      >
                        <AgentCurator
                          mode="create"
                          onCancel={() => setAgentEditor(null)}
                          onComplete={completeAgentCuration}
                        />
                      </Modal>
                    ) : agentEditor?.mode === 'curation-update' ? (
                      <Modal
                        key={agentEditor.detail.id}
                        title="Curate with AI"
                        open
                        onCancel={() => setAgentEditor(null)}
                        footer={null}
                        destroyOnHidden
                        width="min(720px, 95vw)"
                        className="agent-curator-modal mobile-fullscreen-modal"
                        styles={{ body: { maxHeight: 'calc(100dvh - 9rem)', overflowX: 'hidden', overflowY: 'auto' } }}
                      >
                        <AgentCurator
                          key={agentEditor.detail.id}
                          mode="update"
                          targetAgentId={agentEditor.detail.id}
                          currentAgentProfile={{
                            name: agentEditor.detail.name,
                            description: agentEditor.detail.description,
                            characterType: agentEditor.detail.characterType ?? null,
                            systemPrompt: agentEditor.prompt?.systemPrompt ?? ''
                          }}
                          onCancel={() => setAgentEditor(null)}
                          onComplete={completeAgentCuration}
                        />
                      </Modal>
                    ) : selectedAgent ? (
                      <Card
                        className="min-w-0"
                        title={
                          <span className="flex items-center gap-2">
                            <Badge
                              status={selectedAgent.status === 'disabled' ? 'default' : 'success'}
                              text={getAgentDisplayLabel(selectedAgent)}
                            />
                            <Tag>Access grants: {accessGrantCount}</Tag>
                          </span>
                        }
                        extra={
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <TouchSafeTooltip title="Back to dashboard">
                              <Button
                                aria-label="Back to dashboard"
                                shape="circle"
                                icon={<ArrowLeftOutlined />}
                                onClick={() => setSelectedAgentId(null)}
                              />
                            </TouchSafeTooltip>
                            <TouchSafeTooltip title="Edit agent">
                              <Button
                                aria-label="Edit agent"
                                shape="circle"
                                loading={isLoadingEditTarget}
                                icon={<EditOutlined />}
                                onClick={(event) => onEditAgent(selectedAgent, event)}
                              />
                            </TouchSafeTooltip>
                            <Button
                              aria-label="Improve agent with AI"
                              icon={<BrainIcon />}
                              onClick={(event) => onImproveAgentWithAI(selectedAgent, event)}
                            >
                              Improve with AI
                            </Button>
                            <TouchSafeTooltip title={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}>
                              <Button
                                aria-label={selectedAgent.status === 'disabled' ? 'Resume agent' : 'Pause agent'}
                                shape="circle"
                                loading={togglingAgentId === selectedAgent.id}
                                icon={
                                  selectedAgent.status === 'disabled' ? (
                                    <PlayCircleOutlined />
                                  ) : (
                                    <PauseCircleOutlined />
                                  )
                                }
                                onClick={(event) => onTogglePause(selectedAgent, event)}
                              />
                            </TouchSafeTooltip>
                            <TouchSafeTooltip title="Remove agent">
                                <InlineDeleteButton
                                  ariaLabel="Remove agent"
                                  confirmText="Remove"
                                  onConfirm={() => onDeleteAgent(selectedAgent)}
                                />
                              </TouchSafeTooltip>
                          </div>
                        }
                      >
                        <Card size="small" title="System prompt">
                          <AgentPromptEditor
                            agentId={selectedAgent.id}
                            initialModel={prompt?.model}
                            initialSystemPrompt={prompt?.systemPrompt}
                            initialEnabled={prompt?.enabled ?? true}
                          />
                        </Card>
                      </Card>
                    ) : (
                      <Card
                        className="min-w-0"
                        title={<Title level={4} style={{ margin: 0 }}>{t('nav.agents')}</Title>}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <Input
                            aria-label="Search agents"
                            value={agentsSearch}
                            onChange={(event) => setAgentsSearch(event.currentTarget.value)}
                            placeholder="Search agents by name or source URL"
                            prefix={<SearchOutlined />}
                            style={{ maxWidth: 420 }}
                          />
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <TouchSafeTooltip title={t('agentSelection.curateWithAi')}>
                              <Button
                                type="primary"
                                shape="circle"
                                icon={<BrainIcon />}
                                aria-label={t('agentSelection.curateWithAi')}
                                onClick={openCurationCreate}
                              />
                            </TouchSafeTooltip>
                            <Badge count={marketplaceAgentCount} size="small">
                              <Button
                                aria-label="Browse marketplace agents"
                                icon={<CompassOutlined />}
                                onClick={async () => {
                                  await refreshMarketplaceCounts();
                                  setShowAgentsMarketplace(true);
                                }}
                              >
                                Browse marketplace
                              </Button>
                            </Badge>
                          </div>
                        </div>
                        {loadState === 'loading' ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {[1, 2, 3, 4].map((i) => (
                              <Card key={i} size="small" className="min-h-[170px]">
                                <Skeleton active paragraph={{ rows: 3 }} />
                              </Card>
                            ))}
                          </div>
                        ) : null}
                        {loadState === 'error' ? <p className="text-sm text-red-700">Failed to load agents.</p> : null}
                        {loadState !== 'loading' && filteredAgents.length === 0 && !showAgentsMarketplace ? (
                          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-200 py-12 px-6 text-center dark:border-gray-700">
                            <span className="text-5xl">🤖</span>
                            <div>
                              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('agent.emptyHeadline')}</p>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{t('agent.emptyDesc')}</p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                              <Button type="primary" size="large" icon={<BrainIcon />} onClick={openCurationCreate}>
                                Curate with AI
                              </Button>
                            </div>
                            {sources.length === 0 ? (
                              <p className="text-xs text-amber-600 dark:text-amber-400 max-w-xs">{t('agent.emptySourceHint')}</p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {filteredAgents.map((agent: any) => (
                            <Card
                              key={agent.id}
                              size="small"
                              hoverable
                              onClick={() => setSelectedAgentId(agent.id)}
                              style={{ cursor: 'pointer' }}
                              className="min-h-[170px] transition-shadow"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold">
                                    <Badge
                                      status={agent.status === 'disabled' ? 'default' : 'success'}
                                      text={getAgentDisplayLabel(agent)}
                                    />
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                    <Tag icon={getCharacterIcon(agent.characterType)}>Character: {getAgentCharacterLabel(agent)}</Tag>
                                    <Tag>Personality: {getAgentPersonalityLabel(agent)}</Tag>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                                  <Button
                                    aria-label="Improve agent with AI"
                                    icon={<BrainIcon />}
                                    onClick={() => void onImproveAgentWithAI(agent)}
                                  >
                                    Improve with AI
                                  </Button>
                                  <EntityActions
                                    entityLabel="agent"
                                    isOwner={agent.ownerUserId === user?.id}
                                    onEdit={() => onEditAgent(agent)}
                                    onDelete={() => onDeleteAgent(agent)}
                                    onShare={(payload) =>
                                      grantAgentAccess(agent.id, {
                                        granteeUserId: payload.granteeUserId,
                                        permission: payload.permission as 'read' | 'edit' | 'delete'
                                      })
                                    }
                                    sharePermissions={['read', 'edit', 'delete']}
                                    onPublish={(payload) => publishAgent(agent.id, payload)}
                                    defaultPublishTitle={getAgentDisplayLabel(agent)}
                                  />
                                </div>
                              </div>
                              <div className="mt-2 text-xs text-gray-600">
                                <div className="inline-flex items-center gap-1">
                                  <FileTextOutlined /> Persona + prompt ready
                                </div>
                              </div>
                            </Card>
                          ))}
                          <GhostCreateCard
                           ariaLabel="Curate an agent with AI"
                           onClick={openCurationCreate}
                           icon={<BrainIcon />}
                           title="Curate with AI"
                           sub="Describe the agent you want to create"
                           className="w-full"
                          />
                        </div>
                        <Modal
                          title={<span className="flex items-center gap-2"><CompassOutlined className="text-sky-500" />{t('marketplace.heading')} — {t('nav.agents')}</span>}
                          open={showAgentsMarketplace}
                          onCancel={() => { setShowAgentsMarketplace(false); setMarketplaceAgentsSearch(''); }}
                          footer={null}
                          destroyOnHidden
                        >
                          <div className="space-y-3">
                            <Input
                              aria-label="Search marketplace agents"
                              value={marketplaceAgentsSearch}
                              onChange={(e) => setMarketplaceAgentsSearch(e.currentTarget.value)}
                              placeholder="Search by name or description"
                              prefix={<SearchOutlined />}
                              allowClear
                            />
                            {filteredMarketplaceAgents.length === 0 ? (
                              <div className="flex flex-col items-center gap-3 py-8 text-center">
                                <span className="text-4xl">🧭</span>
                                <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{marketplaceAgentsSearch ? t('marketplace.noItems') : t('marketplace.emptyHeadline')}</p>
                              </div>
                            ) : null}
                            {filteredMarketplaceAgents.map((item: any) => (
                              <Card key={item.publicationId} size="small">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold">{item.title}</div>
                                    <div className="truncate text-xs text-gray-600">{item.summary || getAgentDisplayLabel(item.agent)}</div>
                                  </div>
                                  <Button
                                    size="small"
                                    loading={cloningPublicationId === item.publicationId}
                                    onClick={() => onCloneMarketplaceAgent(item.publicationId)}
                                  >
                                    Clone
                                  </Button>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </Modal>
                      </Card>
                    )}
                  </div>
    );
  }

  return (
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[2fr_1fr]">
                  <Card className="min-w-0" title={<Title level={4} style={{ margin: 0 }}>Playbooks</Title>}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <Input
                        aria-label="Search playbooks"
                        value={playbooksSearch}
                        onChange={(event) => setPlaybooksSearch(event.currentTarget.value)}
                        placeholder="Search playbooks by name or description"
                        prefix={<SearchOutlined />}
                        style={{ maxWidth: 420 }}
                      />
                      <Badge count={marketplacePlaybookCount} size="small">
                        <Button
                          aria-label="Browse marketplace playbooks"
                          icon={<CompassOutlined />}
                          onClick={async () => {
                            await refreshMarketplaceCounts();
                            setShowPlaybooksMarketplace(true);
                          }}
                        >
                          Browse marketplace
                        </Button>
                      </Badge>
                    </div>
                    {selectedPlaybook ? (
                      <Card
                        size="small"
                        title={
                          <span className="flex items-center gap-2">
                            {selectedPlaybook.name}
                            {runningAgentId === selectedPlaybook.agentId ? (
                              <Tag color="processing" icon={<LoadingOutlined spin />} className="m-0">Running</Tag>
                            ) : null}
                          </span>
                        }
                        extra={
                          <div className="flex items-center gap-2">
                            {executionAgent ? (
                              <TouchSafeTooltip title="Run playbook now">
                                <Button
                                  aria-label="Run playbook now"
                                  shape="circle"
                                  loading={runningAgentId === executionAgent.id}
                                  disabled={executionAgent.status === 'disabled'}
                                  icon={<CaretRightOutlined />}
                                  onClick={(event) => onRunNow(executionAgent, event)}
                                />
                              </TouchSafeTooltip>
                            ) : null}
                            <TouchSafeTooltip title="Back to playbooks">
                              <Button
                                aria-label="Back to playbooks"
                                shape="circle"
                                icon={<ArrowLeftOutlined />}
                                onClick={() => setSelectedPlaybookId(null)}
                              />
                            </TouchSafeTooltip>
                          </div>
                        }
                      >
                        <p className="mb-3 text-xs text-gray-600">
                          Source: {(() => {
                            const src = sources.find((s: any) => s.id === selectedPlaybook.sourceId);
                            return src ? getSourceDisplayTitle(src) : selectedPlaybook.sourceId;
                          })()} · Last run:{' '}
                          {selectedPlaybook.lastRunAt ? new Date(selectedPlaybook.lastRunAt).toLocaleString() : 'Never'} · Next run:{' '}
                          {new Date(selectedPlaybook.nextRunAt).toLocaleString()}
                        </p>
                        <Tabs
                          activeKey={activePlaybookTab}
                          onChange={setActivePlaybookTab}
                          items={[
                            {
                              key: 'reports',
                              label: t('library.reportsTab'),
                              children: (
                                <AgentReportsBrowser
                                  agentId={selectedPlaybook.agentId}
                                  agentName={agents.find((a: any) => a.id === selectedPlaybook.agentId)?.name}
                                  reports={selectedPlaybookReports}
                                  highlightedReportId={highlightedReportId}
                                  onSelectSymbol={setViewingSymbol}
                                  recipients={selectedPlaybook.recipients}
                                />
                              )
                            },
                            {
                              key: 'runs',
                              label: t('library.runsTab'),
                              children: (
                                <AgentRunsBrowser agentId={selectedPlaybook.agentId} runs={runs} onViewReport={onViewReport} />
                              )
                            }
                          ]}
                        />
                      </Card>
                    ) : (
                      <>
                        {playbooksLoadState === 'loading' ? <p className="text-sm text-gray-700">Loading playbooks...</p> : null}
                        {playbooksLoadState === 'error' ? <p className="text-sm text-red-700">Failed to load playbooks.</p> : null}
                        {playbooksLoadState !== 'loading' && filteredPlaybooks.length === 0 ? (
                          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-200 py-12 px-6 text-center dark:border-gray-700">
                            <span className="text-5xl">📅</span>
                            <div>
                              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{t('playbook.emptyHeadline')}</p>
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">{t('playbook.emptyDesc')}</p>
                            </div>
                            {sources.length === 0 ? (
                              <Button
                                size="large"
                                onClick={() => setActiveHub('sources')}
                              >
                                {t('playbook.emptyCtaNoSources')}
                              </Button>
                            ) : agents.length === 0 ? (
                              <Button
                                size="large"
                                onClick={() => setActiveHub('agents')}
                              >
                                {t('playbook.emptyCtaNoAgents')}
                              </Button>
                            ) : (
                              <Button
                                type="primary"
                                size="large"
                                icon={<PlusCircleOutlined />}
                                onClick={openPlaybookCreate}
                              >
                                {t('playbook.emptyCtaReady')}
                              </Button>
                            )}
                          </div>
                        ) : null}
                        {/* Marketplace quick-start strip — shown when empty and marketplace has items */}
                        {playbooksLoadState !== 'loading' && filteredPlaybooks.length === 0 && marketplacePlaybooks.length > 0 ? (
                          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 dark:border-sky-800 dark:bg-sky-950 px-5 py-4">
                            <div className="flex items-center gap-2 mb-3">
                              <CompassOutlined className="text-sky-500" />
                              <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{t('marketplace.quickStartHeading')}</p>
                            </div>
                            <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">{t('marketplace.quickStartDesc')}</p>
                            <div className="space-y-2">
                              {marketplacePlaybooks.slice(0, 3).map((item: any) => (
                                <div key={item.publicationId} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-sky-900 px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{item.title}</p>
                                    <p className="text-xs text-gray-500 truncate">{item.summary || item.playbook.name}</p>
                                  </div>
                                  <Button
                                    size="small"
                                    type="primary"
                                    loading={cloningPublicationId === item.publicationId}
                                    onClick={() => onCloneMarketplacePlaybook(item.publicationId)}
                                  >
                                    {t('marketplace.followPlaybook')}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="grid gap-3 sm:grid-cols-2">
                          {filteredPlaybooks.map((playbook: any) => (
                            <Card
                              key={playbook.id}
                              size="small"
                              className="min-h-[170px] transition-shadow"
                              hoverable
                              style={{ cursor: 'pointer' }}
                              onClick={() => {
                                setSelectedPlaybookId(playbook.id);
                                setActivePlaybookTab('reports');
                              }}
                              extra={
                                <div onClick={(event) => event.stopPropagation()}>
                                  <EntityActions
                                    entityLabel="playbook"
                                    isOwner={playbook.ownerUserId === user?.id}
                                    onEdit={() => onEditPlaybook(playbook)}
                                    onDelete={() => onDeletePlaybook(playbook)}
                                    onShare={(payload) =>
                                      sharePlaybook(playbook.id, {
                                        granteeUserId: payload.granteeUserId,
                                        permission: payload.permission as 'read' | 'edit' | 'delete' | 'execute'
                                      })
                                    }
                                    sharePermissions={['read', 'edit', 'delete', 'execute']}
                                    onPublish={(payload) => publishPlaybook(playbook.id, payload)}
                                    defaultPublishTitle={playbook.name}
                                  />
                                  {playbook.ownerUserId === user?.id ? (
                                    <TouchSafeTooltip title={playbook.enabled ? t('playbook.pause') : t('playbook.resume')}>
                                      <Button
                                        aria-label={playbook.enabled ? `${t('playbook.pause')} playbook` : `${t('playbook.resume')} playbook`}
                                        shape="circle"
                                        loading={togglingPlaybookId === playbook.id}
                                        icon={playbook.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                        onClick={(event) => onTogglePlaybookEnabled(playbook, event)}
                                      />
                                    </TouchSafeTooltip>
                                  ) : null}
                                </div>
                              }
                            >
                              <div className="text-sm font-semibold">{playbook.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1 text-xs">
                                {runningAgentId === playbook.agentId ? (
                                  <Tag color="processing" icon={<LoadingOutlined spin />}>Running</Tag>
                                ) : playbook.enabled ? (
                                  <Tag color="success">{t('playbook.active')}</Tag>
                                ) : (
                                  <Tag color="default">{t('playbook.paused')}</Tag>
                                )}
                                <Tag>Recipients: {playbook.recipients.length}</Tag>
                                <Tag icon={<ClockCircleOutlined />}>Schedule: {formatPlaybookSchedule(playbook.schedule)}</Tag>
                              </div>
                              <div className="mt-1 text-xs text-gray-700">{playbook.description || 'No description'}</div>
                              <div className="mt-2 text-xs text-gray-600">
                                <div>Last run: {playbook.lastRunAt ? new Date(playbook.lastRunAt).toLocaleString() : 'Never'}</div>
                                <div>Next run: {new Date(playbook.nextRunAt).toLocaleString()}</div>
                              </div>
                            </Card>
                          ))}
                          {filteredPlaybooks.length > 0 && (
                           <GhostCreateCard
                            ariaLabel={t('playbook.emptyCtaReady')}
                            onClick={openPlaybookCreate}
                            icon={<RocketOutlined />}
                            title={t('playbook.createNew')}
                            sub={t('playbook.createNewSub')}
                           />
                          )}
                        </div>
                      </>
                    )}
                    <Modal
                      title={<span className="flex items-center gap-2"><CompassOutlined className="text-sky-500" />{t('marketplace.heading')} — {t('nav.playbooks')}</span>}
                      open={showPlaybooksMarketplace}
                      onCancel={() => { setShowPlaybooksMarketplace(false); setMarketplacePlaybooksSearch(''); }}
                      footer={null}
                      destroyOnHidden
                    >
                      <div className="space-y-3">
                        <Input
                          aria-label="Search marketplace playbooks"
                          value={marketplacePlaybooksSearch}
                          onChange={(e) => setMarketplacePlaybooksSearch(e.currentTarget.value)}
                          placeholder="Search by name or description"
                          prefix={<SearchOutlined />}
                          allowClear
                        />
                        {filteredMarketplacePlaybooks.length === 0 ? (
                          <div className="flex flex-col items-center gap-3 py-8 text-center">
                            <span className="text-4xl">🧭</span>
                            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{marketplacePlaybooksSearch ? t('marketplace.noItems') : t('marketplace.emptyHeadline')}</p>
                          </div>
                        ) : null}
                        {filteredMarketplacePlaybooks.map((item: any) => (
                          <Card key={item.publicationId} size="small">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{item.title}</div>
                                <div className="truncate text-xs text-gray-600">{item.summary || item.playbook.name}</div>
                              </div>
                              <Button
                                size="small"
                                loading={cloningPublicationId === item.publicationId}
                                onClick={() => onCloneMarketplacePlaybook(item.publicationId)}
                              >
                                {cloningPublicationId === item.publicationId ? t('marketplace.cloningButton') : t('marketplace.cloneButton')}
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </Modal>
                  </Card>
                  <AgentStatusCard />
                  </div>
  );
}



