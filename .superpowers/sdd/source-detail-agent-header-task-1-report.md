# Source Detail Agent Header Task Report

## Files changed
- `apps/web/src/pages/AgentsPage.tsx`
- `apps/web/src/pages/AgentsPage.three-hub.test.tsx`

## What changed
- Moved the `library.addAgent` action into the source-detail header `Card.extra`.
- Kept the existing follow wizard flow and `onFollowSource(selectedSource, event)`.
- Removed the old source-detail agent strip and the unused `linkedAgentLinks` declaration.
- Updated the focused test to open the source detail first, then click the header add-agent action.

## Red / green evidence
### Red
- Focused test failed before the implementation with:
  - `expect(element).not.toBeInTheDocument()`
  - found `Agents follow`

### Green
- Focused test passed after the implementation:
  - `opens the follow wizard with the source and its already-linked agent preselected from the source detail header add agent action`

## Verification
- `cd apps/web && npx vitest run src/pages/AgentsPage.three-hub.test.tsx -t "source detail header add agent action"` ✅
- `cd apps/web && npm run build` ✅

## Build output
- Vite production build completed successfully.
- Output bundles:
  - `dist/index.html`
  - `dist/assets/index-C2Zy6tDL.css`
  - `dist/assets/index-BAXI65ku.js`
- Warning remained about chunk size > 500 kB after minification.

## Commit
- `7d704709f` — `fix(library): move source agent action to detail header`

## Concerns
- The full `npx vitest run src/pages/AgentsPage.three-hub.test.tsx` file still reports pre-existing unrelated failures outside this change set.
- I did not touch the unrelated untracked files already present in the worktree:
  - `.superpowers/sdd/`
  - `docs/superpowers/plans/2026-07-22-source-detail-agent-header.md`

## Follow-up Docker fix

### Root cause
- The root `Dockerfile` api-build stage ran `npm run build`, which triggers the
  `apps/api` `prebuild` hook.
- That stage copied `prisma/`, `src/`, and config files, but not
  `apps/api/scripts/`.
- As a result, `./scripts/prisma-generate-safe.cjs` was missing inside the
  image during `prebuild`.

### Fix
- Added `COPY apps/api/scripts ./scripts` to the `api-build` stage before
  `RUN npm run build`.
- Left the existing `prebuild` hook, `npx prisma generate`, and runtime setup
  unchanged.

### Validation
- `cd apps/api && npm run build` ✅
  - Confirmed `prebuild` executed successfully and generated Prisma Client.
- `docker version` ❌
  - Docker client was available, but the Docker daemon was unavailable:
    `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`
