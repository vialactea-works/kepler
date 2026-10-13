---
artifact: plan
change: 2026-10-12-example-dependency-execution
status: approved
created: 2026-10-12
author: Example Author <example@example.com>
decision: accepted
execution: {version: 2, mode: dependencies}
route_unit: null
intent_approvals: []
initialization:
  version: 1
  base: 0123456789abcdef0123456789abcdef01234567
  authority: illustrative only
  breakdown: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  taskIds: [1, 2, 3, 4]
---

# Plan: Example dependency execution

## Overview

- Change: docs/examples/dependency-task-execution/
- Goal: Illustrate dependency execution without authorizing real work.
- Spec impact: no canonical behavior change; example only.
- Test: `bun --bun vitest run tests/docs tests/templates`
- Build / typecheck: `bun run build`
- Context notes: This example is disposable; identifiers are illustrative.
- Quality notes: none.

## Tasks

### Task 1: Prepare shared contract

- Goal: Establish a fictional shared contract for downstream examples.
- Acceptance:
  - The example establishes a contract without implying execution evidence.
- Depends on: Task 4
- Files: optional guidance — `docs/examples/dependency-task-execution.md`
- Steps:
  1. Red — add a behavioral check for the example contract.
  2. Green — add the minimal example content.
  3. Refactor — rerun the focused checks.
- Verify: `bun --bun vitest run tests/docs tests/templates`
- Commit: `docs: add example shared contract`

### Task 2: Join completed branches

- Goal: Show a join that remains held until both prerequisites are fully gated.
- Acceptance:
  - Task 2 depends on Tasks 1 and 3 and is held until both are fully gated.
- Depends on: Task 1, Task 3
- Steps:
  1. Red — check the two-prerequisite join.
  2. Green — represent held and eligible state separately from root status.
  3. Refactor — validate the artifact.
- Verify: `bun --bun vitest run tests/docs tests/templates`
- Commit: `docs: show dependency join`

### Task 3: Add independent branch

- Goal: Show an independent eligible branch.
- Acceptance:
  - Task 3 has no dependencies and may run independently of Task 1.
- Depends on: Task 4
- Steps:
  1. Red — check independent readiness.
  2. Green — state eligibility rules.
  3. Refactor — validate the example.
- Verify: `bun --bun vitest run tests/docs tests/templates`
- Commit: `docs: show independent branch`

### Task 4: Add later-numbered prerequisite

- Goal: Illustrate a later-numbered prerequisite.
- Acceptance:
  - Task 4 has no dependencies and may be admitted before Tasks 1 and 3; identity does not imply order.
- Depends on: none
- Steps:
  1. Red — check identity does not imply order.
  2. Green — show Task 4 ready first, then Tasks 1 and 3 eligible, with Task 2 held.
  3. Refactor — validate the example.
- Verify: `bun --bun vitest run tests/docs tests/templates`
- Commit: `docs: show later numbered prerequisite`

## Done when

The example is lint-valid and makes no execution or approval claim.
