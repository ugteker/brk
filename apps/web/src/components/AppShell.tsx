import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  AudioOutlined,
  BellOutlined,
  DatabaseOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  GlobalOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  RobotOutlined,
  SunOutlined,
  TeamOutlined,
  UserOutlined
} from '@ant-design/icons';
import { Badge, Button, Drawer, Dropdown, Layout, Menu, Popover, Tag, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { useSafeNavigate } from '../utils/useSafeNavigate';
import { useAuth } from '../auth/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { useTheme } from '../theme/ThemeContext';
import { getBuildStampLabel } from '../lib/build-info';
import { BrandLockup } from './BrandLockup';
import { TouchSafeTooltip } from './TouchSafeTooltip';
import { WatchlistMenu } from './WatchlistMenu';
import { UsageBudgetModal } from './UsageBudgetModal';
import { seedDemoData } from '../api/admin';

const { Header, Content } = Layout;
const { Text } = Typography;

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
    // Faint aurora bleed across the whole header, matching the D1 nav rail.
    background: theme === 'dark'
      ? 'radial-gradient(90% 160% at 12% 0%, rgba(167,139,250,0.12), transparent 55%), radial-gradient(90% 160% at 88% 100%, rgba(59,130,246,0.08), transparent 55%), rgba(18,18,24,0.68)'
      : 'radial-gradient(90% 160% at 12% 0%, rgba(196,181,253,0.22), transparent 55%), radial-gradient(90% 160% at 88% 100%, rgba(147,197,253,0.16), transparent 55%), rgba(255,255,255,0.72)',
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
  // Aurora glass: violet/blue light bleeding through a translucent pane.
  background: theme === 'dark'
    ? 'radial-gradient(120% 180% at 15% 0%, rgba(167,139,250,0.28), transparent 55%), radial-gradient(120% 180% at 85% 100%, rgba(59,130,246,0.18), transparent 55%), rgba(255,255,255,0.06)'
    : 'radial-gradient(120% 180% at 15% 0%, rgba(196,181,253,0.5), transparent 55%), radial-gradient(120% 180% at 85% 100%, rgba(147,197,253,0.4), transparent 55%), rgba(255,255,255,0.45)',
  backdropFilter: 'blur(20px) saturate(170%)',
  WebkitBackdropFilter: 'blur(20px) saturate(170%)',
  border: theme === 'dark' ? '1px solid rgba(196,181,253,0.4)' : '1px solid rgba(139,92,246,0.35)',
  boxShadow: theme === 'dark'
    ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 0 0 1px rgba(124,58,237,0.15), 0 12px 36px rgba(91,33,182,0.35)'
    : 'inset 0 1px 0 rgba(255,255,255,1), 0 0 0 1px rgba(124,58,237,0.1), 0 12px 36px rgba(91,33,182,0.18)'
});

