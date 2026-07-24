import { Button, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { PlaybookRecord } from '../../api/playbooks';

const { Text } = Typography;

interface AgentConnectedModalProps {
  open: boolean;
  playbook: PlaybookRecord | null;
  running: boolean;
  onRunFirstReport: () => void | Promise<void>;
  onScheduleRecurring: () => void;
  onDone: () => void;
}

export function AgentConnectedModal({
  open,
  playbook,
  running,
  onRunFirstReport,
  onScheduleRecurring,
  onDone
}: AgentConnectedModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      title={t('agentSelection.connectedActionsTitle')}
      onCancel={onDone}
      footer={null}
      destroyOnHidden
    >
      <div className="space-y-4">
        <Text type="secondary">{t('agentSelection.connectedActionsDescription')}</Text>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="primary" className="flex-1" loading={running} disabled={!playbook} onClick={() => void onRunFirstReport()}>
            {t('agentSelection.runFirstReport')}
          </Button>
          <Button className="flex-1" disabled={!playbook || running} onClick={onScheduleRecurring}>
            {t('agentSelection.scheduleRecurring')}
          </Button>
          <Button className="flex-1" disabled={running} onClick={onDone}>
            {t('agentSelection.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
