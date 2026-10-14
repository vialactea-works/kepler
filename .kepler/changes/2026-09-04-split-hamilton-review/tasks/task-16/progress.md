# Task Progress: Task 16 — Enforce canonical task attempt grammar

## Attempt 1 — 2026-09-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: `bundle/scripts/hamilton-change-context.sh`, `bundle/scripts/hamilton-precondition-check.sh`, `tests/scripts/change-context.test.ts`, `tests/scripts/precondition-check.test.ts`, `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`, `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-16/progress.md`
  - Deleted: none
- Verified: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → 2 files and 172 tests passed
- Verified: `bun run test` → 15 files and 332 tests passed
- Verified: `bun run build` → TypeScript build passed
- Verified: `! rg -n "LEGACY_TASK_ONE_PROGRESS|reads canonical attempts alongside|exact legacy task attempts|heading != task|Task 1|2026-09-04-split-hamilton-review" bundle/scripts/hamilton-change-context.sh bundle/scripts/hamilton-precondition-check.sh` → no legacy fallback, task-number special case, or change-slug special case found
- Notes: Canonical attempt headings must begin at 1 and increase contiguously in physical order; alternate task-titled headings remain unsupported inventory/rejection fixtures only.
