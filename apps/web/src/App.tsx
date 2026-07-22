import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSafeNavigate } from './utils/useSafeNavigate';
import { AgentsPage } from './pages/AgentsPage';
import { AuthPage } from './pages/AuthPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { RealtimeProvider, useRealtimeSubscription } from './context/RealtimeContext';
import { AppShell } from './components/AppShell';
import { StudioHub } from './pages/StudioHub';
import { DiscussionDetail } from './pages/DiscussionDetail';
import { NewDiscussionWizard } from './pages/NewDiscussionWizard';

// Route guard for admin-only pages (Agents, Playbooks, User Management). Non-admins are
// redirected to the Feed hub — these routes are only reachable via nav when isAdmin is true,
// but this closes the gap where a non-admin could still hit the URL directly.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AdminUsersRoute() {
  const navigate = useSafeNavigate();
  return <AdminUsersPage onBack={() => navigate('/')} />;
}

// Subscribes global app data to the topics this task scopes for cross-tab/cross-device
// refresh. Mounted inside both AppDataProvider and RealtimeProvider so it can bridge the two
// without either context needing to know about the other. Agents/playbooks refreshes are
// deliberately not subscribed yet — Task 6 wires those up.
function RealtimeDataBridge({ children }: { children: ReactNode }) {
  const { refreshSources, refreshMarketplace } = useAppData();
  useRealtimeSubscription(['source.changed'], () => { refreshSources(); });
  useRealtimeSubscription(['marketplace.changed'], () => { refreshMarketplace(); });
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="ct-page-enter">
      <Routes>
        <Route path="/" element={<AgentsPage hub="feed" />} />
        <Route path="/library" element={<AgentsPage hub="sources" />} />
        <Route path="/agents" element={<RequireAdmin><AgentsPage hub="agents" /></RequireAdmin>} />
        <Route path="/playbooks" element={<RequireAdmin><AgentsPage hub="playbooks" /></RequireAdmin>} />
        <Route path="/admin/users" element={<RequireAdmin><AdminUsersRoute /></RequireAdmin>} />
        <Route path="/studio" element={<StudioHub />} />
        <Route path="/studio/new" element={<NewDiscussionWizard />} />
        <Route path="/studio/:discussionId" element={<DiscussionDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function AuthGate() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <AuthPage />;
  }

  return (
    <AppDataProvider>
      <RealtimeProvider>
        <RealtimeDataBridge>
          <AppShell>
            <AnimatedRoutes />
          </AppShell>
        </RealtimeDataBridge>
      </RealtimeProvider>
    </AppDataProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}

