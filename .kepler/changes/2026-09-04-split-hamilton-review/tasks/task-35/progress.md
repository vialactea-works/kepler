# Task Progress: Task 35 — Require located actionable Blocking findings

## Attempt 1 — 2026-09-05

- Outcome: done
- Created: none
- Modified:
  - `bundle/scripts/hamilton-artifact-contracts.sh`
  - `tests/scripts/change-context.test.ts`
  - `tests/scripts/precondition-check.test.ts`
  - `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`
  - `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-35/progress.md`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` — test-first run failed in the expected 28 new invalid-Blocking cases before implementation.
  - `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts` — passed, 310 tests.
  - Direct `hamilton_latest_verdict_pass` probes — accepted a multi-location priority finding and rejected both `- TBD.` and a malformed physical last pass.
  - `bun run test` — passed, 491 tests across 15 files.
  - `bun run build` — passed.
  - `git diff --check` — passed.
- Notes: Blocking findings now require one or more concrete `file:location` entries plus actionable prose. Optional numeric priority markers and ordinary unlocated Suggestions remain valid; both consumers use the shared parser with no fallback.
