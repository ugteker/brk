import { Button, Modal, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { SourceRecord } from '../../api/sources';

const { Paragraph, Text } = Typography;

export interface PostSourceChoiceModalProps {
  source: SourceRecord | null;
  open: boolean;
  onChooseAgent: (source: SourceRecord) => void;
  onSkip: (source: SourceRecord) => void;
}

export function PostSourceChoiceModal({ source, open, onChooseAgent, onSkip }: PostSourceChoiceModalProps) {
  const { t } = useTranslation();

  if (!open || !source) return null;

  return (
    <Modal
      open={open}
      title={t('library.sourceAdded')}
      className="post-source-choice-modal mobile-fullscreen-modal"
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      destroyOnHidden
    >
      <div className="space-y-4">
        <Paragraph className="mb-0">
          {t('library.chooseAgentDescription')}
        </Paragraph>
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
          <Text className="block truncate text-sm font-medium text-foreground">
            {source.metadata.title?.trim() || source.value}
          </Text>
          <Text type="secondary" className="block truncate text-xs">
            {source.value}
          </Text>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => onSkip(source)}>
            {t('library.skipAgent')}
          </Button>
          <Button type="primary" onClick={() => onChooseAgent(source)}>
            {t('library.chooseAgent')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
