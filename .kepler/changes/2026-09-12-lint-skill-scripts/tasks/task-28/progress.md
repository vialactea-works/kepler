---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 28
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 28 — Restore progress ledger parsing parity

## Attempt 1 — 2026-09-17

- Outcome: done
- Created: none
- Modified: src/workbench/artifact-body.ts, tests/workbench/artifact-contracts.test.ts, tests/workbench/precondition.test.ts
- Deleted: none
- Verification: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/precondition.test.ts && bun run build` passed with 74 tests and a clean TypeScript build; `git diff --check` passed; `bun run test` previously reached 397 passed and 1 failed because the unchanged tests/cli/workbench.test.ts physical-latest consumer test exceeded its fixed 15-second timeout, and its final rerun was interrupted before completion.
- Notes: Progress table parsing now honors escaped pipe delimiters, exposes unescaped titles, preserves malformed-row diagnostics, and permits a structurally valid zero-row ledger while existing cross-artifact checks enforce active-task cardinality. The CLI timeout remained outside Task 28's allowed files and no CLI test was modified.

## Attempt 2 — 2026-09-17

- Outcome: done
- Created: none
- Modified: .hamilton/changes/2026-09-12-lint-skill-scripts/progress.md, .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-28/progress.md
- Deleted: none
- Verification: `bun --bun vitest run tests/workbench/artifact-contracts.test.ts tests/workbench/precondition.test.ts` passed with 74 tests; `bun run build` passed; `git diff --check` passed; `bun run test` reported 401 passed and 1 failed because the unchanged tests/cli/workbench.test.ts physical-latest consumer test exceeded its fixed 15-second timeout; `bun --bun vitest run --testTimeout=60000` reproduced the same fixed 15-second timeout with 401 passed and 1 failed.
- Notes: Synchronized the Task 28 root metadata status with its done ledger row. Reused the existing checkpoint and preserved the implementation, prior attempt, prior feedback, plan, and later-task files. No implementation files were changed. The unrelated CLI timeout remains outside Task 28's allowed files.