function navButtonStyle(isActive: boolean, theme: 'light' | 'dark'): CSSProperties {
  const style: CSSProperties = {
    fontWeight: isActive ? 600 : 400,
    borderRadius: 999,
    height: 40,
    paddingLeft: 20,
    paddingRight: 20,
    border: '1px solid transparent',
    color: isActive ? (theme === 'dark' ? '#fff' : '#4c1d95') : theme === 'dark' ? '#e9e5f5' : '#4c4560',
    transition: 'background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease'
  };
  if (isActive) {
    // Glowing aurora capsule for the active tab (matches the approved D1 mockup).
    style.background = theme === 'dark'
      ? 'radial-gradient(140% 200% at 50% -30%, rgba(255,255,255,0.4), transparent 60%), linear-gradient(135deg, rgba(139,92,246,0.5), rgba(99,102,241,0.4))'
      : 'radial-gradient(140% 200% at 50% -30%, #fff, transparent 60%), linear-gradient(135deg, rgba(196,181,253,0.75), rgba(165,180,252,0.6))';
    style.borderColor = theme === 'dark' ? 'rgba(221,214,254,0.7)' : 'rgba(114,46,209,0.4)';
    style.boxShadow = theme === 'dark'
      ? 'inset 0 1px 0 rgba(255,255,255,0.45), 0 0 22px rgba(139,92,246,0.6)'
      : 'inset 0 1px 0 rgba(255,255,255,1), 0 0 22px rgba(139,92,246,0.4)';
  }
  return style;
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
  const navigate = useSafeNavigate();
  const { pathname } = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    failedRunNotices,
    newReportNotices,
    discussionNotices,
    bellDismissedIds,
    setBellDismissedIds,
    refreshAgents, refreshSources, refreshPlaybooks,
    adminMode, setAdminMode
  } = useAppData();

  const [bellOpen, setBellOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const buildStampLabel = getBuildStampLabel();

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 4);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const current = activeKey(pathname);
  type BellNotice = { id: string; kind: 'run_failed' | 'new_report' | 'show_started' | 'show_finished' | 'audio_ready'; agentName: string; message: string; timestamp: string };
  const combinedNotices: BellNotice[] = [
    ...failedRunNotices.map((n) => ({ id: n.runId, kind: 'run_failed' as const, agentName: n.agentName, message: n.errorMessage ?? t('nav.bellRunFailed'), timestamp: n.timestamp })),
    ...newReportNotices.map((n) => ({ id: n.reportId, kind: 'new_report' as const, agentName: n.agentName, message: n.summary, timestamp: n.timestamp })),
    ...discussionNotices.map((n) => ({
      id: n.id,
      kind: n.kind,
      agentName: n.discussionName,
      message: t(`nav.bell_${n.kind}`),
      timestamp: n.timestamp
    }))
  ].sort((a, b) => (Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0));
  const unread = combinedNotices.filter((n) => !bellDismissedIds.has(n.id));
  const navItems = [...COMMON_NAV_ITEMS, ...(isAdmin && adminMode ? ADMIN_NAV_ITEMS : [])];

  const userMenuItems = [
    ...(user ? [{ key: 'user-label', label: <span className="font-medium">{user.displayName ?? user.email}</span>, disabled: true }] : []),
    ...(user ? [{ type: 'divider' as const }] : []),
    // Quick access to open the admin Agents & Playbooks area for admins
    ...(isAdmin ? [{ key: 'admin-open-area', label: t('nav.adminArea'), icon: <TeamOutlined />, onClick: () => setAdminMode(true) }] : []),
    {
      key: 'theme-toggle',
      label: theme === 'dark' ? t('nav.themeToLight') : t('nav.themeToDark'),
      icon: theme === 'dark' ? <SunOutlined /> : <MoonOutlined />,
      onClick: () => toggleTheme()
    },
    {
      key: 'language-toggle',
      label: t('language.switchTo'),
      icon: <GlobalOutlined />,
      onClick: () => i18n.changeLanguage(i18n.language.startsWith('de') ? 'en' : 'de')
    },
    { type: 'divider' as const },
    ...(isAdmin ? [
      {
        key: 'admin-mode-toggle',
        label: adminMode ? t('nav.adminModeDisable') : t('nav.adminModeEnable'),
        icon: <TeamOutlined />,
        onClick: () => setAdminMode((prev) => !prev)
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
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{
                  appearance: 'none',
                  background: 'transparent',
                  border: 0,
                  color: 'inherit',
                  display: 'flex',
                  lineHeight: 0,
                  margin: 0,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'opacity 0.15s ease'
                }}
              >
                <BrandLockup size={34} textSize={26} inverse={theme === 'dark'} />
              </button>
              {isAdmin && adminMode && (
                <Tag color="orange" icon={<TeamOutlined />} style={{ fontSize: 12, borderRadius: 999 }}>
                  {t('nav.modeAdmin')}
                </Tag>
              )}
            </div>
            {buildStampLabel ? (
              <Text type="secondary" style={{ fontSize: 12 }} data-testid="app-build-stamp">
                {buildStampLabel}
              </Text>
            ) : null}
          </div>

          {/* Nav — hidden on mobile, visible on sm+ */}
          <div className="hidden sm:block">
            <nav style={navRailStyle(theme)}>
              {navItems.map((item) => {
                const isActive = current === item.key;
                return (
                  <Button
                    key={item.key}
                    type="text"
                    icon={item.icon}
                    onClick={() => navigate(item.path)}
                    size="middle"
                    style={navButtonStyle(isActive, theme)}
                  >
                    {t(item.labelKey)}
                  </Button>
                );
              })}
            </nav>
          </div>

          {/* Right actions — Bell always visible; account icon + hamburger toggle by breakpoint */}
          <div className="ct-header-actions flex items-center gap-2 flex-wrap justify-end" style={actionClusterStyle}>
            <WatchlistMenu />

            {/* Bell */}
            <Badge count={unread.length} size="small" className={unread.length > 0 ? 'ct-bell-badge-alert' : undefined}>
              <Popover
                open={bellOpen}
                onOpenChange={setBellOpen}
                trigger="click"
                title={
                  <div className="flex items-center justify-between gap-4">
                    <span>{t('nav.bellTitle')}</span>
                    {combinedNotices.length > 0 && (
                      <Button
                        size="small"
                        type="text"
                        onClick={() => {
                          const newSet = new Set(combinedNotices.map((n) => n.id));
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
                    {combinedNotices.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2 text-center">{t('nav.bellEmpty')}</p>
                    ) : (
                      [...combinedNotices].reverse().map((n) => {
                        const tone = n.kind === 'run_failed'
                          ? { box: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950', title: 'text-red-700 dark:text-red-300', body: 'text-red-500 dark:text-red-400' }
                          : n.kind === 'new_report'
                            ? { box: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950', title: 'text-green-700 dark:text-green-300', body: 'text-green-600 dark:text-green-400' }
                            : { box: 'border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950', title: 'text-violet-700 dark:text-violet-300', body: 'text-violet-600 dark:text-violet-400' };
                        return (
                        <div
                          key={n.id}
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            bellDismissedIds.has(n.id) ? 'opacity-40 border-gray-200' : tone.box
                          }`}
                        >
                          <p className={`font-semibold truncate ${tone.title}`}>
                            {n.agentName}
                          </p>
                          <p className={`truncate ${tone.body}`}>
                            {n.kind === 'new_report' ? `${t('nav.bellNewReport')}: ` : ''}{n.message}
                          </p>
                          {n.timestamp ? <p className="text-gray-400 mt-0.5">{new Date(n.timestamp).toLocaleString()}</p> : null}
                        </div>
                        );
                      })
                    )}
                  </div>
                }
              >
                <Button shape="circle" icon={<BellOutlined />} aria-label={t('nav.bellLabel')} style={circleActionStyle} />
              </Popover>
            </Badge>

            {/* User menu — desktop only */}
            <span className="hidden sm:inline-flex">
              <Dropdown trigger={['click']} menu={{ items: userMenuItems }}>
                <TouchSafeTooltip title={t('nav.accountMenu')}>
                  <Button shape="circle" icon={<UserOutlined />} aria-label={t('nav.accountMenu')} style={circleActionStyle} />
                </TouchSafeTooltip>
              </Dropdown>
            </span>

            {/* Account and admin actions — mobile only */}
            <span className="flex sm:hidden">
              <Button
                shape="circle"
                icon={<MenuOutlined />}
                aria-label={t('nav.mobileMenu')}
                style={circleActionStyle}
                onClick={() => setMobileMenuOpen(true)}
              />
            </span>

            <UsageBudgetModal open={usageModalOpen} onClose={() => setUsageModalOpen(false)} />
          </div>
        </div>
      </Header>
      <Content className="p-[clamp(12px,3vw,24px)] pb-24 sm:pb-6">
        {children}
      </Content>

      <nav
        aria-label="Mobile navigation"
        className="aurora-glass fixed inset-x-0 bottom-0 z-30 flex px-2 pt-2 sm:hidden"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}
      >
        {COMMON_NAV_ITEMS.map((item) => {
          const isActive = current === item.key;
          return (
            <Button
              key={item.key}
              type="text"
              icon={item.icon}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => navigate(item.path)}
              className={`h-auto flex-1 !rounded-lg !px-1 !py-1.5 text-xs ${
                isActive ? '!text-violet-700 dark:!text-white' : 'text-muted-foreground'
              }`}
              style={isActive ? {
                background: theme === 'dark'
                  ? 'radial-gradient(140% 200% at 50% -30%, rgba(255,255,255,0.4), transparent 60%), linear-gradient(135deg, rgba(139,92,246,0.5), rgba(99,102,241,0.4))'
                  : 'radial-gradient(140% 200% at 50% -30%, #fff, transparent 60%), linear-gradient(135deg, rgba(196,181,253,0.75), rgba(165,180,252,0.6))',
                boxShadow: theme === 'dark' ? '0 0 16px rgba(139,92,246,0.55)' : '0 0 16px rgba(139,92,246,0.35)'
              } : undefined}
            >
              <span className="mt-0.5 block text-[11px]">{t(item.labelKey)}</span>
            </Button>
          );
        })}
      </nav>

      {/* Mobile account and admin actions */}
      <Drawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        placement="right"
        title={t('nav.mobileMenu')}
        width={280}
        styles={{ body: { padding: '8px 0' } }}
      >
        {/* Account section */}
        {user && (
          <div style={{ padding: '4px 24px 8px' }}>
            <span style={{ fontSize: 12, color: '#888' }}>{user.displayName ?? user.email}</span>
          </div>
        )}
        <Menu
          mode="inline"
          selectable={false}
          items={userMenuItems.filter((item) => !('key' in item && item.key === 'user-label')).map((item) => {
            if (!('onClick' in item) || typeof (item as { onClick?: () => void }).onClick !== 'function') return item;
            const orig = (item as { onClick: () => void }).onClick;
            return { ...item, onClick: () => { orig(); setMobileMenuOpen(false); } };
          })}
          style={{ border: 'none' }}
        />
      </Drawer>
    </Layout>
  );
}
