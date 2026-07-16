import { useState, type ReactNode } from 'react';
import {
  AudioOutlined,
  BellOutlined,
  DatabaseOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  LogoutOutlined,
  RobotOutlined,
  UserOutlined
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Layout, Popover, Tag, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { ThemePicker } from './ThemePicker';
import { WatchlistMenu } from './WatchlistMenu';
import { UsageBudgetModal } from './UsageBudgetModal';
import { seedDemoData } from '../api/admin';

const { Header, Content } = Layout;
const { Title } = Typography;

const NAV_ITEMS = [
  { path: '/', key: 'feed', icon: <FileTextOutlined />, labelKey: 'nav.feed' },
  { path: '/library', key: 'library', icon: <DatabaseOutlined />, labelKey: 'nav.library' },
  { path: '/agents', key: 'agents', icon: <RobotOutlined />, labelKey: 'nav.agents' },
  { path: '/playbooks', key: 'playbooks', icon: <DashboardOutlined />, labelKey: 'nav.playbooks' },
  { path: '/studio', key: 'studio', icon: <AudioOutlined />, labelKey: 'studio.title' }
];

function activeKey(pathname: string): string {
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname === '/library') return 'library';
  if (pathname === '/agents') return 'agents';
  if (pathname === '/playbooks') return 'playbooks';
  return 'feed';
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const {
    failedRunNotices,
    bellDismissedIds,
    setBellDismissedIds,
    refreshAgents, refreshSources, refreshPlaybooks
  } = useAppData();

  const [bellOpen, setBellOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);

  const current = activeKey(pathname);
  const unread = failedRunNotices.filter((n) => !bellDismissedIds.has(n.runId));

  const userMenuItems = [
    ...(user ? [{ key: 'user-label', label: <span className="font-medium">{user.displayName ?? user.email}</span>, disabled: true }] : []),
    ...(user ? [{ type: 'divider' as const }] : []),
    ...(isAdmin ? [
      {
        key: 'admin-seed-demo',
        label: t('admin.seedDemo'),
        icon: <DatabaseOutlined />,
        onClick: async () => {
          try {
            await seedDemoData();
            message.success(t('admin.seedDemoSuccess'));
            await Promise.all([refreshAgents(), refreshSources(), refreshPlaybooks()]);
          } catch (err: unknown) {
            if (err instanceof Error && err.message === 'already_exists') {
              message.info(t('admin.seedDemoAlreadyExists'));
            } else {
              message.error(t('admin.seedDemoError'));
            }
          }
        }
      },
      { type: 'divider' as const }
    ] : []),
    {
      key: 'usage-budget',
      label: t('usage.menuLabel'),
      icon: <DollarOutlined />,
      onClick: () => setUsageModalOpen(true)
    },
    {
      key: 'logout',
      label: t('nav.logOut'),
      icon: <LogoutOutlined />,
      onClick: () => logout()
    }
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header
        style={{
          background: 'transparent',
          height: 'auto',
          padding: 'clamp(12px, 3vw, 24px) clamp(12px, 3vw, 24px) 0'
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 flex-wrap">
          {/* Logo */}
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Title
              level={2}
              onClick={() => navigate('/')}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/'); }}
              style={{
                margin: 0,
                whiteSpace: 'nowrap',
                fontSize: 'clamp(1.25rem, 5vw, 1.875rem)',
                cursor: 'pointer'
              }}
            >
              ChatTrader
            </Title>
            {isAdmin && (
              <Tag color="green" icon={<DashboardOutlined />} style={{ fontSize: 12 }}>
                {t('nav.modeDashboard')}
              </Tag>
            )}
          </div>

          {/* Nav */}
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.key}
                type={current === item.key ? 'primary' : 'text'}
                icon={item.icon}
                onClick={() => navigate(item.path)}
                size="small"
                style={{ fontWeight: current === item.key ? 600 : 400 }}
              >
                {t(item.labelKey)}
              </Button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="ct-header-actions flex items-center gap-2 flex-wrap justify-end">
            <WatchlistMenu />
            <ThemePicker />
            <Button
              size="small"
              type="text"
              onClick={() => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')}
              title={t('language.switchTo')}
              style={{ fontWeight: 600, minWidth: 32 }}
            >
              {t('language.current')}
            </Button>

            {/* Bell */}
            <Popover
              open={bellOpen}
              onOpenChange={setBellOpen}
              trigger="click"
              title={
                <div className="flex items-center justify-between gap-4">
                  <span>{t('nav.bellRunFailures')}</span>
                  {failedRunNotices.length > 0 && (
                    <Button
                      size="small"
                      type="text"
                      onClick={() => {
                        const newSet = new Set(failedRunNotices.map((n) => n.runId));
                        setBellDismissedIds(newSet);
                        localStorage.setItem('chattrader:bell:dismissed', JSON.stringify([...newSet]));
                      }}
                    >
                      {t('nav.bellClearAll')}
                    </Button>
                  )}
                </div>
              }
              content={
                <div className="w-72 space-y-2 max-h-80 overflow-y-auto">
                  {failedRunNotices.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2 text-center">{t('nav.bellEmpty')}</p>
                  ) : (
                    [...failedRunNotices].reverse().map((n) => (
                      <div
                        key={n.runId}
                        className={`rounded-lg border px-3 py-2 text-xs ${bellDismissedIds.has(n.runId) ? 'opacity-40 border-gray-200' : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'}`}
                      >
                        <p className="font-semibold text-red-700 dark:text-red-300 truncate">{n.agentName}</p>
                        <p className="text-red-500 dark:text-red-400 truncate">{n.errorMessage ?? 'Run failed'}</p>
                        {n.timestamp ? <p className="text-gray-400 mt-0.5">{new Date(n.timestamp).toLocaleString()}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              }
            >
              <Badge count={unread.length} size="small">
                <Button shape="circle" icon={<BellOutlined />} aria-label={t('nav.bellLabel')} />
              </Badge>
            </Popover>

            {/* User menu */}
            <Dropdown trigger={['click']} menu={{ items: userMenuItems }}>
              <Button shape="circle" icon={<UserOutlined />} aria-label={t('nav.accountMenu')} />
            </Dropdown>

            <UsageBudgetModal open={usageModalOpen} onClose={() => setUsageModalOpen(false)} />
          </div>
        </div>
      </Header>
      <Content style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
        {children}
      </Content>
    </Layout>
  );
}
