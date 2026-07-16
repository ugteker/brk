import { Spin } from 'antd';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AgentsPage } from './pages/AgentsPage';
import { AuthPage } from './pages/AuthPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppDataProvider } from './context/AppDataContext';
import { AppShell } from './components/AppShell';
import { StudioHub } from './pages/StudioHub';
import { DiscussionDetail } from './pages/DiscussionDetail';
import { NewDiscussionWizard } from './pages/NewDiscussionWizard';

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
          <Route path="/agents" element={<AgentsPage hub="agents" />} />
          <Route path="/playbooks" element={<AgentsPage hub="playbooks" />} />
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

