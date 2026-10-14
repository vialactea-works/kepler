---
artifact: task-progress
change: 2026-09-22-fix-skill-artifact-linting
task: 6
status: done
updated: 2026-09-23
decision: accepted
---

# Task Progress: Task 6 — Accept the first pending finish intent

## Attempt 1 — 2026-09-23

- Changes:
  - Narrowed finish-history validation to permit one complete pending unmatched Attempt N at the physical end, including Attempt 1.
  - Added finish intent-field validation for all parsed attempts.
  - Added body-contract and temporary-file scoped lint coverage for valid and invalid finish histories.
- Created: none.
- Modified:
  - `src/workbench/artifact-body.ts`
  - `tests/workbench/artifact-contracts.test.ts`
  - `tests/workbench/lint.test.ts`
  - `.hamilton/changes/2026-09-22-fix-skill-artifact-linting/progress.md`
  - `.hamilton/changes/2026-09-22-fix-skill-artifact-linting/tasks/task-6/progress.md`
- Deleted: none.
- Verification:
  - `bun dist/cli/main.js workbench isolate --check --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` — passed; isolated: yes.
  - `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts` — initially failed as expected with two first-intent failures before the production change; passed afterward with 104 tests.
  - `git diff --check` — passed.
  - `bun run test` — first run had one unrelated 5-second test timeout in `tests/cli/workbench.test.ts` (436 passed); rerun passed all 437 tests.
  - `bun run build` — passed (`tsc -p tsconfig.json`).
  - `bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` — passed; lint: success.
- Outcome: done
- Notes:
  - Reused and preserved checkpoint `74fc7cbb85a43fcad90f385de09e1b47b7a2b09d`; `.base` remains ignored and untracked.
