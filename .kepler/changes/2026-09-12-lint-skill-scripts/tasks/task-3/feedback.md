---
artifact: feedback
change: 2026-09-12-lint-skill-scripts
task: 3
created: 2026-09-12
status: resolved
verdict: approved
decision: accepted
base: b76aa669fdf0173074940d9c83cfc5a8926bf11d
head: 922bce234e7357589e1e4a037f2df5f32d3be576
---

# Code Feedback: Task 3 — Validate artifact bodies and workflow records

## Pass 1 — 2026-09-12

### Blocking

- [src/workbench/artifact-contracts.ts:890] The `progress` body contract declares no workflow records, so a plan/task progress ledger is accepted with missing or malformed ledger rows and exposes an empty `workflow.records` array. Add contract-specific ledger extraction with location-bearing validation (including numbering where required) and cover valid and malformed ledger rows in tests (violates: Task 3 acceptance for plan/task ledgers to expose structured workflow data and for malformed/non-monotonic records to fail closed).
- [src/workbench/artifact-contracts.ts:1003] The append-only record expression accepts arbitrary trailing text after a valid date because it ends with `(?:$| )`; for example, `Pass 1 — 2026-09-12 garbage` is parsed as valid and produces no diagnostic. Anchor the declared record grammar (or explicitly validate an allowed suffix) and add a regression test with a location-bearing `invalid-record` diagnostic (violates: Task 3 acceptance that malformed records produce diagnostics).

### Suggestions

- None.

## Pass 2 — 2026-09-12

### Blocking

- [src/workbench/artifact-contracts.ts:1026] Record-bearing contracts are accepted with no workflow records: after comment removal, a feedback, review, task-progress, finish, or route body containing only its title and structural sections yields `workflow.records: []` with no diagnostic, and a record-shaped heading at an unsupported level is ignored. Require each declared record shape to contain the required valid record(s), reject comment-only or wrong-level records with location-bearing diagnostics, and add regression tests (violates: Task 3 acceptance for append-only record grammar and structured workflow data, plus the constraint that HTML comments cannot satisfy required records).

### Suggestions

- None.

## Pass 3 — 2026-09-12

### Blocking

- None.

### Suggestions

- None.
