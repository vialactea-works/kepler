---
artifact: feedback
change: 2026-09-12-lint-skill-scripts
task: 15
created: 2026-09-13
status: resolved
verdict: approved
decision: accepted
base: 37293d8129e293e48ab598c0952a816fe95177b7
head: ee718b0cab63dca39b3af4f9576a04927e42adbb
---

# Code Feedback: Task 15 — Delete obsolete shell helpers and tests

## Pass 1 — 2026-09-13

### Blocking

- [tests/skills/finish-work-contract.test.ts:22; tests/skills/orchestrate-contract.test.ts:129] The diff removes assertions that maintained skills contain no `~/.hamilton/scripts/` references, weakening the contract coverage for the task's no-old-helper requirement; restore both absence assertions (violates: task acceptance requiring no maintained skill requires old helpers; behavioral tests must not be weakened).

### Suggestions

- None.

## Pass 2 — 2026-09-13

### Blocking

- None.

### Suggestions

- None.
