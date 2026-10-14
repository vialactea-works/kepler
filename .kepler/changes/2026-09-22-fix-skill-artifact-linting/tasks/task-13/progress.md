---
artifact: task-progress
change: 2026-09-22-fix-skill-artifact-linting
task: 13
status: done
updated: 2026-09-23
decision: accepted
---

# Task Progress: Task 13 — Permit abandoned-task gaps in progress ledgers

## Attempt 1 — 2026-09-23

- Outcome: done
- Created:
  - None.
- Modified:
  - `src/workbench/artifact-body.ts`
  - `tests/workbench/artifact-contracts.test.ts`
  - `tests/workbench/lint.test.ts`
  - `.hamilton/changes/2026-09-22-fix-skill-artifact-linting/progress.md`
  - `.hamilton/changes/2026-09-22-fix-skill-artifact-linting/tasks/task-13/progress.md`
- Deleted:
  - None.
- Verification:
  - `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts` — passed: 106 tests.
  - `bun run build` — passed.
  - `bun run test` — failed: `tests/cli/workbench.test.ts` timed out at 5 seconds in `rejects invalid lint scopes before inspecting files`; the same test passes when run alone.
  - `bun run test -- --maxWorkers=1 --testTimeout=15000` — passed: 26 test files and 448 tests.
  - `bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` — passed: complete change-directory lint succeeded.
- Notes:
  - Progress-ledger ordering now remains contiguous for plans and is strictly increasing for active progress rows, preserving row parsing and identity, status, title, and exact-link validation.
  - The task checkpoint remains at `a7f5ddc8f6dbf7a9a69e1f98b00fe4748b6290b4` and is not tracked.
