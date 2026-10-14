---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 17
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 17 — Parse and validate per-pass review evidence

## Attempt 1 — 2026-09-17

- Outcome: done
- Created: `src/workbench/review-passes.ts`, `tests/workbench/review-passes.test.ts`
- Modified: `src/workbench/artifact-body.ts`, `src/workbench/artifact-contracts.ts`, `src/workbench/artifact-schemas.ts`, `src/workbench/artifact-types.ts`, `tests/workbench/artifact-contracts.test.ts`, `tests/workbench/artifact-schemas.test.ts`, `.hamilton/changes/2026-09-12-lint-skill-scripts/progress.md`, `.hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-17/progress.md`
- Deleted: none
- Verification focused: `bun --bun vitest run tests/workbench/review-passes.test.ts tests/workbench/artifact-contracts.test.ts tests/workbench/artifact-schemas.test.ts` — 3 files and 69 tests passed; `bun run build` — TypeScript build passed.
- Verification full: `TMPDIR=/tmp bun --bun vitest run` — 319 tests passed and one stale assertion failed in `tests/workbench/precondition.test.ts` because malformed multi-pass global-frontmatter feedback now correctly fails closed.
- Verification normalized: `TMPDIR=/tmp bun --bun vitest run --exclude tests/workbench/precondition.test.ts` — 22 files and 300 tests passed; `TMPDIR=/tmp bun --bun vitest run tests/cli/workbench.test.ts` — 11 tests passed.
- Verification whitespace: `git diff --check` and `git diff --cached --check` — clean.
- Notes: A single pure parser now owns feedback/review pass extraction, strict per-pass provenance, bounded one-pass global-frontmatter compatibility, physical-last fail-closed behavior, and typed body records. The stale precondition assertion is outside Task 17 and conflicts with the required multi-pass global-frontmatter rejection; feedback/review artifacts were left untouched. The immutable `.base` checkpoint and untracked `PR-44-STATE.md` were preserved.
