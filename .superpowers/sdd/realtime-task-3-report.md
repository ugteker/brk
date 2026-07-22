# Task 3 Report: Write atomic Source and Marketplace events

## Status
Complete. All brief-mandated tests pass; full API suite passes with no regressions.

## Files changed

| File | Nature of change |
|---|---|
| `apps/api/src/modules/source/repository.ts` | All mutation methods (`createSource`, `updateSource`, `deleteSource`, `shareSource`, `publishSource`, `unpublishSource`, `cloneFromMarketplace`) rewritten to wrap their writes in `this.db.$transaction(async (tx) => {...})` and call `this.realtime.append(tx, {...})` before the transaction commits. `SourceDb` type extended with `'realtimeEvent'`. Constructor takes an optional `RealtimeEventWriter` (default: module-level no-op writer) as its second argument. |
| `apps/api/src/modules/agents/repository.ts` | `publishAgent`, `unpublishAgent`, `cloneFromMarketplace` rewritten the same way, emitting `marketplace.changed` only (no `agent.changed` topic exists). `createAgent`/`updateAgent`/`deleteAgent`/`disableAgent`/`enableAgent`/`shareAgent`/share-management methods intentionally left unchanged — no realtime topic applies to them. `AgentDb` extended with `'realtimeEvent'`; constructor takes optional `RealtimeEventWriter`. |
| `apps/api/src/modules/playbook/repository.ts` | `publishPlaybook`, `unpublishPlaybook`, `cloneFromMarketplace` rewritten the same way. Since `Playbook` has no direct `ownerUserId`, the owning user is resolved via the linked `Agent` (`tx.agent.findUnique({ where: { id: playbook.agentId }})`) inside the same transaction, and `marketplace.changed` is emitted to that owner. `PlaybookDb` extended with `'realtimeEvent'`; constructor takes optional `RealtimeEventWriter`. `createPlaybook`/`updatePlaybook`/`deletePlaybook`/`markExecuted`/`sharePlaybook` left unchanged. |
| `apps/api/src/main.ts` | `RealtimeRepository` instance is now constructed first and passed as the second constructor argument to `AgentRepository`, `SourceRepository`, and `PlaybookRepository`, so production wiring emits real realtime events. Removed the now-duplicate later declaration of `realtimeEventRepository`. |
| `apps/api/src/modules/source/routes.test.ts` | `InMemorySourceRepository` fake extended with a `readonly events: Array<{userId, topic, entityId?}>` list and an internal `emit()` helper; every mutation method now records events mirroring the production repository (including only emitting on the cloning-user's side, and only when `cloned === true`). Added 3 new tests: "emits source.changed for a newly created source owner", "emits source.changed and marketplace.changed after a successful marketplace clone", and "does not emit realtime events for failed, denied, not-found or already-cloned requests". Also added event assertions to the existing share/publish/clone test. `deleteSource` fake tightened to fetch-then-check existence first (matching production's owner-fetch-before-delete requirement). |
| `apps/api/src/modules/agents/routes.test.ts` | `createFakeRepo()` factory extended with an `events` array; `publishAgent`/`unpublishAgent`/`cloneFromMarketplace` push `marketplace.changed` entries (clone only targets the requester, only when `cloned === true`). Added event assertions to the existing "supports agent marketplace publish, unpublish, listing and clone" test, plus a new test "does not emit marketplace.changed events on denied publish/unpublish or already-cloned/not-found clone requests". |
| `apps/api/src/modules/playbook/routes.test.ts` | `InMemoryPlaybookRepository` extended with an `events` array; `publishPlaybook`/`unpublishPlaybook`/`cloneFromMarketplace` push `marketplace.changed` entries. Added event assertions to "supports full parity endpoint set with card metadata" and a not-emitted assertion to "restricts playbook publish/unpublish to owner or admin" (now also exercises a not-found clone). |

**Not modified:** `apps/api/src/modules/source/routes.ts`, `apps/api/src/modules/agents/routes.ts`, `apps/api/src/modules/playbook/routes.ts`. The brief lists these as "Modify," but after reviewing them no functional change was required: the `*RepositoryLike` interfaces and route handler signatures are unchanged, and routes never touch realtime directly — all event emission happens inside the repository's transaction. Forcing a diff in these files would have been a no-op change, which the task instructions say to avoid.

## Transaction approach

Every mutation now follows the brief's exact pattern:

```ts
await this.db.$transaction(async (tx) => {
  const changed = await tx.source.update(/* mutation */);
  await this.realtime.append(tx, { userId: changed.ownerUserId, topic: 'source.changed', entityId: changed.id });
  return changed;
});
```

Key decisions:
- **Owner resolution uses the true resource owner, not the acting user.** For publish/unpublish (and share/delete), the resource row is fetched *inside* the transaction (via `tx`, not `this.db`) and its owner (`ownerUserId` directly for Source/Agent, or resolved through the linked Agent for Playbook) is used as the event's `userId` — not `publisherUserId`/`grantedByUserId`, which could be an admin or edit-grantee.
- **Delete fetches the owner before deleting, inside the same transaction**, appending the event before the cascade-delete commits, per the brief's explicit instruction.
- **Clone emits both `source.changed` and `marketplace.changed` to the cloning (target) user, and only when `cloned === true`.** When an existing match is found (`cloned === false`), no event fires, and the whole lookup still runs inside `$transaction` for read consistency.
- **Backward compatibility:** each repository constructor's `RealtimeEventWriter` parameter defaults to a module-level no-op writer (`{ append: async () => {} }`), so any existing test/caller that constructs a repository with a single argument keeps compiling and behaving identically.

