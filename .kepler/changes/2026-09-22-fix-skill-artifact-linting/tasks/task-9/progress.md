---
artifact: task-progress
change: 2026-09-22-fix-skill-artifact-linting
task: 9
status: done
updated: 2026-09-23
decision: accepted
---

# Task Progress: Task 9 — Correct remaining author-bearing template guidance

## Attempt 1 — 2026-09-23

- Outcome: done

Created: none
Modified: bundle/templates/plan.md, bundle/templates/requirements-spec.md, bundle/templates/proposal.md, bundle/templates/requirements-change.md, bundle/templates/design.md, tests/templates/artifact-contracts.test.ts
Deleted: none
Verification: `bun --bun vitest run tests/templates/artifact-contracts.test.ts` → initial baseline passed (11 tests); after extending assertions, failed as expected before implementation; final run passed (11 tests)
Verification: `bun run test` → passed (26 test files, 442 tests)
Verification: `bun run build` → passed
Verification: `bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` → passed
Verification: stale-author-hint inspection across all five templates → no matches; author guidance remained inside disposable instruction blocks
Notes: Implemented the planned common Git identity, missing-identity, and edit-preservation guidance without changing skills or schemas.
