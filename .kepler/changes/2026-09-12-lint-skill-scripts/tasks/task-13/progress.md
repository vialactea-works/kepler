---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 13
status: done
updated: 2026-09-13
decision: accepted
---

# Task Progress: Task 13 — Migrate skills to workbench commands

## Attempt 1 — 2026-09-12

- Outcome: done
- Created:
  - `tests/skills/workbench-contract.test.ts`
- Modified:
  - `.hamilton/changes/2026-09-12-lint-skill-scripts/progress.md`
  - `skills/hamilton-propose/SKILL.md`
  - `skills/hamilton-plan/SKILL.md`
  - `skills/hamilton-code/SKILL.md`
  - `skills/hamilton-orchestrate/SKILL.md`
  - `skills/hamilton-critique/SKILL.md`
  - `skills/hamilton-finish-work/SKILL.md`
  - `skills/hamilton-wayfinder-prototype/SKILL.md`
  - `tests/skills/finish-work-contract.test.ts`
  - `tests/skills/orchestrate-contract.test.ts`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/skills/finish-work-contract.test.ts tests/skills/orchestrate-contract.test.ts tests/skills/workbench-contract.test.ts` — passed (48 tests)
  - `bun run build` — passed
  - `bun run test` — passed (25 files, 682 tests)
  - `bun run build` — passed
  - `rg -n '~/.hamilton/scripts/|hamilton-(artifact-contracts|change-context|diff-package|isolate|precondition-check|prototype-branch)\\.sh' skills/hamilton-*/SKILL.md` — passed (no matches)
  - `git diff --check` — passed
- Notes:
  - Replaced every maintained Hamilton helper call with its matching `hamilton workbench` command while preserving skill-owned sequencing, judgment, fail-closed behavior, evidence handling, and migration boundaries.

## Attempt 2 — 2026-09-13

- Outcome: done
- Created: none
- Modified:
  - `.hamilton/changes/2026-09-12-lint-skill-scripts/progress.md`
  - `skills/hamilton-propose/SKILL.md`
  - `skills/hamilton-plan/SKILL.md`
  - `skills/hamilton-code/SKILL.md`
  - `skills/hamilton-orchestrate/SKILL.md`
  - `skills/hamilton-critique/SKILL.md`
  - `skills/hamilton-finish-work/SKILL.md`
  - `skills/hamilton-wayfinder-prototype/SKILL.md`
  - `tests/skills/finish-work-contract.test.ts`
  - `tests/skills/orchestrate-contract.test.ts`
  - `tests/skills/workbench-contract.test.ts`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/skills/finish-work-contract.test.ts tests/skills/orchestrate-contract.test.ts tests/skills/workbench-contract.test.ts && bun run build` — first run failed because the fallback assertion did not allow line wrapping; corrected run passed (49 tests) and build passed
  - `bun --bun vitest run tests/skills/finish-work-contract.test.ts tests/skills/orchestrate-contract.test.ts tests/skills/workbench-contract.test.ts && bun run build` — passed (3 files, 49 tests) and build passed
  - `bun run test && bun run build` — passed (25 files, 683 tests) and build passed
  - `rg -n '~/.hamilton/scripts/|hamilton-(artifact-contracts|change-context|diff-package|isolate|precondition-check|prototype-branch)\\.sh' skills/hamilton-*/SKILL.md` — passed (no matches)
  - `git diff --check` — passed
- Notes:
  - Updated the four reported manual fallbacks to name the Hamilton CLI/workbench and added focused contract coverage for that wording.
  - Reverted unrelated table, emphasis, and whole-file test formatting changes while preserving the workbench mappings and contract assertions.
  - Preserved the existing task checkpoint and feedback history; no sibling task evidence or `plan.md` was changed.
