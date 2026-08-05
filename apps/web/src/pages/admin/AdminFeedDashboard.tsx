import { Card, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import { fetchReportsOverview, type AdminReportRow } from '../../api/admin';
import { AdminDashboardShell, formatCost, formatTokens, useAdminOverview, type AdminKpi } from './dashboard-shared';

const { Text } = Typography;

export function AdminFeedDashboard() {
  const { t, i18n } = useTranslation();
  const { data, loadState, refresh } = useAdminOverview(fetchReportsOverview);

  const totals = data?.totals;
  const kpis: AdminKpi[] = totals
    ? [
        { key: 'reports', label: t('adminFeed.kpi.reports30d'), value: totals.reports30d.toLocaleString(i18n.language) },
        {
          key: 'unread',
          label: t('adminFeed.kpi.unreadRate'),
          value: totals.unreadRate30d != null ? `${Math.round(totals.unreadRate30d * 100)}%` : '–'
        },
        {
          key: 'review',
          label: t('adminFeed.kpi.reviewQueue'),
          value: totals.needsReviewTotal.toLocaleString(i18n.language),
          alert: totals.needsReviewTotal > 0
        },
        { key: 'tokens', label: t('adminFeed.kpi.tokens30d'), value: formatTokens(totals.inputTokens30d + totals.outputTokens30d) },
        { key: 'cost', label: t('adminFeed.kpi.cost30d'), value: formatCost(totals.costUsd30d) },
        {
          key: 'avgTokens',
          label: t('adminFeed.kpi.avgTokens'),
          value: totals.avgTokensPerReport30d != null ? formatTokens(totals.avgTokensPerReport30d) : '–'
        }
      ]
    : [];

  const columns: ColumnsType<AdminReportRow> = [
    {
      title: t('adminFeed.col.report'),
      key: 'report',
      render: (_, row) => (
        <div className="min-w-0 max-w-md">
          <Text className="block truncate">{row.summary}</Text>
          <Text type="secondary" className="block truncate text-xs">
            {row.agentName} · {row.ownerEmail}
          </Text>
        </div>
      )
    },
    {
      title: t('adminFeed.col.model'),
      dataIndex: 'model',
      render: (value: string | null) => value ?? '–'
    },
    {
      title: t('adminFeed.col.tokens'),
      align: 'right',
      render: (_, row) => formatTokens(row.tokens)
    },
    {
      title: t('adminFeed.col.cost'),
      align: 'right',
      render: (_, row) => formatCost(row.costUsd)
    },
    {
      title: t('adminFeed.col.status'),
      key: 'status',
      render: (_, row) => (
        <>
          {row.needsHumanReview && <Tag color="gold">{t('adminFeed.review')}</Tag>}
          {!row.read && <Tag>{t('adminFeed.unread')}</Tag>}
        </>
      )
    },
    {
      title: t('adminFeed.col.created'),
      dataIndex: 'createdAt',
      render: (value: string) => new Date(value).toLocaleString(i18n.language)
    }
  ];

  return (
    <AdminDashboardShell
      title={t('adminFeed.title')}
      subtitle={t('adminFeed.subtitle')}
      loadState={loadState}
      hasData={data != null}
      onRefresh={refresh}
      kpis={kpis}
    >
      <Card size="small" title={t('adminFeed.latestReports')}>
        <Table<AdminReportRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={data?.reports ?? []}
          pagination={false}
          scroll={{ x: 800 }}
        />
      </Card>
    </AdminDashboardShell>
  );
}
