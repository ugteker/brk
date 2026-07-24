import { Alert, Button, Card, Skeleton, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogSource } from '../../api/catalog';
import type { SourceRecord } from '../../api/sources';
import { useAppData } from '../../context/AppDataContext';
import { GhostCreateCard } from './GhostCreateCard';
import { SampleReportPreview } from './SampleReportPreview';
import { SavedSourceGrid } from './SavedSourceGrid';
import { StarterSourceCard } from './StarterSourceCard';

const { Title, Text } = Typography;

export interface LibraryOverviewProps {
  starterSources: CatalogSource[];
  savedSources: SourceRecord[];
  isCatalogLoading: boolean;
  catalogError: boolean;
  showAddSourceAttention: boolean;
  onAddSource: () => void;
  onSaveStarter: (source: CatalogSource) => Promise<void>;
  onOpenSource: (source: SourceRecord) => void;
  onAddAgent?: (source: SourceRecord) => void | Promise<void>;
  onRetryCatalog: () => void;
  hasAnySavedSources?: boolean;
}

export function LibraryOverview({
  starterSources,
  savedSources,
  isCatalogLoading,
  catalogError,
  showAddSourceAttention,
  onAddSource,
  onSaveStarter,
  onOpenSource,
  onAddAgent,
  onRetryCatalog,
  hasAnySavedSources
}: LibraryOverviewProps) {
  const { t } = useTranslation();
  const { catalogDemos } = useAppData();

  const visibleSampleDemos = useMemo(() => {
    const starterSourceOrder = new Map(starterSources.map((source, index) => [source.publicationId, index]));

    return catalogDemos
      .filter((demo) => demo.report?.report && starterSourceOrder.has(demo.sourcePublicationId))
      .sort((left, right) => {
        const sourceOrderDiff = (starterSourceOrder.get(left.sourcePublicationId) ?? 0) - (starterSourceOrder.get(right.sourcePublicationId) ?? 0);
        if (sourceOrderDiff !== 0) return sourceOrderDiff;
        return left.title.localeCompare(right.title);
      });
  }, [catalogDemos, starterSources]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="library-start-here" className="space-y-4">
        <div className="space-y-1">
          {showAddSourceAttention ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
              {t('library.nextActionLabel')}
            </p>
          ) : null}
          <Title id="library-start-here" level={3} style={{ margin: 0 }}>{t('library.startHere')}</Title>
          <Text type="secondary">{t('library.starterPicks')} · {t('library.curatedForYou')}</Text>
        </div>
        {catalogError && !isCatalogLoading ? (
          <Alert
            type="warning"
            showIcon
            message={t('library.starterLoadError')}
            action={
              <Button size="small" onClick={onRetryCatalog}>
                {t('library.starterLoadRetry')}
              </Button>
            }
          />
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <GhostCreateCard
            attention={showAddSourceAttention}
            ariaLabel={t('library.addSource')}
            onClick={onAddSource}
            icon={<DatabaseOutlined />}
            title={t('library.addSource')}
            sub={showAddSourceAttention ? t('library.nextActionHint') : undefined}
          />
          {isCatalogLoading ? [1, 2, 3].map((item) => (
            <Card key={item} size="small" className="min-h-[170px]">
              <div className="flex items-start gap-3">
                <Skeleton.Avatar active shape="square" size={64} className="shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton.Input active size="small" style={{ width: '45%' }} block />
                  <Skeleton.Input active size="small" style={{ width: '80%' }} block />
                  <Skeleton.Input active size="small" style={{ width: '100%' }} block />
                </div>
              </div>
            </Card>
          )) : starterSources.slice(0, 5).map((source) => (
            <StarterSourceCard key={source.sourceId} source={source} onSave={onSaveStarter} />
          ))}
        </div>
      </section>

      {visibleSampleDemos.length > 0 ? (
        <section aria-labelledby="library-sample-reports" className="space-y-4">
          <div className="space-y-1">
            <Title id="library-sample-reports" level={3} style={{ margin: 0 }}>{t('library.sampleReports')}</Title>
            <Text type="secondary">{t('library.sampleReportDisclosure')}</Text>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleSampleDemos.map((demo) => (
              <SampleReportPreview key={demo.slug} demo={demo} />
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="library-yours" className="space-y-4">
        <Title id="library-yours" level={3} style={{ margin: 0 }}>{t('library.yourLibrary')}</Title>
        <SavedSourceGrid
          sources={savedSources}
          onOpenSource={onOpenSource}
          onAddAgent={onAddAgent}
          hasAnySources={hasAnySavedSources}
        />
      </section>
    </div>
  );
}
