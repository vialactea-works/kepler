# Task Progress: Task 17 — Centralize exact active-task resolution

## Attempt 1 — 2026-09-05

- Outcome: done
- Changed:
  - Created: `bundle/scripts/hamilton-artifact-contracts.sh`
  - Modified: `bundle/scripts/hamilton-change-context.sh`, `bundle/scripts/hamilton-diff-package.sh`, `bundle/scripts/hamilton-precondition-check.sh`, `tests/scripts/change-context.test.ts`, `tests/scripts/diff-package.test.ts`, `tests/scripts/precondition-check.test.ts`, `tests/cli/setup.test.ts`, `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`, `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-17/progress.md`
  - Deleted: none
- Verified: `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/diff-package.test.ts tests/scripts/precondition-check.test.ts tests/cli/setup.test.ts` → 4 files and 217 tests passed
- Verified: `bun run test` → 15 files and 342 tests passed
- Verified: `bun run build` → TypeScript build passed
- Verified: `bash -n bundle/scripts/hamilton-artifact-contracts.sh bundle/scripts/hamilton-change-context.sh bundle/scripts/hamilton-diff-package.sh bundle/scripts/hamilton-precondition-check.sh` → all modified shell scripts passed syntax validation
- Verified: `rg` Bash 3.2 incompatibility scan → no lowercase expansion or `mapfile` usage found in the shared parser or its consumers
- Notes: Exact canonical abandonment suffixes are excluded; malformed suffixes remain active, commented declarations remain hidden, and duplicate positive ids fail closed through the shared installed dependency.
