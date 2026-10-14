# Task Progress: Task 38 — Distinguish template placeholders from concrete literals

## Attempt 1 — 2026-09-05

- Outcome: done
- Changed paths:
  - Created: none
  - Modified: `bundle/scripts/hamilton-artifact-contracts.sh`, `tests/scripts/change-context.test.ts`, `tests/scripts/precondition-check.test.ts`, `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`, `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-38/progress.md`
  - Deleted: none
- Verification:
  - `bun --bun vitest run tests/scripts/change-context.test.ts tests/scripts/precondition-check.test.ts && bash -c 'source bundle/scripts/hamilton-artifact-contracts.sh; heading="Whole-branch Review: $(hamilton_plan_title .hamilton/changes/2026-09-04-split-hamilton-review/plan.md)"; hamilton_latest_verdict_pass .hamilton/changes/2026-09-04-split-hamilton-review/review.md "$heading" >/dev/null'` passed with 348 tests and canonical current whole-review history.
  - `bash bundle/scripts/hamilton-change-context.sh .hamilton/changes/2026-09-04-split-hamilton-review` reported the preserved whole review as `changes-requested (stale)`, not malformed.
  - `bash bundle/scripts/hamilton-precondition-check.sh --change-dir .hamilton/changes/2026-09-04-split-hamilton-review --test-cmd true` reported the ordinary latest `changes-requested` verdict and stale range, not malformed history.
  - `bun --bun vitest run` passed with 534 tests.
  - `bun run build` passed.
  - `git diff --check` passed.
- Notes: Placeholder rejection now uses only the six installed feedback/review template field literals in action prose. Concrete `<title>`, `<date>`, and `<reason>` literals remain valid in located actionable findings, and neither preserved review pass was modified.
