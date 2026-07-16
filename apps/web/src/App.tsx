import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AgentsPage } from './pages/AgentsPage';
import { AuthPage } from './pages/AuthPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
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
  const navigate = useNavigate();
  return <AdminUsersPage onBack={() => navigate('/')} />;
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
      <AppShell>
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
      </AppShell>
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