## Design decision: Agent/Playbook topic scope (self-review flag)

The `RealtimeTopic` union (`apps/api/src/modules/realtime/types.ts`) only has `source.changed`, `marketplace.changed`, `run.changed`, `report.changed`, `discussion.changed` — there is **no** `agent.changed` or `playbook.changed`. The brief's Step 3 header says "Apply the exact transaction pattern to: Agent create/update/delete/publish/unpublish/marketplace clone" and "Playbook create/update/delete/publish/unpublish/marketplace clone," which read literally could imply plain CRUD should also emit *some* event. However, Step 3's own closing sentence resolves this: *"Use `marketplace.changed` for publication lifecycle and clone actions; use the resource's own change topic only where a visible user-owned list exists."* Cross-referencing the design doc and Task 5/6 briefs confirmed the frontend only subscribes `source.changed → refreshSources()` and `marketplace.changed → refreshMarketplace()` — there is no consumer for an agent/playbook-specific topic.

**Conclusion applied:** Source gets `source.changed` for create/update/delete/share/publish/unpublish, plus `marketplace.changed` additionally for publish/unpublish/clone. Agent and Playbook get **only** `marketplace.changed`, and only for publish/unpublish/clone — their plain create/update/delete/share operations emit no realtime event (no topic exists to carry one). This is the interpretive judgment call most likely to be double-checked; flagging it explicitly here as requested.

A secondary, lower-risk decision: `shareSource` is included in the same transaction-and-append pattern for Source (emitting `source.changed` to the owner), following the brief's literal step-1 instruction to use the same callback for "create, update, delete, share, publish, unpublish and clone" — even though the topic-producers table in the wider design doc does not explicitly list `share` as a producer. Agent/Playbook `shareAgent`/`sharePlaybook` were **not** given this treatment since only Source has a `source.changed`-consuming list.

## Tests / results

Exact focused command from the brief:
```
cd apps/api
npx vitest run src/modules/source/routes.test.ts src/modules/agents/routes.test.ts src/modules/playbook/routes.test.ts
```
Result: **3 files, 50 tests, all passed.**

Additional validation performed:
- `npx vitest run src/modules/agents/repository.test.ts src/modules/playbook/repository.test.ts` — 11 tests, all passed (no `source/repository.test.ts` file exists in this repo; only `source/routes.test.ts` and `source/search.test.ts` cover the source module).
- `npx tsc -p tsconfig.build.json --noEmit` — no type errors.
- `npx vitest run` (full API suite) — **61 files, 468 tests, all passed.** No regressions elsewhere (confirms `main.ts` wiring change and constructor signature changes didn't break other callers).

## Commits

1. `feat(realtime): publish source and marketplace changes atomically`
   - Scope: `apps/api/src/modules/source`, `apps/api/src/modules/agents`, `apps/api/src/modules/playbook`
   - Trailer: `Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>`
2. `chore(realtime): wire RealtimeRepository into source/agent/playbook repos`
   - Scope: `apps/api/src/main.ts` (production wiring, kept as a separate commit since the brief's Step 5 `git add` list only names the three module directories)
   - Trailer: same as above

(See actual hashes in the terminal/CLI output of this session; both commits are on the current branch, not yet pushed/PR'd since the brief did not request that step.)

## Self-review

- **Confidence: high** on the mechanical transaction-wrapping pattern (matches the brief's code sample exactly) and on backward compatibility (full 468-test suite passes unchanged).
- **Confidence: medium-high** on the Agent/Playbook topic-scope interpretation (see design-decision section above) — it is well-supported by Step 3's own closing sentence and by the absence of any `agent.changed`/`playbook.changed` topic or frontend consumer, but it does diverge from a maximally-literal reading of the step's opening line.
- **Confidence: medium** on including `shareSource` (but not `shareAgent`/`sharePlaybook`) in the transaction+event pattern — a defensible, conservative reading of "use the same transaction callback for ... share ..." applied only where a `*.changed` topic exists to carry it (Source), consistent with the same topic-scope principle used for Agent/Playbook.
- `main.ts` changes were verified by running the full test suite (not just the focused set), since constructor signature changes there have blast radius beyond the three affected modules.
- Route files (`source/routes.ts`, `agents/routes.ts`, `playbook/routes.ts`) were deliberately left untouched after confirming no interface/behavior change was needed — noted as a deviation from the brief's file list, with justification, rather than silently complying by making a cosmetic no-op edit.

## Concerns for follow-up

1. **Agent/Playbook topic-scope decision** should be confirmed against the overall unified design doc owner's intent before Task 5 (frontend wiring) is implemented, since it hard-codes an assumption that Agent/Playbook pages don't need their own live-refresh topic.
2. **`shareSource` emitting `source.changed`** will cause the source list to "flicker-refresh" on the frontend (Task 5) every time any share/grant action happens, even though the source's own visible fields didn't change. This is harmless UX-wise (idempotent refetch) but worth knowing.
3. No repository-level (non-route) test file exists for the Source module; only route-level tests exercise `SourceRepository`. Consider adding a dedicated `source/repository.test.ts` in a future task if deeper repository-level transaction-atomicity tests (e.g., asserting rollback behavior on a mid-transaction failure) are desired — this task validated the transaction shape via route-level fakes and full-suite regression, not via a real-Prisma rollback test.
