# Task Progress: Task 27 — Instantiate installed artifact templates in producers

## Attempt 1 — 2026-09-05

- Outcome: done
- Changed:
  - Created: none
  - Modified: skills/hamilton-code/SKILL.md, skills/hamilton-code-feedback/SKILL.md, skills/hamilton-review/SKILL.md, skills/hamilton-finish-work/SKILL.md, tests/skills/execution-contracts.test.ts, tests/skills/code-feedback-contract.test.ts, tests/skills/review-contract.test.ts, tests/skills/finish-work-contract.test.ts, .hamilton/changes/2026-09-04-split-hamilton-review/progress.md, .hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-27/progress.md
  - Deleted: none
- Verified: `bun --bun vitest run tests/skills/execution-contracts.test.ts tests/skills/code-feedback-contract.test.ts tests/skills/review-contract.test.ts tests/skills/finish-work-contract.test.ts` → 4 files passed, 45 tests passed
- Verified: `bun --bun vitest run` → 15 files passed, 427 tests passed
- Verified: `bun run build` → TypeScript build passed
- Verified: copied full artifact skeleton search across the four producer skills → no matches
- Verified: `git diff --check` → passed with no whitespace errors
- Notes: Each producer now loads its exact installed template, removes authoring instructions and inline hints, and retains fail-closed append-only lifecycle validation without duplicating the full artifact shape in skill prose. Existing feedback passes remain immutable while retained template authoring markup can be cleaned before the next append.
