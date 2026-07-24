import { Button, Card, Drawer, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CharacterReportRenderer } from '../CharacterReportRenderer';
import type { CatalogDemo } from '../../api/catalog';

const { Text } = Typography;

interface SampleReportPreviewProps {
  demo: CatalogDemo;
}

export function SampleReportPreview({ demo }: SampleReportPreviewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const report = demo.report.report;

  if (!report) {
    return null;
  }

  return (
    <>
      <Card size="small" className="h-full min-h-[180px]">
        <div className="flex h-full flex-col gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color="blue" className="m-0">{t('library.sampleReport')}</Tag>
              <Text type="secondary" className="text-xs">{demo.title}</Text>
            </div>
            <div className="text-base font-semibold leading-snug text-foreground">{demo.report.summary}</div>
            <Text type="secondary" className="block text-xs leading-relaxed">{demo.disclosure}</Text>
          </div>
          <div className="mt-auto flex justify-end">
            <Button type="primary" onClick={() => setOpen(true)}>
              {t('library.sampleReportOpen')}
            </Button>
          </div>
        </div>
      </Card>

      <Drawer
        title={
          <div className="flex flex-wrap items-center gap-2">
            <Tag color="blue" className="m-0">{t('library.sampleReport')}</Tag>
            <span className="text-base font-semibold text-foreground">{demo.title}</span>
          </div>
        }
        open={open}
        onClose={() => setOpen(false)}
        width={720}
        destroyOnClose
      >
        <div className="space-y-4">
          <Text type="secondary" className="block text-sm leading-relaxed">{demo.disclosure}</Text>
          <CharacterReportRenderer report={report} />
        </div>
      </Drawer>
    </>
  );
}
