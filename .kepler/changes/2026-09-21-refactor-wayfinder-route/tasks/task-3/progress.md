---
artifact: task-progress
change: 2026-09-21-refactor-wayfinder-route
task: 3
status: done
updated: 2026-09-21
decision: accepted
---

# Task Progress: Task 3 — Replace the installed route template

## Attempt 1 — 2026-09-21

- Outcome: done
- Created: none
- Modified:
  - `bundle/templates/wayfinder/route.md`
  - `tests/cli/setup.test.ts`
  - `.hamilton/changes/2026-09-21-refactor-wayfinder-route/progress.md`
- Deleted: none
- Verification:
  - `bun --bun vitest run tests/cli/setup.test.ts` — failed before template replacement as expected: required destination-first sections were absent.
  - `bun --bun vitest run tests/cli/setup.test.ts tests/workbench/artifact-contracts.test.ts` — passed: 2 test files, 63 tests.
  - `bun run test` — passed: 24 test files, 414 tests.
  - `bun run build` — passed: `tsc -p tsconfig.json`.
  - `git diff --check` — passed.
- Notes: Replaced the route template with the approved exact destination-first shape. Setup now verifies byte-for-byte installation and all five required body sections. Frontmatter remains the sole owner of unit identity, lifecycle, dependencies, and backing tickets; Wayfinder does not implement units.
