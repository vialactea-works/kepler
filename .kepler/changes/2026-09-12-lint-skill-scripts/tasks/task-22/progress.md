---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 22
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 22 — Model legacy review transitions

## Attempt 1 — 2026-09-17

- Outcome: done
- Created: none
- Modified: .hamilton/changes/2026-09-12-lint-skill-scripts/progress.md, src/workbench/artifact-types.ts, src/workbench/review-passes.ts, src/workbench/artifact-body.ts, tests/workbench/review-passes.test.ts, tests/workbench/artifact-contracts.test.ts, .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-22/progress.md
- Deleted: none
- Verification: `bun --bun vitest run tests/workbench/review-passes.test.ts tests/workbench/artifact-contracts.test.ts` → 61 tests passed; `bun run build` → passed; `bun run src/cli/main.ts workbench lint --file .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-3/feedback.md` → exit 0 and valid; `git diff --check` → passed; `bun --bun vitest run` → 366 tests passed and 6 existing downstream lint/context assertions failed because Task 23 updates those consumers for the new accepted transition semantics.
- Notes: Added structural, per-pass, and legacy-global provenance records. Global metadata is bound only to the physical last pass in legacy-only histories; transitioned histories require a fieldless prefix followed by an explicit suffix; workflow records omit synthetic Base, Head, and Verdict fields for structural history. The six full-suite failures are limited to the planned Task 23 consumer-test boundary and do not affect the Task 22 focused verification. Review artifacts, feedback artifacts, and PR-44-STATE.md were not modified.
