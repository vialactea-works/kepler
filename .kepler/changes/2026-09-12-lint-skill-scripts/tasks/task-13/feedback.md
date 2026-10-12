---
artifact: feedback
change: 2026-09-12-lint-skill-scripts
task: 13
created: 2026-09-13
status: resolved
verdict: approved
decision: accepted
base: a561a85d971c3ae484ce114889583b466219c33f
head: 8b9b53cfb29b60da0d55be00c90f180a2a53f88b
---

# Code Feedback: Task 13 — Migrate skills to workbench commands

## Pass 1 — 2026-09-13

### Blocking

- [skills/hamilton-code/SKILL.md:62-64; skills/hamilton-orchestrate/SKILL.md:192-194; skills/hamilton-critique/SKILL.md:71-74; skills/hamilton-finish-work/SKILL.md:112-115] The call sites now use `hamilton workbench`, but the fallback paths still refer to an installed script or an unavailable script. After this migration, the relevant failure condition is an unavailable Hamilton CLI/workbench; stale wording can make the skill check the obsolete support surface instead of applying its manual fallback. Update these fallbacks to name the Hamilton CLI/workbench and add contract coverage for the migration wording (violates: skill-owned migration boundaries and preserved skill language semantics).
- [skills/hamilton-orchestrate/SKILL.md:139,178; skills/hamilton-propose/SKILL.md:146-150; skills/hamilton-wayfinder-prototype/SKILL.md:43-44; tests/skills/finish-work-contract.test.ts:1-209; tests/skills/orchestrate-contract.test.ts:1-319] The head includes unrelated formatting-only edits alongside the migration: table delimiter rewrites, prose emphasis changes, and whole-file semicolon insertion/reflow in existing contract tests. Revert these extraneous hunks and retain only the workbench mapping and necessary contract assertions (violates: task scope and hygiene; project style consistency).

### Suggestions

- None.

## Pass 2 — 2026-09-13

### Blocking

- None.

### Suggestions

- None.
