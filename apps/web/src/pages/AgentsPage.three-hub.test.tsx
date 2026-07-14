import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentsPage } from './AgentsPage';
import { AuthProvider } from '../auth/AuthContext';
import { ThemeProvider } from '../theme/ThemeContext';
import { logout as apiLogout, getCurrentUser } from '../api/auth';
import { listAgents } from '../api/agents';
import { createSource, deleteSource, listSources, probeSource, updateSource } from '../api/sources';
import { createPlaybook, listPlaybooks } from '../api/playbooks';

vi.mock('../api/auth', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: 'user-1',
    email: 'trader@example.com',
    displayName: 'Trader',
    role: 'admin',
    hasPassword: true,
    hasGoogleLinked: false,
    createdAt: new Date().toISOString()
  }),
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
  GOOGLE_SIGN_IN_URL: '/api/auth/google'
}));

vi.mock('../api/agents', async () => {
  const actual = await vi.importActual('../api/agents');
  return {
    ...actual,
    listAgents: vi.fn().mockResolvedValue([]),
    listAgentReports: vi.fn().mockResolvedValue([]),
    listAgentRuns: vi.fn().mockResolvedValue([]),
    getLatestAgentPrompt: vi.fn().mockResolvedValue(null),
    listAgentEpisodeOptions: vi.fn().mockResolvedValue([])
  };
});

vi.mock('../api/sources', () => ({
  listSources: vi.fn().mockResolvedValue([]),
  createSource: vi.fn(),
  getSource: vi.fn(),
  updateSource: vi.fn(),
  deleteSource: vi.fn(),
  shareSource: vi.fn(),
  publishSource: vi.fn(),
  probeSource: vi.fn()
}));

vi.mock('../api/playbooks', () => ({
  listPlaybooks: vi.fn().mockResolvedValue([]),
  createPlaybook: vi.fn(),
  getPlaybook: vi.fn(),
  updatePlaybook: vi.fn(),
  deletePlaybook: vi.fn(),
  runPlaybookNow: vi.fn(),
  sharePlaybook: vi.fn(),
  publishPlaybook: vi.fn()
}));

vi.mock('../api/marketplace', () => ({
  listMarketplaceAgents: vi.fn().mockResolvedValue([]),
  cloneMarketplaceAgent: vi.fn(),
  listMarketplaceSources: vi.fn().mockResolvedValue([]),
  cloneMarketplaceSource: vi.fn(),
  listMarketplacePlaybooks: vi.fn().mockResolvedValue([]),
  cloneMarketplacePlaybook: vi.fn()
}));

vi.mock('../api/access', () => ({
  listAgentAccessGrants: vi.fn().mockResolvedValue([]),
  grantAgentAccess: vi.fn(),
  revokeAgentAccess: vi.fn()
}));

function renderPage(options?: { openAdminArea?: boolean }) {
  const result = render(
    <AuthProvider>
      <ThemeProvider>
        <AgentsPage />
      </ThemeProvider>
    </AuthProvider>
  );
  const shouldOpenAdminArea = options?.openAdminArea ?? false;
  if (shouldOpenAdminArea) {
    void screen.findByRole('button', { name: /open admin area/i }).then((openAdminButton) => {
      fireEvent.click(openAdminButton);
    });
  }
  return result;
}

