import { Spin } from 'antd';
import { useRef, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSafeNavigate } from './utils/useSafeNavigate';
import { AgentsPage } from './pages/AgentsPage';
import { AuthPage } from './pages/AuthPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppDataProvider, useAppData, type DiscussionEventNotice } from './context/AppDataContext';
import { RealtimeProvider, useRealtimeSubscription } from './context/RealtimeContext';
import { AppShell } from './components/AppShell';
import { StudioHub } from './pages/StudioHub';
import { DiscussionDetail } from './pages/DiscussionDetail';
import { NewDiscussionWizard } from './pages/NewDiscussionWizard';
import { getDiscussion, listDiscussionRuns } from './api/discussions';

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
// without either context needing to know about the other.
function RealtimeDataBridge({ children }: { children: ReactNode }) {
  const { refreshSources, refreshMarketplace, refreshAgents, refreshPlaybooks, setDiscussionNotices } = useAppData();
  useRealtimeSubscription(['source.changed'], () => { refreshSources(); });
  useRealtimeSubscription(['marketplace.changed'], () => { refreshMarketplace(); });
  useRealtimeSubscription(['agent.changed'], () => { refreshAgents(); });
  useRealtimeSubscription(['playbook.changed'], () => { refreshPlaybooks(); });

  // Turn discussion ("show") lifecycle changes into bell notices: started, finished,
  // audio ready. discussion.changed fires on every turn while a show is being generated,
  // so events are debounced per discussion and run states are diffed against the last
  // observed snapshot to only emit each transition once.
  const runStateRef = useRef(new Map<string, { status: string; hadAudio: boolean }>());
  const discussionNameRef = useRef(new Map<string, string>());
  const debounceRef = useRef(new Map<string, number>());
  useRealtimeSubscription(['discussion.changed'], (event) => {
    if (event.topic === 'resync') return;
    const discussionId = event.entityId;
    if (!discussionId) return;
    const timers = debounceRef.current;
    const existing = timers.get(discussionId);
    if (existing !== undefined) window.clearTimeout(existing);
    timers.set(discussionId, window.setTimeout(async () => {
      timers.delete(discussionId);
      try {
        let name = discussionNameRef.current.get(discussionId);
        if (!name) {
          name = (await getDiscussion(discussionId)).name;
          discussionNameRef.current.set(discussionId, name);
        }
        const runs = await listDiscussionRuns(discussionId);
        const seen = runStateRef.current;
        const fresh: DiscussionEventNotice[] = [];
        const notice = (runId: string, kind: DiscussionEventNotice['kind'], timestamp: string) =>
          fresh.push({ id: `${runId}:${kind}`, kind, discussionId, discussionName: name!, timestamp });
        for (const run of runs) {
          const prev = seen.get(run.id);
          const hadAudio = Boolean(run.audioUrl);
          if (prev) {
            if (prev.status !== 'running' && run.status === 'running') notice(run.id, 'show_started', run.startedAt ?? new Date().toISOString());
            if (prev.status !== 'done' && run.status === 'done') notice(run.id, 'show_finished', run.completedAt ?? new Date().toISOString());
            if (!prev.hadAudio && hadAudio) notice(run.id, 'audio_ready', new Date().toISOString());
          } else if (run.status === 'running') {
            // First sighting: only announce actively running shows, don't backfill history.
            notice(run.id, 'show_started', run.startedAt ?? new Date().toISOString());
          }
          seen.set(run.id, { status: run.status, hadAudio });
        }
        if (fresh.length > 0) {
          setDiscussionNotices((prev) => {
            const known = new Set(prev.map((n) => n.id));
            const additions = fresh.filter((n) => !known.has(n.id));
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
      } catch {
        // best-effort: bell notices must never break the app
      }
    }, 1200));
  });
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

