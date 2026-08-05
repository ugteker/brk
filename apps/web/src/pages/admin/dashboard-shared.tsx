import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, Empty, Spin, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '–';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)} min`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export interface AdminKpi {
  key: string;
  label: string;
  value: string;
  alert?: boolean;
}

export function useAdminOverview<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'idle' | 'error'>('loading');

  async function refresh() {
    try {
      setLoadState('loading');
      setData(await fetcher());
      setLoadState('idle');
    } catch {
      setLoadState('error');
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loadState, refresh };
}

export function AdminDashboardShell({
  title,
  subtitle,
  loadState,
  hasData,
  onRefresh,
  kpis,
  children
}: {
  title: string;
  subtitle: string;
  loadState: 'loading' | 'idle' | 'error';
  hasData: boolean;
  onRefresh: () => void;
  kpis: AdminKpi[];
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Title level={3} className="!mb-0">{title}</Title>
          <Text type="secondary">{subtitle}</Text>
        </div>
        <Tooltip title={t('adminDashboard.refresh')}>
          <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loadState === 'loading'} />
        </Tooltip>
      </div>

      {loadState === 'error' ? (
        <Card>
          <Empty description={t('adminDashboard.loadError')}>
            <Button onClick={onRefresh}>{t('adminDashboard.retry')}</Button>
          </Empty>
        </Card>
      ) : !hasData ? (
        <div className="flex justify-center py-16">
          <Spin />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.key} size="small">
                <Text type="secondary" className="block text-xs">{kpi.label}</Text>
                <span className={`text-xl font-semibold ${kpi.alert ? 'text-red-500' : ''}`}>{kpi.value}</span>
              </Card>
            ))}
          </div>
          {children}
        </>
      )}
    </div>
  );
}
