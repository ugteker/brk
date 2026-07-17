import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AudioOutlined,
  BellOutlined,
  DatabaseOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  LogoutOutlined,
  RobotOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Layout, Popover, Tag, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useTheme } from '../theme/ThemeContext';
import { ThemePicker } from './ThemePicker';
import { TouchSafeTooltip } from './TouchSafeTooltip';
import { WatchlistMenu } from './WatchlistMenu';
import { UsageBudgetModal } from './UsageBudgetModal';
import { seedDemoData } from '../api/admin';

const { Header, Content } = Layout;
const { Title } = Typography;

// Always visible to every user, in both normal and admin mode.
const COMMON_NAV_ITEMS = [
  { path: '/', key: 'feed', icon: <FileTextOutlined />, labelKey: 'nav.feed' },
  { path: '/library', key: 'library', icon: <DatabaseOutlined />, labelKey: 'nav.library' },
  { path: '/studio', key: 'studio', icon: <AudioOutlined />, labelKey: 'studio.title' }
];

// Only shown to admins with admin mode switched on (via the account menu toggle).
const ADMIN_NAV_ITEMS = [
  { path: '/admin/users', key: 'admin-users', icon: <TeamOutlined />, labelKey: 'nav.userManagement' },
  { path: '/agents', key: 'agents', icon: <RobotOutlined />, labelKey: 'nav.agents' },
  { path: '/playbooks', key: 'playbooks', icon: <DashboardOutlined />, labelKey: 'nav.playbooks' }
];

function headerStyle(theme: 'light' | 'dark', isScrolled: boolean): CSSProperties {
  return {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    background: theme === 'dark' ? 'rgba(18,18,24,0.68)' : 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
    borderBottom: theme === 'dark' ? '1px solid rgba(179,127,235,0.35)' : '1px solid rgba(114,46,209,0.28)',
    boxShadow: isScrolled
      ? theme === 'dark'
        ? '0 8px 24px rgba(0,0,0,0.5)'
        : '0 8px 24px rgba(15,23,42,0.10)'
      : theme === 'dark'
        ? '0 4px 16px rgba(0,0,0,0.3)'
        : '0 2px 10px rgba(15,23,42,0.06)',
    height: 'auto',
    padding: 'clamp(12px, 3vw, 24px) clamp(12px, 3vw, 24px)',
    transition: 'box-shadow 0.25s ease, background 0.25s ease'
  };
}

const navRailStyle = (theme: 'light' | 'dark'): CSSProperties => ({
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: 6,
  borderRadius: 999,
  background: theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)'
});

function navButtonStyle(isActive: boolean, isStudio: boolean, theme: 'light' | 'dark'): CSSProperties {
  const studioActiveShadow = '0 2px 8px rgba(114,46,209,0.4), 0 0 0 1px rgba(114,46,209,0.2)';
  const defaultActiveShadow =
    theme === 'dark'
      ? '0 2px 8px rgba(24,144,255,0.45), 0 0 0 1px rgba(24,144,255,0.25)'
      : '0 2px 8px rgba(24,144,255,0.35), 0 0 0 1px rgba(24,144,255,0.15)';

  return {
    fontWeight: isActive ? 600 : 400,
    borderRadius: 999,
    paddingLeft: 16,
    paddingRight: 16,
    boxShadow: isActive ? (isStudio ? studioActiveShadow : defaultActiveShadow) : 'none',
    transition: 'background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease',
    ...(isStudio
      ? isActive
        ? { background: '#722ed1', borderColor: '#722ed1' }
        : theme === 'dark'
          ? { color: '#b37feb', background: 'rgba(114,46,209,0.16)' }
          : { color: '#722ed1', background: '#f9f0ff' }
      : {})
  };
}

const actionClusterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 6px',
  borderRadius: 999
};

const circleActionStyle: CSSProperties = {
  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
};

function activeKey(pathname: string): string {
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname === '/library') return 'library';
  if (pathname === '/agents') return 'agents';
  if (pathname === '/playbooks') return 'playbooks';
  if (pathname.startsWith('/admin/users')) return 'admin-users';
  return 'feed';
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { theme } = useTheme();
  const {
    failedRunNotices,
    bellDismissedIds,
    setBellDismissedIds,
    refreshAgents, refreshSources, refreshPlaybooks,
    forceShowOnboarding, setForceShowOnboarding,
    adminMode, setAdminMode
  } = useAppData();

  const [bellOpen, setBellOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 4);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const current = activeKey(pathname);
  const unread = failedRunNotices.filter((n) => !bellDismissedIds.has(n.runId));
  const navItems = [...COMMON_NAV_ITEMS, ...(isAdmin && adminMode ? ADMIN_NAV_ITEMS : [])];

  const userMenuItems = [
    ...(user ? [{ key: 'user-label', label: <span className="font-medium">{user.displayName ?? user.email}</span>, disabled: true }] : []),
    ...(user ? [{ type: 'divider' as const }] : []),
    ...(isAdmin ? [
      {
        key: 'admin-mode-toggle',
        label: adminMode ? t('nav.adminModeDisable') : t('nav.adminModeEnable'),
        icon: <TeamOutlined />,
        onClick: () => setAdminMode((prev) => !prev)
      },
      {
        key: 'admin-preview-onboarding',
        label: forceShowOnboarding ? t('onboarding.hidePreview') : t('onboarding.showPreview'),
        icon: <RobotOutlined />,
        onClick: () => {
          setForceShowOnboarding((prev) => !prev);
          navigate('/library');
        }
      },
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
      <Header style={headerStyle(theme, isScrolled)}>
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
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                transition: 'opacity 0.15s ease'
              }}
            >
              ChatTrader
            </Title>
            {isAdmin && adminMode && (
              <Tag color="orange" icon={<TeamOutlined />} style={{ fontSize: 12, borderRadius: 999 }}>
                {t('nav.modeAdmin')}
              </Tag>
            )}
          </div>

          {/* Nav */}
          <nav style={navRailStyle(theme)}>
            {navItems.map((item) => {
              const isActive = current === item.key;
              const isStudio = item.key === 'studio';
              return (
                <Button
                  key={item.key}
                  type={isActive ? 'primary' : 'text'}
                  icon={item.icon}
                  onClick={() => navigate(item.path)}
                  size="middle"
                  style={navButtonStyle(isActive, isStudio, theme)}
                >
                  {t(item.labelKey)}
                </Button>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="ct-header-actions flex items-center gap-2 flex-wrap justify-end" style={actionClusterStyle}>
            <WatchlistMenu />
            <ThemePicker />
            <TouchSafeTooltip title={t('language.switchTo')}>
              <Button
                size="small"
                type="text"
                onClick={() => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')}
                style={{ fontWeight: 600, minWidth: 32, borderRadius: 999, ...circleActionStyle }}
              >
                {t('language.current')}
              </Button>
            </TouchSafeTooltip>

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
              <TouchSafeTooltip title={t('nav.bellRunFailures')}>
                <Badge count={unread.length} size="small" className={unread.length > 0 ? 'ct-bell-badge-alert' : undefined}>
                  <Button shape="circle" icon={<BellOutlined />} aria-label={t('nav.bellLabel')} style={circleActionStyle} />
                </Badge>
              </TouchSafeTooltip>
            </Popover>

            {/* User menu */}
            <Dropdown trigger={['click']} menu={{ items: userMenuItems }}>
              <TouchSafeTooltip title={t('nav.accountMenu')}>
                <Button shape="circle" icon={<UserOutlined />} aria-label={t('nav.accountMenu')} style={circleActionStyle} />
              </TouchSafeTooltip>
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
