# Task Progress: Task 29 — Document the atomic installed-generation upgrade

## Attempt 1 — 2026-09-05
- Outcome: done
- Changed:
  - Created: none
  - Modified: `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, `docs/modes.md`, `.hamilton/changes/2026-09-04-split-hamilton-review/progress.md`, `.hamilton/changes/2026-09-04-split-hamilton-review/tasks/task-29/progress.md`
  - Deleted: none
- Verified:
  - `rg -n -i "accelerator|not (a )?dependenc|optional helper|optional.*script|manual recipe|manual fallback|runs? end to end.*without|pipeline.*without.*setup|five scripts|called by" README.md docs/skills.md docs/sdd-framework.md docs/modes.md` → no stale blanket optional-helper or colocated-manual-fallback claims remain
  - `rg -n "hamilton-(change-context|diff-package|precondition-check|isolate|prototype-branch)\\.sh" skills --glob SKILL.md` plus shared-library source tracing → documented consumers match live helper call sites and `hamilton-artifact-contracts.sh` dependencies
  - `bun --bun vitest run` → 15 files and 429 tests passed
  - `bun run build` → TypeScript compilation passed
  - `git diff --check` → passed with no whitespace errors
- Notes: Documented a between-changes atomic upgrade that finishes active old-format work first, updates the CLI bundle and agent-loaded skills from one release, reruns `hamilton setup`, and verifies the installed split templates, six script files, and seven-stage skill catalog. The helper reference now distinguishes the five entry points from their shared artifact-contract library and names the actual consumers. Explicit per-call-site fallbacks remain valid, but no blanket fallback is promised. No deviations or unresolved concerns.
