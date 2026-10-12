# Task Progress: Task 36 — Report only committed task approval state

## Attempt 1 — 2026-09-05

- Outcome: done
- Created: none
- Modified:
  - `bundle/scripts/hamilton-change-context.sh`
  - `tests/scripts/change-context.test.ts`
  - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
  - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-36/progress.md`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/scripts/change-context.test.ts -t "uncommitted|artifact-only committed approval"` — test-first run failed in the expected five new non-durable feedback cases before implementation; the artifact-only committed approval case passed.
  - `bun --bun vitest run tests/scripts/change-context.test.ts -t "uncommitted|artifact-only committed approval"` — passed, 6 selected tests.
  - `bun --bun vitest run tests/scripts/change-context.test.ts` — passed, 152 tests.
  - `bun run test` — passed, 497 tests across 15 files.
  - `bun run build` — passed.
  - `bash -n bundle/scripts/hamilton-change-context.sh` — passed.
  - `git diff --check` — passed.
- Notes: Task feedback is now reported as durable only when its current bytes and index match `HEAD` and its latest touching commit changes that feedback path alone. Present non-durable feedback is reported as `uncommitted`; committed malformed and stale histories remain distinct, and unrelated later commits do not invalidate a durable fresh verdict.
