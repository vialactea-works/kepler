# Task Progress: Task 23 — Require committed finish-gate evidence

## Attempt 1 — 2026-09-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `bundle/scripts/hamilton-precondition-check.sh`, `tests/scripts/precondition-check.test.ts`, `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`, `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-23/progress.md`
  - Deleted: none
- Verified: `bun --bun vitest run tests/scripts/precondition-check.test.ts` → 1 test file and 133 tests passed.
- Verified: `bun run test` → 15 test files and 421 tests passed.
- Verified: `bun run build` → TypeScript build passed.
- Notes: Exact-at-HEAD validation also checks the index so a staged-only change cannot pass when the working file has been restored to committed bytes.
