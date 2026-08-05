import { Button, Modal, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { AgentSummary } from '../../api/agents';
import type { PlaybookRecord } from '../../api/playbooks';
import { getCharacterTypeColor, getCharacterTypeEmoji } from '../../data/character-types';
import { getAgentDisplayLabel } from '../../utils/agent-label';
import { humanizeCharacterType } from '../shared/helpers';

export type RunPickerEntry = { playbook: PlaybookRecord; agent: AgentSummary | undefined };

/** Agent picker: shown when multiple agents watch the same source and user clicks ▶ */
export function AgentPickerModal({
  open,
  linked,
  onSelect,
  onClose
}: {
  open: boolean;
  linked: RunPickerEntry[];
  onSelect: (playbook: PlaybookRecord, agent: AgentSummary | undefined) => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      title={t('listen.runPickerTitle')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <div className="space-y-2 py-1">
        {linked.map(({ playbook, agent }) => {
          const emoji = getCharacterTypeEmoji(agent?.characterType);
          const characterLabel = agent?.characterType ? humanizeCharacterType(agent.characterType) : null;
          const tagColor = getCharacterTypeColor(agent?.characterType);
          return (
            <Button
              key={playbook.id}
              block
              size="large"
              className="text-left h-auto py-3"
              onClick={() => void onSelect(playbook, agent)}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <div className="flex flex-col items-start gap-0.5 min-w-0">
                  <span className="font-semibold text-sm">{agent ? getAgentDisplayLabel(agent) : playbook.name}</span>
                  <div className="flex items-center gap-1.5">
                    {characterLabel ? <Tag color={tagColor} className="m-0 text-xs">{characterLabel}</Tag> : null}
                    {agent?.promptConfig?.personality_label ? <Tag color="magenta" className="m-0 text-xs">{agent.promptConfig.personality_label}</Tag> : null}
                  </div>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </Modal>
  );
}
