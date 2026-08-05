import { Card, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { fetchDiscussionsOverview, type AdminDiscussionRow } from '../../api/admin';
import { AdminDashboardShell, useAdminOverview, type AdminKpi } from './dashboard-shared';

const { Text } = Typography;

export function AdminStudioDashboard() {
  const { t, i18n } = useTranslation();
  const { data, loadState, refresh } = useAdminOverview(fetchDiscussionsOverview);

  const totals = data?.totals;
  const kpis: AdminKpi[] = totals
    ? [
        { key: 'discussions', label: t('adminStudio.kpi.discussions'), value: totals.discussions.toLocaleString(i18n.language) },
        { key: 'runs', label: t('adminStudio.kpi.runs30d'), value: totals.runs30d.toLocaleString(i18n.language) },
        {
          key: 'failed',
          label: t('adminStudio.kpi.failed30d'),
          value: totals.failedRuns30d.toLocaleString(i18n.language),
          alert: totals.failedRuns30d > 0
        },
        { key: 'turns', label: t('adminStudio.kpi.turns30d'), value: totals.turns30d.toLocaleString(i18n.language) },
        { key: 'audio', label: t('adminStudio.kpi.audio30d'), value: totals.audioRuns30d.toLocaleString(i18n.language) }
      ]
    : [];

  const columns: ColumnsType<AdminDiscussionRow> = [
    {
      title: t('adminStudio.col.discussion'),
      key: 'discussion',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, row) => (
        <div className="min-w-0 max-w-md">
          <div className="flex items-center gap-2">
            <Text strong className="truncate">{row.name}</Text>
            <Tag>{row.format}</Tag>
          </div>
          <Text type="secondary" className="block truncate text-xs">{row.ownerEmail}</Text>
        </div>
      )
    },
    {
      title: t('adminStudio.col.participants'),
      dataIndex: 'participantCount',
      align: 'right',
      sorter: (a, b) => a.participantCount - b.participantCount
    },
    {
      title: t('adminStudio.col.runs'),
      key: 'runs',
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.runsTotal - b.runsTotal,
      render: (_, row) => (
        <>
          <Text>{row.runsTotal}</Text>
          {row.failedRuns > 0 && <Text type="danger"> / {row.failedRuns} ✗</Text>}
        </>
      )
    },
    {
      title: t('adminStudio.col.turns'),
      dataIndex: 'turnsTotal',
      align: 'right',
      sorter: (a, b) => a.turnsTotal - b.turnsTotal
    },
    {
      title: t('adminStudio.col.audio'),
      dataIndex: 'audioRuns',
      align: 'right',
      sorter: (a, b) => a.audioRuns - b.audioRuns
    },
    {
      title: t('adminStudio.col.lastRun'),
      key: 'lastRun',
      sorter: (a, b) => (a.lastRunAt ? Date.parse(a.lastRunAt) : 0) - (b.lastRunAt ? Date.parse(b.lastRunAt) : 0),
      render: (_, row) =>
        row.lastRunAt ? (
          <div>
            <Text className="text-xs">{new Date(row.lastRunAt).toLocaleString(i18n.language)}</Text>
            {row.lastRunStatus === 'failed' && <Tag color="red" className="ml-1">{t('adminStudio.runFailed')}</Tag>}
          </div>
        ) : (
          <Text type="secondary">–</Text>
        )
    }
  ];

  return (
    <AdminDashboardShell
      title={t('adminStudio.title')}
      subtitle={t('adminStudio.subtitle')}
      loadState={loadState}
      hasData={data != null}
      onRefresh={refresh}
      kpis={kpis}
    >
      <Card size="small">
        <Table<AdminDiscussionRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={data?.discussions ?? []}
          pagination={(data?.discussions.length ?? 0) > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 800 }}
        />
      </Card>
    </AdminDashboardShell>
  );
}
