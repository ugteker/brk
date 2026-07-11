# Next Steps Checklist

## Immediate Next Task (Task 2: Schedule Engine)

- [ ] Create `src/modules/schedules/compute-next-run.test.ts`
- [ ] Add failing tests for:
  - [ ] interval mode next run
  - [ ] daily mode next run
  - [ ] due-check helper
- [ ] Implement `src/modules/schedules/compute-next-run.ts`
- [ ] Run targeted schedule tests until green

## After Task 2

- [ ] Task 3: Implement run queue (`src/modules/runs/*`) with claim/enqueue tests
- [ ] Task 4: Add admin routes (`POST /api/bots`, disable endpoint)
- [ ] Task 5: Scaffold frontend app and integrate shadcn/ui components
- [ ] Task 6: Wire scheduler loop and run acceptance command set

## Validation Discipline

- [ ] Keep TDD cycle per task: failing test -> minimal implementation -> passing tests
- [ ] Keep changes rooted under `G:\brk`
