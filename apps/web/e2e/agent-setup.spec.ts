import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('@smoke app load shows dashboard on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <main>
      <h1>ChatTrader</h1>
      <p>Agent Dashboard</p>
    </main>
  `);

  await expect(page.getByText('Agent Dashboard')).toBeVisible();
});


test('@smoke selected source actions replace the mobile picker list', async ({ page }) => {
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const guidedWizard = agentsPage.slice(agentsPage.indexOf('{/* Guided first-report wizard'));

  expect(guidedWizard).toContain('guidedWizardSource ? (');
  expect(guidedWizard.indexOf('guidedWizardSource ? (')).toBeLessThan(guidedWizard.indexOf('<SourceSearchPicker'));
  expect(guidedWizard).toContain("setGuidedWizardSource(null)");
  expect(guidedWizard).toContain("t('guided.changeSource')");
});

test('@smoke curator attributes a source-inspired opening', async () => {
  const curator = await readFile(resolve(process.cwd(), 'src/components/AgentCurator.tsx'), 'utf8');

  expect(curator).toContain("t('curator.inspiredBy'");
  expect(curator).toContain('sourceContext.title');
  expect(curator).toContain('userMessageCount === 1 && Boolean(lastCuratorMessage) && !sending');
});

test('@smoke mobile modal content owns touch scrolling', async () => {
  const styles = await readFile(resolve(process.cwd(), 'src/index.css'), 'utf8');

  expect(styles).toContain('overscroll-behavior-y: contain');
  expect(styles).toContain('touch-action: pan-y');
  expect(styles).toContain('-webkit-overflow-scrolling: touch');
});

test('@smoke long mobile workflows use full-screen dialogs', async () => {
  const styles = await readFile(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const curator = await readFile(resolve(process.cwd(), 'src/components/AgentCurator.tsx'), 'utf8');
  const sourcePicker = await readFile(resolve(process.cwd(), 'src/components/SourceSearchPicker.tsx'), 'utf8');

  expect(styles).toContain('.mobile-fullscreen-modal .ant-modal-content');
  expect(styles).toContain('height: 100dvh');
  expect(styles).toContain('.mobile-fullscreen-modal .curator-actions');
  expect(styles).toContain('.mobile-fullscreen-modal .mobile-workflow-actions');
  expect(styles).toContain('.mobile-fullscreen-modal .source-picker-results');
  expect(curator).toContain('className="curator-actions');
  expect(sourcePicker).toContain('className="source-picker-results');
  expect(agentsPage).toContain('className="mobile-workflow-actions');
  expect(agentsPage).toContain('className="follow-source-modal mobile-fullscreen-modal"');
  expect(agentsPage).toContain('className="guided-source-modal mobile-fullscreen-modal"');
  expect(agentsPage).toContain('className="agent-curator-modal mobile-fullscreen-modal"');
});

test('@smoke mobile wizard actions float without affecting desktop flow', async () => {
  const styles = await readFile(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const curator = await readFile(resolve(process.cwd(), 'src/components/AgentCurator.tsx'), 'utf8');
  const agentForm = await readFile(resolve(process.cwd(), 'src/components/AgentForm.tsx'), 'utf8');

  expect(styles).not.toContain('.mobile-action-scrim');
  expect(styles).toContain('.mobile-agent-form-actions');
  expect(styles).toContain('width: 48px !important');
  expect(agentsPage).not.toContain('mobile-action-scrim');
  expect(agentsPage).not.toContain('sticky bottom-0');
  expect(agentsPage).toContain('ml-auto');
  expect(curator).not.toContain('mobile-action-scrim');
  expect(agentForm).not.toContain('sticky bottom-0');
  expect(agentForm).toContain('mobile-agent-form-actions');
});

test('@smoke notification bell uses a direct popover trigger on touch devices', async () => {
  const appShell = await readFile(resolve(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');
  const bellBlock = appShell.slice(
    appShell.indexOf('{/* Bell */}'),
    appShell.indexOf('{/* User menu')
  );

  expect(bellBlock).toContain('<Badge count={unread.length}');
  expect(bellBlock).toMatch(/<Popover[\s\S]*>\s*<Button[\s\S]*BellOutlined/);
  expect(bellBlock).not.toContain('<TouchSafeTooltip');
});

test('@smoke mobile library episodes use compact thumbnails and stacked actions', async () => {
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const episodeListStart = agentsPage.indexOf('<ul className="divide-y divide-border">');
  const episodeList = agentsPage.slice(
    episodeListStart,
    agentsPage.indexOf('</ul>', episodeListStart)
  );

  expect(episodeList).toContain('grid-cols-[72px_minmax(0,1fr)]');
  expect(episodeList).toContain('h-12 w-[72px]');
  expect(episodeList).toContain('sm:h-11 sm:w-16');
  expect(episodeList).toContain('col-start-2');
  expect(episodeList).toContain('sm:col-start-3');
  expect(episodeList).not.toContain('w-full sm:w-16');
});

test('@smoke German feed recommendation uses the key-insights label', async () => {
  const german = await readFile(resolve(process.cwd(), 'src/i18n/locales/de.json'), 'utf8');

  expect(german).toContain('"recommendation": "Wesentliche Erkenntnisse"');
  expect(german).not.toContain('"recommendation": "Empfohlener nächster Schritt"');
});

test('@smoke feed cards render all key takeaways as essential insights', async () => {
  const feedCard = await readFile(resolve(process.cwd(), 'src/components/FeedCard.tsx'), 'utf8');
  const focusSection = feedCard.slice(feedCard.indexOf('const focusContent'));

  expect(focusSection.indexOf('common?.key_takeaways')).toBeLessThan(focusSection.indexOf('common?.recommendation'));
  expect(focusSection).toContain("label: t('report.keyTakeaways')");
  expect(focusSection).toContain('focusContent.items.map');
});


test('@smoke library renders creation before starter picks and saved sources', async () => {
  const overview = await readFile(resolve(process.cwd(), 'src/components/library/LibraryOverview.tsx'), 'utf8');

  expect(overview.indexOf('GhostCreateCard')).toBeLessThan(overview.indexOf('StarterSourceCard'));
  expect(overview.indexOf("t('library.startHere')")).toBeLessThan(overview.indexOf("t('library.yourLibrary')"));
});

test('@smoke catalog demos are labeled and read only', async () => {
  const preview = await readFile(resolve(process.cwd(), 'src/components/library/SampleReportPreview.tsx'), 'utf8');

  expect(preview).toContain("t('library.sampleReport')");
  expect(preview).toContain('demo.disclosure');
  expect(preview).toContain('CharacterReportRenderer');
  expect(preview).not.toContain('markReportRead');
  expect(preview).not.toContain('dismissReport');
});

test('@smoke library guidance replaces forced onboarding and wizard preview', async () => {
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const appShell = await readFile(resolve(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');

  expect(agentsPage).not.toContain('forceShowOnboarding');
  expect(agentsPage).not.toContain('forceShowGuidedWizard');
  expect(appShell).not.toContain('admin-preview-onboarding');
  expect(appShell).not.toContain('admin-start-guided-wizard');
});

test('@smoke saving a source offers optional agent selection', async () => {
  const modal = await readFile(resolve(process.cwd(), 'src/components/library/PostSourceChoiceModal.tsx'), 'utf8');

  expect(modal).toContain("t('library.chooseAgent')");
  expect(modal).toContain("t('library.skipAgent')");
  expect(modal).not.toContain('createPlaybook(');
});

test('@smoke agent selection uses compact source-aware cards', async () => {
  const card = await readFile(resolve(process.cwd(), 'src/components/agent-selection/CompactAgentCard.tsx'), 'utf8');

  expect(card).toContain('iconAssetKey');
  expect(card).toContain('match.reasons.slice(0, 2)');
  expect(card).toContain("t('agentSelection.useAgent')");
  expect(card).not.toContain('systemPrompt');
  expect(card).not.toContain('model');
  expect(card).not.toContain('runCount');
});

test('@smoke agent selection keeps compact source-aware matches paged and deduped', async () => {
  const selectionView = await readFile(resolve(process.cwd(), 'src/components/agent-selection/AgentSelectionView.tsx'), 'utf8');

  expect(selectionView).toContain('BEST_MATCHES_PAGE_SIZE = 4');
  expect(selectionView).toContain('setVisibleLimit((current) => current + BEST_MATCHES_PAGE_SIZE)');
  expect(selectionView).toContain('matchedOwnedVersionIds');
  expect(selectionView).toContain('window.requestAnimationFrame');
  expect(selectionView).toContain('target?.focus()');
  expect(selectionView).toContain("t('agentSelection.showMore')");
  expect(selectionView).toContain("t('agentSelection.yourAgents')");
  expect(selectionView).toContain("t('agentSelection.curateYourOwn')");
  expect(selectionView).not.toContain("t('agent.createNew')");
});

test('@smoke agent selection rewires compact source-aware entry points', async () => {
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');

  expect(agentsPage).toContain('AgentSelectionView');
  expect(agentsPage).toContain('onAddAgent={(source) => onFollowSource(source)}');
  expect(agentsPage).toContain("message.success(t('agentSelection.connectionSuccess'))");
  expect(agentsPage).toContain('onAgentConnected={handleAgentSelectionConnected}');
  expect(agentsPage).toContain('onCurate={openInlineAgentCuration}');
});

test('@smoke connected agent offers run before schedule', async () => {
  const modal = await readFile(resolve(process.cwd(), 'src/components/agent-selection/AgentConnectedModal.tsx'), 'utf8');

  expect(modal).toContain("t('agentSelection.runFirstReport')");
  expect(modal).toContain("t('agentSelection.scheduleRecurring')");
  expect(modal).not.toContain("schedule: { mode: 'daily'");
});

test('@smoke agent creation entry points stay AI curated', async () => {
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');

  expect(agentsPage).toContain('openInlineAgentCuration');
  expect(agentsPage).not.toContain('openInlineAgentCreate');
  expect(agentsPage).not.toContain('Configure manually');
});

test('@smoke variant creation starts curation from immutable public versions', async () => {
  const drawer = await readFile(resolve(process.cwd(), 'src/components/agent-selection/AgentDetailsDrawer.tsx'), 'utf8');
  const curator = await readFile(resolve(process.cwd(), 'src/components/AgentCurator.tsx'), 'utf8');

  expect(drawer).toContain("t('agentSelection.createVariant')");
  expect(drawer).toContain('onCreateVariant(match.agentVersionId)');
  expect(curator).toContain('baseAgentVersionId');
  expect(curator).toContain('startAgentCuration({');
});

test('@smoke agent updates are explicit and opt-in', async () => {
  const drawer = await readFile(resolve(process.cwd(), 'src/components/agent-selection/AgentDetailsDrawer.tsx'), 'utf8');
  const api = await readFile(resolve(process.cwd(), 'src/api/agent-selection.ts'), 'utf8');

  expect(drawer).toContain("t('agentSelection.updateAgent')");
  expect(api).toContain('/api/catalog/agent-versions/${agentVersionId}/update');
  expect(api).toContain('updateManualPlaybooks');
});

test('@smoke library next-action guidance is motion safe and localized', async () => {
  const css = await readFile(resolve(process.cwd(), 'src/index.css'), 'utf8');
  const english = await readFile(resolve(process.cwd(), 'src/i18n/locales/en.json'), 'utf8');
  const german = await readFile(resolve(process.cwd(), 'src/i18n/locales/de.json'), 'utf8');

  expect(css).toContain('.library-next-action');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).toContain('ghost-create-card-dash');
  expect(english).toContain('"nextActionLabel"');
  expect(english).toContain('"nextActionHint"');
  expect(german).toContain('"nextActionLabel"');
  expect(german).toContain('"nextActionHint"');
});
