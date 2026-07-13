import { useEffect, useState } from 'react';
import { Button, Empty, Popconfirm, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, DeleteOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { deleteUser, demoteUser, lockUser, listUsers, promoteUser, unlockUser, type AdminUserView } from '../api/admin';
import { getBuildStampLabel } from '../lib/build-info';

const { Title, Paragraph, Text } = Typography;

interface AdminUsersPageProps {
  onBack: () => void;
}

export function AdminUsersPage({ onBack }: AdminUsersPageProps) {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const buildStampLabel = getBuildStampLabel();

  async function refresh() {
    try {
      setLoadState('loading');
      const response = await listUsers();
      setUsers(response);
      setLoadState('idle');
    } catch {
      setLoadState('error');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onToggleLock(target: AdminUserView) {
    setBusyUserId(target.id);
    try {
      const updated = target.locked ? await unlockUser(target.id) : await lockUser(target.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      message.success(target.locked ? 'User unlocked' : 'User locked');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyUserId(null);
    }
  }

  async function onToggleRole(target: AdminUserView) {
    setBusyUserId(target.id);
    try {
      const updated = target.role === 'admin' ? await demoteUser(target.id) : await promoteUser(target.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      message.success(target.role === 'admin' ? 'User demoted' : 'User promoted');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyUserId(null);
    }

    async function onToggleRole(target: AdminUserView) {
      setBusyUserId(target.id);
      try {
        const updated = target.role === 'admin' ? await demoteUser(target.id) : await promoteUser(target.id);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        message.success(target.role === 'admin' ? 'User demoted' : 'User promoted');
      } catch (error) {
        message.error(error instanceof Error ? error.message : 'Action failed');
      } finally {
        setBusyUserId(null);
      }
    }
  }

  async function onDelete(target: AdminUserView) {
    setBusyUserId(target.id);
    try {
      await deleteUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      message.success('User removed');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to remove user');
    } finally {
      setBusyUserId(null);
    }
  }

  const columns: ColumnsType<AdminUserView> = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: 'Name',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (value: string | null) => value ?? <Text type="secondary">—</Text>
    },
    {
      title: 'Sign-in method',
      key: 'method',
      render: (_, record) => (
        <>
          {record.hasPassword ? <Tag>Password</Tag> : null}
          {record.hasGoogleLinked ? <Tag color="blue">Google</Tag> : null}
        </>
      )
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      title: 'Status',
      dataIndex: 'locked',
      key: 'locked',
      render: (locked: boolean) => (locked ? <Tag color="red">Locked</Tag> : <Tag color="green">Active</Tag>)
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: AdminUserView['role']) => (role === 'admin' ? <Tag color="gold">Admin</Tag> : <Tag>User</Tag>)
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <div className="flex justify-end gap-2">
          <Button
            icon={record.locked ? <UnlockOutlined /> : <LockOutlined />}
            onClick={() => onToggleLock(record)}
            loading={busyUserId === record.id}
            aria-label={record.locked ? `Unlock ${record.email}` : `Lock ${record.email}`}
          >
            {record.locked ? 'Unlock' : 'Lock'}
          </Button>
          <Button
            onClick={() => onToggleRole(record)}
            loading={busyUserId === record.id}
            aria-label={`${record.role === 'admin' ? 'Make user' : 'Make admin'} ${record.email}`}
          >
            {record.role === 'admin' ? 'Make user' : 'Make admin'}
          </Button>
          <Popconfirm
            title="Remove this user?"
            description="This permanently deletes their account and agents."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(record)}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={busyUserId === record.id}
              aria-label={`Delete ${record.email}`}
            />
          </Popconfirm>
        </div>
      )
    }
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center gap-3">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="Back to dashboard" />
        <div>
          <Title level={3} style={{ margin: 0 }}>
            User management
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            Lock, unlock, or permanently remove user accounts.
          </Paragraph>
          {buildStampLabel ? (
            <Paragraph type="secondary" style={{ margin: 0 }} data-testid="admin-build-stamp">
              {buildStampLabel}
            </Paragraph>
          ) : null}
        </div>
      </div>
      {loadState === 'loading' && users.length === 0 ? (
        <div className="flex justify-center py-12">
          <Spin size="large" />
        </div>
      ) : loadState === 'error' ? (
        <Empty description="Failed to load users" />
      ) : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loadState === 'loading'}
          pagination={false}
        />
      )}
    </div>
  );
}
