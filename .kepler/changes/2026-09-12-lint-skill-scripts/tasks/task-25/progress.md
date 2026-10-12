---
artifact: task-progress
change: 2026-09-12-lint-skill-scripts
task: 25
status: done
updated: 2026-09-17
decision: accepted
---

# Task Progress: Task 25 — Document the review transition contract

## Attempt 1 — 2026-09-17

- Outcome: done
- Created: none
- Modified: .hamilton/specs/artifact-templates.md, .hamilton/specs/review.md, .hamilton/specs/workbench.md, docs/sdd-framework.md, docs/skills.md, tests/docs/workbench-docs.test.ts, .hamilton/changes/2026-09-12-lint-skill-scripts/progress.md, .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-25/progress.md
- Deleted: none
- Verification: `bun --bun vitest run tests/docs/workbench-docs.test.ts` → initial red phase reported 3 failing contract tests before documentation edits; final focused run passed 6 tests; `bun --bun vitest run tests/docs/workbench-docs.test.ts && bun run build && git diff --check && ! rg -n "one-pass (global-frontmatter )?compatibility|only for a one-pass history|only when the artifact contains exactly one pass" .hamilton/specs/artifact-templates.md .hamilton/specs/review.md .hamilton/specs/workbench.md docs/sdd-framework.md docs/skills.md` → documentation suite passed, build passed, whitespace check passed, and superseded-language search found no matches; `bun --bun vitest run` → 383 tests passed across 23 files; `bun run build` → passed; `git diff --check` → passed
- Notes: Synchronized the canonical specifications and framework documents around the parser and producer vocabulary: `legacy-global`, `transitioned`, and `modern`. Documented structural legacy prefixes without verdict provenance, global provenance bound only to the physical last legacy pass, the atomic first modern append that preserves pass bodies and removes global fields, strict pass-local suffixes, physical-latest evidence authority, and fail-closed malformed transitions. Added documentation contract coverage while preserving single-file append-only ownership, full commit identifiers, freshness checks, and the prohibition on numbered histories. No review, feedback, plan, sibling task artifact, or PR-44-STATE.md was modified.

## Attempt 2 — 2026-09-17

- Outcome: done
- Created: none
- Modified: .hamilton/changes/2026-09-12-lint-skill-scripts/tasks/task-25/progress.md
- Deleted: none
- Verification: `bun --bun vitest run tests/docs/workbench-docs.test.ts` → 1 file and 18 tests passed; `bun run build` → passed; `git diff --check` → passed; `! rg -n "one-pass (global-frontmatter )?compatibility|only for a one-pass history|only when the artifact contains exactly one pass" .hamilton/specs/artifact-templates.md .hamilton/specs/review.md .hamilton/specs/workbench.md docs/sdd-framework.md docs/skills.md` → passed with no matches; `timeout 180s bun --bun vitest run` → 23 files and 407 tests passed
- Notes: Repaired only the task-local frontmatter status from `pending` to `done` and preserved Attempt 1 byte-for-byte. The implementation correction and approved Task 25 feedback already existed at the supplied heads; the root Task 25 row was restored to its existing `done` state after the required retry transition. No plan, implementation, feedback, sibling task artifact, or checkpoint was changed.
