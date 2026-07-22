import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() }
  })
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' })
  };
});

vi.mock('../utils/useSafeNavigate', () => ({
  useSafeNavigate: () => vi.fn()
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'user@example.com', displayName: 'User' },
    isAdmin: false,
    logout: vi.fn()
  })
}));

vi.mock('../context/AppDataContext', () => ({
  useAppData: () => ({
    failedRunNotices: [],
    newReportNotices: [],
    discussionNotices: [],
    bellDismissedIds: new Set<string>(),
    setBellDismissedIds: vi.fn(),
    refreshAgents: vi.fn(),
    refreshSources: vi.fn(),
    refreshPlaybooks: vi.fn(),
    forceShowOnboarding: false,
    setForceShowOnboarding: vi.fn(),
    setForceShowGuidedWizard: vi.fn(),
    adminMode: false,
    setAdminMode: vi.fn()
  })
}));

vi.mock('../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: vi.fn()
  })
}));

vi.mock('./TouchSafeTooltip', () => ({
  TouchSafeTooltip: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock('./WatchlistMenu', () => ({
  WatchlistMenu: () => <div data-testid="watchlist-menu" />
}));

vi.mock('./UsageBudgetModal', () => ({
  UsageBudgetModal: () => null
}));

vi.mock('../api/admin', () => ({
  seedDemoData: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it('shows build stamp in the shell header when build metadata is present', () => {
  vi.stubEnv('VITE_BUILD_TIMESTAMP', '2026-07-13T12:34:00Z');
  vi.stubEnv('VITE_BUILD_COMMIT_SHA', 'abc1234');

  render(
    <AppShell>
      <div>child</div>
    </AppShell>
  );

  expect(screen.getByTestId('app-build-stamp')).toHaveTextContent('Build: 2026-07-13 12:34 UTC · abc1234');
});

it('does not show build stamp when metadata is missing', () => {
  vi.stubEnv('VITE_BUILD_TIMESTAMP', '');
  vi.stubEnv('VITE_BUILD_COMMIT_SHA', '');

  render(
    <AppShell>
      <div>child</div>
    </AppShell>
  );

  expect(screen.queryByTestId('app-build-stamp')).not.toBeInTheDocument();
});
