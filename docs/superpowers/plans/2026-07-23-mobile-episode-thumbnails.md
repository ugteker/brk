# Mobile Episode Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-width mobile episode covers with compact `72x48px` thumbnails and place episode actions below the mobile metadata.

**Architecture:** Convert each episode row from breakpoint-switched flex direction to a responsive CSS grid. The same action node occupies the second mobile grid row beneath the content and moves to the third desktop column, avoiding duplicated controls or handlers.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Playwright smoke tests.

## Global Constraints

- Mobile thumbnail size is exactly `72x48px`.
- Desktop thumbnail size remains `64x44px`.
- Mobile actions appear below title and publication date.
- Desktop actions remain right-aligned in the episode row.
- Existing report-opening and episode-action behavior remains unchanged.
- Do not commit automatically; the current branch and working tree are user-owned.

---

### Task 1: Responsive Episode Row

**Files:**
- Modify: `apps/web/e2e/agent-setup.spec.ts`
- Modify: `apps/web/src/pages/AgentsPage.tsx:2896-2955`

**Interfaces:**
- Consumes: Existing episode metadata, `videoId`, `episodeReport`, and action handlers.
- Produces: Responsive grid placement using Tailwind classes only.

- [ ] **Step 1: Write the failing structural regression**

```ts
test('@smoke mobile library episodes use compact thumbnails and stacked actions', async () => {
  const agentsPage = await readFile(resolve(process.cwd(), 'src/pages/AgentsPage.tsx'), 'utf8');
  const episodeList = agentsPage.slice(
    agentsPage.indexOf('<ul className="divide-y divide-border">'),
    agentsPage.indexOf('</ul>', agentsPage.indexOf('<ul className="divide-y divide-border">'))
  );

  expect(episodeList).toContain('grid-cols-[72px_minmax(0,1fr)]');
  expect(episodeList).toContain('h-12 w-[72px]');
  expect(episodeList).toContain('sm:h-11 sm:w-16');
  expect(episodeList).toContain('col-start-2');
  expect(episodeList).toContain('sm:col-start-3');
  expect(episodeList).not.toContain('w-full sm:w-16');
});
```

- [ ] **Step 2: Run the regression and verify RED**

Run:

```powershell
Set-Location G:\brk\apps\web
npx playwright test --grep "mobile library episodes"
```

Expected: FAIL because the existing mobile list uses `flex-col` and `w-full`.

- [ ] **Step 3: Implement the responsive grid**

Change the list item and image classes:

```tsx
<li
  key={ep.link}
  className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-x-3 py-2.5 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center"
>
  <img
    src={getYoutubeThumbnailUrl(videoId, 'mqdefault')}
    alt=""
    className="h-12 w-[72px] rounded object-cover bg-muted sm:h-11 sm:w-16"
  />
```

Keep the existing title/date content in column two. Give the existing action container responsive placement without duplicating its children:

```tsx
<div className="col-start-2 mt-2 flex gap-1 sm:col-start-3 sm:row-start-1 sm:mt-0 sm:shrink-0">
```

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
Set-Location G:\brk\apps\web
npx playwright test --grep "mobile library episodes"
npm run test:smoke
Set-Location G:\brk
npm run build:web
git --no-pager diff --check
```

Expected: The targeted regression and smoke suite pass, the web build succeeds, and diff check reports no errors.
