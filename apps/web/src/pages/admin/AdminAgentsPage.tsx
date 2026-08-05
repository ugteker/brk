import { useMemo, useState } from 'react';
import { App, Button, Card, Empty, Input, Popconfirm, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
  deleteAgentAsAdmin,
  fetchAgentsOverview,
  pauseAgentAsAdmin,
  resumeAgentAsAdmin,
  type AdminAgentOverviewRow
} from '../../api/admin';
import { AdminDashboardShell, formatCost, formatDuration, formatTokens, useAdminOverview, type AdminKpi } from './dashboard-shared';

const { Text } = Typography;

const RUN_DOT_COLORS: Record<string, string> = {
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  running: 'bg-violet-500'
};

export function AdminAgentsPage() {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const { data, loadState, refresh } = useAdminOverview(fetchAgentsOverview);
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filteredAgents = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return data.agents;
    return data.agents.filter(
      (a) => a.name.toLowerCase().includes(needle) || a.ownerEmail.toLowerCase().includes(needle)
    );
  }, [data, search]);

  async function onToggleStatus(row: AdminAgentOverviewRow) {
    setBusyAgentId(row.id);
    try {
      if (row.status === 'active') {
        await pauseAgentAsAdmin(row.id);
        message.success(t('adminAgents.paused'));
      } else {
        await resumeAgentAsAdmin(row.id);
        message.success(t('adminAgents.resumed'));
      }
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('adminAgents.actionFailed'));
    } finally {
      setBusyAgentId(null);
    }
  }

  async function onDelete(row: AdminAgentOverviewRow) {
    setBusyAgentId(row.id);
    try {
      await deleteAgentAsAdmin(row.id);
      message.success(t('adminAgents.deleted'));
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('adminAgents.actionFailed'));
    } finally {
      setBusyAgentId(null);
    }
  }

  const totals = data?.totals;
  const successRate = totals?.successRate30d != null ? `${Math.round(totals.successRate30d * 100)}%` : '–';

  const kpis: AdminKpi[] = totals
    ? [
        { key: 'agents', label: t('adminAgents.kpi.agents'), value: `${totals.activeAgents} / ${totals.agents}` },
        { key: 'runs', label: t('adminAgents.kpi.runs30d'), value: totals.runs30d.toLocaleString(i18n.language) },
        { key: 'success', label: t('adminAgents.kpi.successRate'), value: successRate },
        {
          key: 'failed',
          label: t('adminAgents.kpi.failed24h'),
          value: totals.failed24h.toLocaleString(i18n.language),
          alert: totals.failed24h > 0
        },
        { key: 'reports', label: t('adminAgents.kpi.reports30d'), value: totals.reports30d.toLocaleString(i18n.language) },
        {
          key: 'tokens',
          label: t('adminAgents.kpi.tokens30d'),
          value: formatTokens(totals.inputTokens30d + totals.outputTokens30d)
        },
        { key: 'cost', label: t('adminAgents.kpi.cost30d'), value: formatCost(totals.costUsd30d) },
        { key: 'duration', label: t('adminAgents.kpi.avgDuration'), value: formatDuration(totals.avgRunMs30d) }
      ]
    : [];

  const columns: ColumnsType<AdminAgentOverviewRow> = [
    {
      title: t('adminAgents.col.agent'),
      key: 'agent',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Text strong className="truncate">{row.name}</Text>
            {row.status === 'active' ? (
              <Tag color="green">{t('adminAgents.status.active')}</Tag>
            ) : (
              <Tag color="orange">{t('adminAgents.status.paused')}</Tag>
            )}
          </div>
          <Text type="secondary" className="block truncate text-xs">{row.ownerEmail}</Text>
        </div>
      )
    },
    {
      title: t('adminAgents.col.subscriptions'),
      dataIndex: 'playbookCount',
      align: 'right',
      sorter: (a, b) => a.playbookCount - b.playbookCount
    },
    {
      title: t('adminAgents.col.sources'),
      dataIndex: 'sourceCount',
      align: 'right',
      sorter: (a, b) => a.sourceCount - b.sourceCount
    },
    {
      title: t('adminAgents.col.discussions'),
      dataIndex: 'discussionCount',
      align: 'right',
      sorter: (a, b) => a.discussionCount - b.discussionCount
    },
    {
      title: t('adminAgents.col.runs30d'),
      key: 'runs30d',
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.runs30d - b.runs30d,
      render: (_, row) => (
        <div>
          <div>
            <Text>{row.completed30d}</Text>
            {row.failed30d > 0 && <Text type="danger"> / {row.failed30d} ✗</Text>}
          </div>
          <div className="flex justify-end gap-0.5 pt-0.5">
            {row.recentRunStatuses.slice(0, 10).map((status, index) => (
              <span
                key={index}
                className={`inline-block h-1.5 w-1.5 rounded-full ${RUN_DOT_COLORS[status] ?? 'bg-gray-400'}`}
              />
            ))}
          </div>
        </div>
      )
    },
    {
      title: t('adminAgents.col.lastRun'),
      key: 'lastRun',
      sorter: (a, b) => (a.lastRunAt ? Date.parse(a.lastRunAt) : 0) - (b.lastRunAt ? Date.parse(b.lastRunAt) : 0),
      render: (_, row) =>
        row.lastRunAt ? (
          <div>
            <Text className="text-xs">{new Date(row.lastRunAt).toLocaleString(i18n.language)}</Text>
            {row.lastRunStatus === 'failed' && (
              <Tag color="red" className="ml-1">{t('adminAgents.runFailed')}</Tag>
            )}
          </div>
        ) : (
          <Text type="secondary">–</Text>
        )
    },
    {
      title: t('adminAgents.col.reports'),
      dataIndex: 'reportsTotal',
      align: 'right',
      sorter: (a, b) => a.reportsTotal - b.reportsTotal,
      render: (_, row) => (
        <Tooltip title={t('adminAgents.reports30dTooltip', { count: row.reports30d })}>
          <span>{row.reportsTotal}</span>
        </Tooltip>
      )
    },
    {
      title: t('adminAgents.col.tokens30d'),
      key: 'tokens',
      align: 'right',
      sorter: (a, b) => a.inputTokens30d + a.outputTokens30d - (b.inputTokens30d + b.outputTokens30d),
      render: (_, row) => formatTokens(row.inputTokens30d + row.outputTokens30d)
    },
    {
      title: t('adminAgents.col.cost30d'),
      key: 'cost',
      align: 'right',
      sorter: (a, b) => a.costUsd30d - b.costUsd30d,
      render: (_, row) => formatCost(row.costUsd30d)
    },
    {
      title: t('adminAgents.col.review'),
      dataIndex: 'needsReviewCount',
      align: 'right',
      sorter: (a, b) => a.needsReviewCount - b.needsReviewCount,
      render: (value: number) => (value > 0 ? <Tag color="gold">{value}</Tag> : <Text type="secondary">–</Text>)
    },
    {
      key: 'actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex justify-end gap-1">
          <Tooltip title={row.status === 'active' ? t('adminAgents.pause') : t('adminAgents.resume')}>
            <Button
              type="text"
              size="small"
              loading={busyAgentId === row.id}
              icon={row.status === 'active' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => onToggleStatus(row)}
            />
          </Tooltip>
          <Popconfirm
            title={t('adminAgents.deleteConfirm')}
            description={t('adminAgents.deleteConfirmDescription')}
            okText={t('adminAgents.delete')}
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(row)}
          >
            <Tooltip title={t('adminAgents.delete')}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} loading={busyAgentId === row.id} />
            </Tooltip>
          </Popconfirm>
        </div>
      )
    }
  ];

  return (
    <AdminDashboardShell
      title={t('adminAgents.title')}
      subtitle={t('adminAgents.subtitle')}
      loadState={loadState}
      hasData={data != null}
      onRefresh={refresh}
      kpis={kpis}
    >
      <Card size="small">
        <div className="mb-3">
          <Input
            allowClear
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder={t('adminAgents.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Table<AdminAgentOverviewRow>
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={filteredAgents}
          pagination={filteredAgents.length > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 900 }}
          locale={{ emptyText: <Empty description={t('adminAgents.empty')} /> }}
        />
      </Card>
    </AdminDashboardShell>
  );
}
