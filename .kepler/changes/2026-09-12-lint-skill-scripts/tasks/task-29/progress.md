---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 29
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 29 — Promote lint read failures to environment errors

## Attempt 1 — 2026-09-17

- Outcome: done

Created: none
Modified: src/workbench/lint.ts, tests/workbench/lint.test.ts
Deleted: none
Verification: `bun --bun vitest run tests/workbench/lint.test.ts && bun run build` → 43 tests passed; `tsc -p tsconfig.json` passed
Verification: `bun run test` → 404 tests passed; the pre-existing fixed-timeout test `tests/cli/workbench.test.ts` remained failing
Verification: `git diff --check` → passed
Notes: Reader read-failures now use a typed candidate environment-error branch and return the existing exit-2 invalid-scope result with deterministic path and message rendering. Readable invalid YAML remains an exit-1 lint finding. The unrelated full-suite timeout was preserved because it is outside the allowed files.
