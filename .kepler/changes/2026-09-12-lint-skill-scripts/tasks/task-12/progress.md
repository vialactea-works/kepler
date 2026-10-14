---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 12
status: done
updated: 2026-09-13
decision: accepted
---

# Task Progress: Task 12 — Remove script installation from setup

## Attempt 1 — 2026-09-13

- Outcome: done
- Created: none
- Modified:
  - `src/cli/commands/setup.ts`
  - `src/paths.ts`
  - `tests/cli/setup.test.ts`
  - `tests/paths.test.ts`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/cli/setup.test.ts tests/paths.test.ts` before implementation — expected failure: 5 migration assertions failed.
  - `bun --bun vitest run tests/cli/setup.test.ts tests/paths.test.ts && bun run build` — passed: 2 files, 19 tests, and TypeScript build.
  - `bun --bun vitest run` — passed: 24 files, 676 tests; the chained build exceeded the command timeout.
  - `bun run build` — passed: `tsc -p tsconfig.json`.
  - `git diff --check` — passed.
  - Temporary-HOME CLI setup inspection — passed: templates, guidelines, and settings installed; output reported templates only; no scripts directory created.
- Notes: Removed helper-script installation, reporting, and path exposure while preserving existing script directories and contents.
