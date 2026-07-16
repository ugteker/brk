import { AudioOutlined, DatabaseOutlined, FileTextOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Layout, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;
const { Title } = Typography;

const NAV_ITEMS = [
  { path: '/', key: 'feed', icon: <FileTextOutlined />, labelKey: 'nav.feed' },
  { path: '/library', key: 'library', icon: <DatabaseOutlined />, labelKey: 'nav.library' },
  { path: '/agents', key: 'agents', icon: <RobotOutlined />, labelKey: 'nav.agents' },
  { path: '/playbooks', key: 'playbooks', icon: <SettingOutlined />, labelKey: 'nav.playbooks' },
  { path: '/studio', key: 'studio', icon: <AudioOutlined />, labelKey: 'studio.title' }
];

interface StudioLayoutProps {
  children: ReactNode;
}

export function StudioLayout({ children }: StudioLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeKey = pathname.startsWith('/studio') ? 'studio'
    : pathname === '/library' ? 'library'
    : pathname === '/agents' ? 'agents'
    : pathname === '/playbooks' ? 'playbooks'
    : 'feed';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
        }}
      >
        <Title
          level={4}
          style={{ margin: 0, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', marginRight: 16 }}
          onClick={() => navigate('/')}
        >
          ChatTrader
        </Title>

        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.key}
              type={activeKey === item.key ? 'primary' : 'text'}
              icon={item.icon}
              onClick={() => navigate(item.path)}
              style={{
                color: activeKey === item.key ? undefined : '#d9d9d9',
                fontWeight: activeKey === item.key ? 600 : 400
              }}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </div>
      </Header>
      <Content style={{ padding: 'clamp(12px, 3vw, 24px)' }}>
        {children}
      </Content>
    </Layout>
  );
}