describe('AgentsPage three hub shell', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows only library by default', async () => {
    renderPage({ openAdminArea: false });

    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.queryByRole('tab', { name: /(agents|followers)/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /playbooks/i })).not.toBeInTheDocument();
  });

  it('starts in library-only mode and opens admin area on demand', async () => {
    renderPage({ openAdminArea: false });

    expect(screen.queryByRole('tab', { name: /(agents|followers)/i })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /open admin area/i }));
    expect(await screen.findByRole('tab', { name: /(agents|followers)/i })).toBeInTheDocument();
  });

  it('uses follower terminology in admin workspace', async () => {
    renderPage({ openAdminArea: false });

    fireEvent.click(await screen.findByRole('button', { name: /open admin area/i }));
    expect(await screen.findByRole('tab', { name: /followers/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /followers/i }));
    expect(await screen.findByRole('button', { name: /create follower/i })).toBeInTheDocument();
  });

  it('starts follow setup from a library card action', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com',
        status: 'active',
        config: {},
        metadata: { title: 'Example source', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    renderPage({ openAdminArea: false });

    fireEvent.click(await screen.findByRole('button', { name: /follow this source/i }));
    expect(await screen.findByRole('dialog', { name: /create playbook/i })).toBeInTheDocument();
    // Following a source must never navigate away from the Library/Dashboard tab.
    expect(screen.queryByRole('tab', { name: /playbooks/i })).not.toBeInTheDocument();
  });

  it('does not reveal admin-only Agents/Playbooks tabs when a non-admin user follows a source', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: 'user-2',
      email: 'reader@example.com',
      displayName: 'Reader',
      role: 'user',
      hasPassword: true,
      hasGoogleLinked: false,
      createdAt: new Date().toISOString()
    });
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-2',
        type: 'web_urls',
        value: 'https://example.com',
        status: 'active',
        config: {},
        metadata: { title: 'Example source', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    renderPage({ openAdminArea: false });

    fireEvent.click(await screen.findByRole('button', { name: /follow this source/i }));
    expect(await screen.findByRole('dialog', { name: /create playbook/i })).toBeInTheDocument();
    // A non-admin user must never gain access to the admin-only Agents/Playbooks tabs
    // just by following a source.
    expect(screen.queryByRole('tab', { name: /(agents|followers)/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /playbooks/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open admin area/i })).not.toBeInTheDocument();
  });

  it('opens follow setup in edit mode when a playbook already follows the source', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com',
        status: 'active',
        config: {},
        metadata: { title: 'Example source', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    vi.mocked(listPlaybooks).mockResolvedValueOnce([
      {
        id: 'playbook-1',
        ownerUserId: 'user-1',
        agentId: 'agent-1',
        name: 'Existing follow',
        description: '',
        enabled: true,
        schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
        sourceIds: ['source-1'],
        recipients: ['alerts@example.com'],
        executionMode: 'latest_only',
        maxSourcesPerRun: 5,
        maxItemsPerSource: 2,
        lastRunAt: null,
        nextRunAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    renderPage({ openAdminArea: false });

    fireEvent.click(await screen.findByRole('button', { name: /follow this source/i }));
    expect(await screen.findByRole('dialog', { name: /update playbook/i })).toBeInTheDocument();
    // Following a source must never navigate away from the Library/Dashboard tab.
    expect(screen.queryByRole('tab', { name: /playbooks/i })).not.toBeInTheDocument();
  });

  it('returns to auth when source loading gets a sign-in error', async () => {
    vi.mocked(listSources).mockRejectedValueOnce(new Error('Sign in required'));

    renderPage();

    await waitFor(() => expect(vi.mocked(apiLogout)).toHaveBeenCalled());
    expect(screen.queryByText(/failed to load sources/i)).not.toBeInTheDocument();
  });

  it('keeps sources loaded when only playbooks fail', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com',
        status: 'active',
        config: {},
        metadata: { coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    vi.mocked(listPlaybooks).mockRejectedValueOnce(new Error('Failed to load playbooks'));

    renderPage();

    expect((await screen.findAllByText(/example\.com/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/failed to load sources/i)).not.toBeInTheDocument();
  });

  it('stretches Agents dashboard list mode horizontally without reserving an empty right column', async () => {
    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));
    const agentsHeading = await screen.findByRole('heading', { name: /^followers$/i });
    expect(agentsHeading.closest('div[class*="lg:grid-cols-[2fr_1fr]"]')).toBeNull();
  });

  it('renders source library cards with fallback cover, scanned title, and sneak preview episodes', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'podcast_feeds',
        value: 'https://pod.example/feed.xml',
        status: 'active',
        config: {},
        metadata: {
          title: 'Macro Daily',
          coverImageUrl: null,
          previewItems: [{ title: 'Episode 4 - Rate Cut?', link: 'https://pod.example/e4', pubDate: null }]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    renderPage({ openAdminArea: false });

    expect(await screen.findByText(/macro daily/i)).toBeInTheDocument();
    expect(screen.getByText(/cover unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/episode 4 - rate cut\?/i)).toBeInTheDocument();
  });

  it('shows polished dashed ghost card copy in Library hub', async () => {
    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });

    const createSourceButton = screen.getByRole('button', { name: /create new source/i });
    expect(createSourceButton).toBeInTheDocument();
    expect(createSourceButton.className).toContain('border-dashed');
    expect(createSourceButton.className).toContain('dark:border-sky-800');
    expect(createSourceButton.className).toContain('dark:text-sky-100');
    expect(screen.getByText(/url detect \+ metadata preview/i)).toBeInTheDocument();
  });

  it('uses ghost/template create cards in all three hub collections', async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([]);
    vi.mocked(listPlaybooks).mockResolvedValueOnce([]);

    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByRole('button', { name: /create new source/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /open admin area/i }));

    fireEvent.click(screen.getByRole('tab', { name: /(agents|followers)/i }));
    const createAgentButton = await screen.findByRole('button', { name: /create (agent|follower)/i });
    expect(createAgentButton).toBeInTheDocument();
    expect(createAgentButton.className).toContain('w-full');

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    expect(await screen.findByRole('button', { name: /create new playbook/i })).toBeInTheDocument();
  });

  it('renders playbooks as cards with last run and next run metadata', async () => {
    vi.mocked(listPlaybooks).mockResolvedValueOnce([
      {
        id: 'playbook-1',
        ownerUserId: 'user-1',
        agentId: 'agent-1',
        name: 'Morning Momentum',
        description: 'Scan top sources at market open',
        enabled: true,
        schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
        sourceIds: ['source-1', 'source-2'],
        recipients: ['alerts@example.com'],
        executionMode: 'latest_only',
        maxSourcesPerRun: 5,
        maxItemsPerSource: 2,
        lastRunAt: '2026-07-13T06:00:00.000Z',
        nextRunAt: '2026-07-14T06:00:00.000Z',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    renderPage({ openAdminArea: true });
    fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));

    expect(await screen.findByText(/morning momentum/i)).toBeInTheDocument();
    expect(screen.getByText(/last run/i)).toBeInTheDocument();
    expect(screen.getByText(/next run/i)).toBeInTheDocument();
  });

  it('does not show the old playbook empty-state message when no playbooks exist', async () => {
    vi.mocked(listPlaybooks).mockResolvedValueOnce([]);
    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));

    expect(screen.queryByText(/Use "Create new playbook" to schedule multi-source runs\./i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create new playbook/i })).toBeInTheDocument();
  });

  it('does not show the old agents empty-state message when no agents exist', async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([]);
    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));

    expect(screen.queryByText(/Use "Create Agent" to start the setup wizard\./i)).not.toBeInTheDocument();
    expect(document.querySelector('.ant-empty')).toBeNull();
    expect(screen.getByRole('button', { name: /create (agent|follower)/i })).toBeInTheDocument();
  });

  it('keeps source creation CTA in Library hub and not in Agent wizard', async () => {
    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByRole('button', { name: /create new source/i })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /open admin area/i }));

    fireEvent.click(screen.getByRole('tab', { name: /(agents|followers)/i }));
    fireEvent.click(await screen.findByRole('button', { name: /create (agent|follower)/i }));
    expect(screen.queryByRole('button', { name: /create new source/i })).not.toBeInTheDocument();
  });

  it('creates a source from Sources hub via URL auto-detection and preview', async () => {
    vi.mocked(probeSource).mockResolvedValueOnce({
      reachable: true,
      kind: 'feed',
      title: 'Macro Daily',
      coverImageUrl: 'https://pod.example/cover.jpg',
      confidence: 0.92,
      previewItems: [
        { title: 'Ep 1', link: 'https://pod.example/1', pubDate: null },
        { title: 'Ep 2', link: 'https://pod.example/2', pubDate: null },
        { title: 'Ep 3', link: 'https://pod.example/3', pubDate: null },
        { title: 'Ep 4', link: 'https://pod.example/4', pubDate: null }
      ]
    } as never);
    vi.mocked(createSource).mockResolvedValueOnce({
      id: 'source-new',
      ownerUserId: 'user-1',
      type: 'podcast_feeds',
      value: 'https://pod.example/feed.xml',
      status: 'active',
      config: {},
      metadata: {
        title: 'Macro Daily',
        coverImageUrl: 'https://pod.example/cover.jpg',
        previewItems: [
          { title: 'Ep 1', link: 'https://pod.example/1', pubDate: null },
          { title: 'Ep 2', link: 'https://pod.example/2', pubDate: null },
          { title: 'Ep 3', link: 'https://pod.example/3', pubDate: null }
        ]
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });
    fireEvent.click(screen.getByRole('button', { name: /create new source/i }));

    fireEvent.change(screen.getByLabelText(/source url/i), { target: { value: 'https://pod.example/feed.xml' } });
    fireEvent.click(screen.getByRole('button', { name: /detect source/i }));

    expect(await screen.findByText(/macro daily/i)).toBeInTheDocument();
    expect(screen.getByText(/ep 1/i)).toBeInTheDocument();
    expect(screen.getByText(/ep 4/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add source/i }));

    expect(createSource).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'podcast_feeds',
        value: 'https://pod.example/feed.xml',
        metadata: expect.objectContaining({
          title: 'Macro Daily',
          coverImageUrl: 'https://pod.example/cover.jpg',
          previewItems: expect.arrayContaining([expect.objectContaining({ title: 'Ep 1' })])
        })
      })
    );
  });

  it('still detects a YouTube playlist when first probe attempt fails with 404', async () => {
    vi.mocked(probeSource)
      .mockRejectedValueOnce(new Error('Route POST:/api/sources/probe not found'))
      .mockResolvedValueOnce({
        reachable: true,
        kind: 'feed',
        title: 'Playlist Feed',
        coverImageUrl: null,
        confidence: 0.9,
        previewItems: [{ title: 'Video 1', link: 'https://youtube.com/watch?v=abc', pubDate: null }]
      } as never);

    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });
    fireEvent.click(screen.getByRole('button', { name: /create new source/i }));

    fireEvent.change(screen.getByLabelText(/source url/i), {
      target: { value: 'https://www.youtube.com/playlist?list=PL6P5rY8mrhqrhVgc_pkSOlRLpuGW3CpJ3' }
    });
    fireEvent.click(screen.getByRole('button', { name: /detect source/i }));

    expect(await screen.findByText(/playlist feed/i)).toBeInTheDocument();
    expect(screen.getByText(/video 1/i)).toBeInTheDocument();
    expect(probeSource).toHaveBeenCalledTimes(2);
  });

  it('shows owner action buttons for source, agent, and playbook cards', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com',
        status: 'active',
        config: {},
        metadata: { title: 'Example source', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    vi.mocked(listAgents).mockResolvedValueOnce([
      {
        id: 'agent-1',
        ownerUserId: 'user-1',
        name: 'Macro Agent',
        status: 'active',
        sources: [],
        schedule: null,
        runCount: 0,
        reportCount: 0,
        latestReportAt: null
      }
    ]);
    vi.mocked(listPlaybooks).mockResolvedValueOnce([
      {
        id: 'playbook-1',
        ownerUserId: 'user-1',
        agentId: 'agent-1',
        name: 'Morning run',
        description: '',
        enabled: true,
        schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
        sourceIds: ['source-1'],
        recipients: ['alerts@example.com'],
        executionMode: 'latest_only',
        maxSourcesPerRun: 5,
        maxItemsPerSource: 2,
        lastRunAt: null,
        nextRunAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    renderPage();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(screen.getByLabelText(/edit source/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remove source/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/share source/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publish source/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /open admin area/i }));

    fireEvent.click(screen.getByRole('tab', { name: /(agents|followers)/i }));
    expect(await screen.findByLabelText(/edit agent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/share agent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publish agent/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    expect(await screen.findByLabelText(/edit playbook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remove playbook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/share playbook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/publish playbook/i)).toBeInTheDocument();
  });

  it('keeps only one remove action on agent cards and moves pause control to playbook cards', async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([
      {
        id: 'agent-1',
        ownerUserId: 'user-1',
        name: 'Macro Agent',
        status: 'active',
        sources: [],
        schedule: null,
        runCount: 0,
        reportCount: 0,
        latestReportAt: null
      }
    ]);
    vi.mocked(listPlaybooks).mockResolvedValueOnce([
      {
        id: 'playbook-1',
        ownerUserId: 'user-1',
        agentId: 'agent-1',
        name: 'Morning run',
        description: '',
        enabled: true,
        schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
        sourceIds: ['source-1'],
        recipients: [],
        executionMode: 'latest_only',
        maxSourcesPerRun: 5,
        maxItemsPerSource: 2,
        lastRunAt: null,
        nextRunAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));
    expect((await screen.findAllByLabelText(/remove agent/i)).length).toBe(1);
    expect(screen.queryByLabelText(/pause agent/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/resume agent/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    expect(await screen.findByLabelText(/pause playbook/i)).toBeInTheDocument();
  });

  it('renders character + personality on agent cards and keeps operational meta on playbooks', async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([
      {
        id: 'agent-1',
        ownerUserId: 'user-1',
        name: 'Macro Agent',
        characterType: 'teacher',
        promptConfig: { personality_label: 'Classroom Instructor' },
        status: 'active',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'daily', dailyTime: '08:00', timezone: 'UTC' },
        runCount: 0,
        reportCount: 0,
        latestReportAt: null
      }
    ]);
    vi.mocked(listPlaybooks).mockResolvedValueOnce([
      {
        id: 'playbook-1',
        ownerUserId: 'user-1',
        agentId: 'agent-1',
        name: 'Morning run',
        description: '',
        enabled: true,
        schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
        sourceIds: ['source-1'],
        recipients: [],
        executionMode: 'latest_only',
        maxSourcesPerRun: 5,
        maxItemsPerSource: 2,
        lastRunAt: null,
        nextRunAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);

    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));
    expect(await screen.findByText(/character: teacher/i)).toBeInTheDocument();
    expect(screen.getByText(/personality: classroom instructor/i)).toBeInTheDocument();
    expect(screen.queryByText(/^sources:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^schedule:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    expect(await screen.findByText(/^sources:\s*1$/i)).toBeInTheDocument();
    expect(screen.getByText(/schedule:\s*daily 07:30 \(utc\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^active$/i)).toBeInTheDocument();
  });

  it('shows search bars in Agents and Playbooks hubs', async () => {
    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));
    expect(await screen.findByLabelText(/search agents/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    expect(await screen.findByLabelText(/search playbooks/i)).toBeInTheDocument();
  });

  it('edits a Library source card via owner action', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-edit-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com/original',
        status: 'active',
        config: {},
        metadata: { title: 'Editable source', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    vi.mocked(probeSource).mockResolvedValueOnce({
      reachable: true,
      kind: 'listing_page',
      title: 'Editable source',
      coverImageUrl: null,
      confidence: 0.8,
      previewItems: []
    } as never);
    vi.mocked(updateSource).mockResolvedValueOnce({
      id: 'source-edit-1',
      ownerUserId: 'user-1',
      type: 'web_urls',
      value: 'https://example.com/updated',
      status: 'active',
      config: {},
      metadata: { title: 'Editable source', coverImageUrl: null, previewItems: [] },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });
    fireEvent.click(screen.getByLabelText(/edit source/i));
    expect(screen.getByText(/edit source from url/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/source url/i), { target: { value: 'https://example.com/updated' } });
    fireEvent.click(screen.getByRole('button', { name: /detect source/i }));
    await screen.findByText(/editable source/i);
    fireEvent.click(screen.getByRole('button', { name: /save source/i }));

    expect(updateSource).toHaveBeenCalledWith(
      'source-edit-1',
      expect.objectContaining({ value: 'https://example.com/updated' })
    );
  });

  it('adds extra library tabs with custom names', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Research');
    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });

    fireEvent.click(screen.getByRole('button', { name: /create library tab/i }));
    expect(await screen.findByRole('tab', { name: /research/i })).toBeInTheDocument();
  });

  it('shows rename control for the active custom library tab', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Research');
    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });
    fireEvent.click(screen.getByRole('button', { name: /create library tab/i }));
    await screen.findByRole('tab', { name: /research/i });
    expect(screen.getByRole('button', { name: /rename active library tab/i })).toBeInTheDocument();
  });

  it('deletes a Library source card via owner action', async () => {
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-delete-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com/delete-me',
        status: 'active',
        config: {},
        metadata: { title: 'Delete me', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    vi.mocked(deleteSource).mockResolvedValueOnce();

    renderPage({ openAdminArea: false });
    await screen.findByRole('heading', { name: /dashboard/i });
    fireEvent.click(screen.getByLabelText(/remove source/i));
    fireEvent.click(await screen.findByRole('button', { name: /^remove$/i }));
    expect(deleteSource).toHaveBeenCalledWith('source-delete-1');
  });

  it('creates a playbook from the Playbooks hub create flow', async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([
      {
        id: 'agent-1',
        ownerUserId: 'user-1',
        name: 'Macro Agent',
        status: 'active',
        sources: [],
        schedule: null,
        runCount: 0,
        reportCount: 0,
        latestReportAt: null
      }
    ]);
    vi.mocked(listSources).mockResolvedValueOnce([
      {
        id: 'source-1',
        ownerUserId: 'user-1',
        type: 'web_urls',
        value: 'https://example.com',
        status: 'active',
        config: {},
        metadata: { title: 'Example source', coverImageUrl: null, previewItems: [] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    vi.mocked(createPlaybook).mockResolvedValueOnce({
      id: 'playbook-1',
      ownerUserId: 'user-1',
      agentId: 'agent-1',
      name: 'Morning run',
      description: '',
      enabled: true,
      schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
      sourceIds: ['source-1'],
      recipients: [],
      executionMode: 'latest_only',
      maxSourcesPerRun: 5,
      maxItemsPerSource: 2,
      lastRunAt: null,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    renderPage({ openAdminArea: true });
    fireEvent.click(await screen.findByRole('tab', { name: /playbooks/i }));
    fireEvent.click(await screen.findByRole('button', { name: /create new playbook/i }));
    expect(await screen.findByRole('dialog', { name: /create playbook/i })).toBeInTheDocument();

    expect(screen.queryByLabelText(/playbook name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/playbook description/i)).not.toBeInTheDocument();

    const sourceCard = await screen.findByRole('button', { name: /select source example source/i });
    expect(sourceCard).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sourceCard);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const agentCard = await screen.findByRole('button', { name: /select agent macro agent/i });
    expect(agentCard).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(agentCard);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    const dailyTime = await screen.findByLabelText(/playbook daily time/i);
    const timezone = await screen.findByLabelText(/playbook timezone/i);
    expect(dailyTime.closest('div[class*="md:grid-cols-2"]')).toBeTruthy();
    expect(timezone.closest('div[class*="md:grid-cols-2"]')).toBeTruthy();

    fireEvent.mouseDown(timezone);
    fireEvent.click(await screen.findByRole('option', { name: 'Europe/Berlin' }));
    expect(await screen.findByRole('combobox', { name: /playbook timezone/i })).toBeInTheDocument();

    expect(screen.getByText(/recipient emails/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/playbook recipient emails/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /create playbook/i }));

    expect(createPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Macro Agent · Example source',
        agentId: 'agent-1',
        sourceIds: expect.arrayContaining(['source-1']),
        recipients: []
      })
    );
  });

  it('shows latest runtime status in Playbooks hub, not Agents hub', async () => {
    renderPage({ openAdminArea: true });
    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));
    expect(screen.queryByText(/latest agent runtime status/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    expect(await screen.findByText(/latest agent runtime status/i)).toBeInTheDocument();
  });

  it('keeps runs/reports in Playbooks hub, not Agents hub', async () => {
    vi.mocked(listAgents).mockResolvedValueOnce([
      {
        id: 'agent-1',
        ownerUserId: 'user-1',
        name: 'Macro Agent',
        status: 'active',
        sources: [{ type: 'web_urls', value: 'https://example.com' }],
        schedule: { mode: 'daily', dailyTime: '08:00', timezone: 'UTC' },
        runCount: 2,
        reportCount: 3,
        latestReportAt: null
      }
    ]);
    vi.mocked(listPlaybooks).mockResolvedValueOnce([
      {
        id: 'playbook-1',
        ownerUserId: 'user-1',
        agentId: 'agent-1',
        name: 'Execution Playbook',
        description: '',
        enabled: true,
        schedule: { mode: 'daily', dailyTime: '07:30', timezone: 'UTC' },
        sourceIds: ['source-1'],
        recipients: [],
        executionMode: 'latest_only',
        maxSourcesPerRun: 5,
        maxItemsPerSource: 2,
        lastRunAt: '2026-07-13T06:00:00.000Z',
        nextRunAt: '2026-07-14T06:00:00.000Z',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]);
    renderPage({ openAdminArea: true });

    fireEvent.click(await screen.findByRole('tab', { name: /(agents|followers)/i }));
    fireEvent.click(await screen.findByText(/macro agent/i));
    expect(screen.queryByRole('tab', { name: /^reports$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^runs$/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/system prompt/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /playbooks/i }));
    fireEvent.click(await screen.findByText(/execution playbook/i));
    expect(await screen.findByRole('tab', { name: /^reports$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^runs$/i })).toBeInTheDocument();
  });
});
