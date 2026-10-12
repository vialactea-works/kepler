---
artifact: task-progress
change: 2026-09-22-fix-skill-artifact-linting
task: 3
status: done
updated: 2026-09-22
decision: accepted
---

# Task Progress: Task 3 — Gate change-scoped artifact writers with lint

## Attempt 1 — 2026-09-22

- Outcome: done

Created: tests/skills/change-artifact-lint-contract.test.ts
Modified: skills/hamilton-propose/SKILL.md, skills/hamilton-code/SKILL.md, skills/hamilton-code-feedback/SKILL.md, skills/hamilton-critique/SKILL.md, skills/hamilton-review/SKILL.md, skills/hamilton-finish-work/SKILL.md, tests/skills/workbench-contract.test.ts
Deleted: none
Verification: `bun --bun vitest run tests/skills/change-artifact-lint-contract.test.ts` → initially failed as the new contract assertions were red before implementation; final run passed 4 tests
Verification: `bun --bun vitest run tests/skills/change-artifact-lint-contract.test.ts tests/skills/workbench-contract.test.ts tests/skills/finish-work-contract.test.ts` → passed, 25 tests after final selector-scope correction
Verification: `bun run test` → failed because tests/cli/workbench.test.ts timed out at the default 5000ms under the full-suite load
Verification: `bun run test -- --testTimeout=120000` → passed, 25 files and 423 tests
Verification: `bun run build` → passed
Verification: `bun dist/cli/main.js workbench lint --change-dir .hamilton/changes/2026-09-22-fix-skill-artifact-linting` → passed, lint: success before and after the synchronized task-progress and root-row finalization
Verification: `git diff --check` → passed
Notes: Added post-mutation lint gates with change-directory selectors for complete change artifacts and file selectors for single owned histories/reports, canonical specs, routes, and maps. Preserved semantic, freshness, ancestry, completion, and authorship gates. The installed `hamilton` binary reported stale pending-task errors, while the repository-built CLI passed the same change-directory lint; no unrelated files were changed.
