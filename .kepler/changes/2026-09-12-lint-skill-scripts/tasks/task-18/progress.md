---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 18
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 18 — Lint per-pass review evidence

## Attempt 1 — 2026-09-17

- Outcome: done
- Decision: accepted
- Created: none
- Modified:
  - `src/workbench/lint.ts`
  - `tests/workbench/lint.test.ts`
  - `.hamilton/changes/2026-09-12-lint-skill-scripts/progress.md`
  - `.hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-18/progress.md`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/workbench/lint.test.ts` — passed, 40 tests.
  - `bun --bun vitest run tests/workbench/lint.test.ts && bun run build` — passed, 40 tests and TypeScript build.
  - `bun run test` — 349 of 351 tests passed; the two failures were the stale precondition expectation for parsed review evidence and an unrelated temporary-path assertion in `tests/cli/workbench.test.ts`.
  - `bun run build` — passed.
  - `git diff --check` — passed.
- Notes:
  - Added lint fixtures for every shared per-pass diagnostic code and representative parser failure, valid multi-pass changes-requested-to-approved evidence, and one-pass legacy global-frontmatter compatibility.
  - Lint now preserves the source path carried by shared contract diagnostics while retaining explicit scope selection, skipped files, finding ordering, and exit semantics.
  - The full-suite precondition failure is outside Task 18 and was left unchanged for Task 19.
