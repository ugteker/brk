import { Modal } from 'antd';
import { useTranslation } from 'react-i18next';
import type { AgentSummary } from '../../api/agents';
import type { PlaybookRecord } from '../../api/playbooks';
import type { SourceRecord } from '../../api/sources';
import { AgentCurator, type CuratedAgent } from '../../components/AgentCurator';
import { AgentSelectionView } from '../../components/agent-selection/AgentSelectionView';
import { getSourceDisplayTitle } from './helpers';

type HubUser = { id?: string | null; email?: string | null } | null | undefined;

interface FollowWizardModalProps {
  open: boolean;
  sources: SourceRecord[];
  agents: AgentSummary[];
  user: HubUser;
  playbookSourceIdDraft: string | null;
  inlineAgentCurating: boolean;
  setInlineAgentCurating: (value: boolean) => void;
  inlineCurationBaseAgentVersionId: string | null;
  onCancelPlaybookCreate: () => void;
  handleAgentSelectionConnected: (playbook: PlaybookRecord) => void | Promise<void>;
  openInlineAgentCuration: (baseAgentVersionId?: string) => void;
  onInlineAgentCurated: (agent: CuratedAgent) => void | Promise<void>;
}

export function FollowWizardModal({
  open,
  sources,
  agents,
  user,
  playbookSourceIdDraft,
  inlineAgentCurating,
  setInlineAgentCurating,
  inlineCurationBaseAgentVersionId,
  onCancelPlaybookCreate,
  handleAgentSelectionConnected,
  openInlineAgentCuration,
  onInlineAgentCurated
}: FollowWizardModalProps) {
  const { t } = useTranslation();
  const source = sources.find((s) => s.id === playbookSourceIdDraft) ?? null;
  const sourceTitle = source ? getSourceDisplayTitle(source) : null;

  return (
    <Modal
      title={t('listen.dialogTitleNew', { title: sourceTitle ?? t('listen.thisSource') })}
      open={open}
      onCancel={onCancelPlaybookCreate}
      footer={null}
      destroyOnHidden
      width="min(720px, 95vw)"
      className="follow-source-modal mobile-fullscreen-modal"
      styles={{ body: { maxHeight: 'calc(100dvh - 9rem)', overflowX: 'hidden', overflowY: 'auto' } }}
    >
      {inlineAgentCurating ? (
        <AgentCurator
          mode="create"
          baseAgentVersionId={inlineCurationBaseAgentVersionId}
          sourceContext={source ? {
            title: getSourceDisplayTitle(source),
            type: source.type,
            url: source.value,
            value: source.value
          } : undefined}
          onCancel={() => setInlineAgentCurating(false)}
          onComplete={(agent) => void onInlineAgentCurated(agent)}
        />
      ) : (
        <AgentSelectionView
          source={source}
          ownedAgents={agents.filter((agent) => agent.ownerUserId === user?.id)}
          onAgentConnected={handleAgentSelectionConnected}
          onCurate={openInlineAgentCuration}
        />
      )}
    </Modal>
  );
}
