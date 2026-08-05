import { Card, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { fetchSourcesOverview, type AdminSourceRow } from '../../api/admin';
import { AdminDashboardShell, useAdminOverview, type AdminKpi } from './dashboard-shared';

const { Text } = Typography;

export function AdminLibraryDashboard() {
  const { t, i18n } = useTranslation();
  const { data, loadState, refresh } = useAdminOverview(fetchSourcesOverview);

  const totals = data?.totals;
  const kpis: AdminKpi[] = totals
    ? [
        { key: 'sources', label: t('adminLibrary.kpi.sources'), value: `${totals.activeSources} / ${totals.sources}` },
        { key: 'items', label: t('adminLibrary.kpi.items30d'), value: totals.items30d.toLocaleString(i18n.language) },
        {
          key: 'stale',
          label: t('adminLibrary.kpi.stale'),
          value: totals.staleSources.toLocaleString(i18n.language),
          alert: totals.staleSources > 0
        },
        { key: 'unfollowed', label: t('adminLibrary.kpi.unfollowed'), value: totals.unfollowedSources.toLocaleString(i18n.language) }
      ]
    : [];

  const columns: ColumnsType<AdminSourceRow> = [
    {
      title: t('adminLibrary.col.source'),
      key: 'source',
      sorter: (a, b) => a.value.localeCompare(b.value),
      render: (_, row) => (
        <div className="min-w-0 max-w-md">
          <div className="flex items-center gap-2">
            <Text className="truncate">{row.value}</Text>
            <Tag>{row.type}</Tag>
          </div>
          <Text type="secondary" className="block truncate text-xs">{row.ownerEmail}</Text>
        </div>
      )
    },
    {
      title: t('adminLibrary.col.agents'),
      dataIndex: 'agentCount',
      align: 'right',
      sorter: (a, b) => a.agentCount - b.agentCount
    },
    {
      title: t('adminLibrary.col.items30d'),
      dataIndex: 'items30d',
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.items30d - b.items30d
    },
    {
      title: t('adminLibrary.col.lastItem'),
      dataIndex: 'lastItemAt',
      sorter: (a, b) => (a.lastItemAt ? Date.parse(a.lastItemAt) : 0) - (b.lastItemAt ? Date.parse(b.lastItemAt) : 0),
      render: (value: string | null) =>
        value ? <Text className="text-xs">{new Date(value).toLocaleString(i18n.language)}</Text> : <Text type="secondary">–</Text>
    },
    {
      title: t('adminLibrary.col.status'),
      key: 'status',
      render: (_, row) => (
        <>
          {row.status !== 'active' && <Tag color="orange">{row.status}</Tag>}
          {row.stale && <Tag color="red">{t('adminLibrary.stale')}</Tag>}
          {row.agentCount === 0 && <Tag>{t('adminLibrary.unfollowed')}</Tag>}
        </>
      )
    }
  ];

  const typeEntries = Object.entries(totals?.byType ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <AdminDashboardShell
      title={t('adminLibrary.title')}
      subtitle={t('adminLibrary.subtitle')}
      loadState={loadState}
      hasData={data != null}
      onRefresh={refresh}
      kpis={kpis}
    >
      {typeEntries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {typeEntries.map(([type, count]) => (
            <Tag key={type}>{type}: {count}</Tag>
          ))}
        </div>
      )}
      <Card size="small">
        <Table<AdminSourceRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={data?.sources ?? []}
          pagination={(data?.sources.length ?? 0) > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 800 }}
        />
      </Card>
    </AdminDashboardShell>
  );
}
