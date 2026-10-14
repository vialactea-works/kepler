# Task Progress: Task 32 — Bind whole-review identity to the owning plan

## Attempt 1 — 2026-09-05

- Outcome: done
- Created: none
- Modified:
  - `bundle/scripts/hamilton-artifact-contracts.sh`
  - `bundle/scripts/hamilton-change-context.sh`
  - `bundle/scripts/hamilton-precondition-check.sh`
  - `tests/scripts/change-context.test.ts`
  - `tests/scripts/precondition-check.test.ts`
  - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
  - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-32/progress.md`
- Deleted: none
- Verified:
  - `bash -n bundle/scripts/hamilton-artifact-contracts.sh bundle/scripts/hamilton-change-context.sh bundle/scripts/hamilton-precondition-check.sh` → all three shell scripts passed syntax validation.
  - `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` → 2 test files passed with 260 tests.
  - `bun --bun vitest run` → 15 test files passed with 441 tests.
  - `bun run build` → TypeScript compilation succeeded.
  - `git diff --check` → no whitespace errors.
- Notes: Both whole-review consumers now derive the sole accepted review owner from one exact plan H1 resolver. Copied or decorated review headings and missing, duplicate, decorated, or wrong-kind plan H1s fail closed without weakening verdict, range, freshness, or committed-evidence checks.
