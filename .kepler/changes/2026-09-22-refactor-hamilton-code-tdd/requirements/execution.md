---
artifact: requirements-change
capability: execution
change: 2026-09-22-refactor-hamilton-code-tdd
status: draft
created: 2026-09-22
author: Hermes Agent
decision: accepted
---

# Capability: execution

Hamilton's task execution skill turns one planned task into a verified implementation attempt while preserving task-local evidence, stable checkpoints, and the root task ledger.

## ADDED Requirements

*(none)*

## MODIFIED Requirements

### Requirement: TDD implementation cycle

`hamilton-code` SHALL execute each implementation cycle in the order red, green, and refactor. In red, it SHALL define or write the smallest test or executable check that demonstrates the intended missing behavior and SHALL run it to capture a failing result. In green, it SHALL make the smallest implementation change that makes that check pass and SHALL run the focused verification. In refactor, it SHALL improve the implementation without changing the intended behavior, SHALL keep the relevant tests passing, and SHALL hand the resulting implementation to `hamilton-code-feedback` for the refactor-phase review before the task is considered fully gated. A passing green check alone SHALL never authorize advancement.

- Priority: must
- Rationale: The implementation loop should make behavior-first development and review-driven cleanup explicit without weakening Hamilton's existing evidence ownership.

#### Scenario: ordinary behavior change

- WHEN a planned task can be exercised by a conventional test
- THEN the task-local attempt records a failing red check, a passing green check, and passing refactor verification in that order before the implementation attempt is handed to task feedback

#### Scenario: green is not the end of the cycle

- WHEN the focused test passes immediately after the smallest implementation
- THEN `hamilton-code` continues through refactoring and the driver dispatches `hamilton-code-feedback` before the task advances or the whole branch is reviewed

#### Scenario: feedback requests a correction

- WHEN the refactor-phase feedback pass returns `changes-requested`
- THEN the same task returns to `hamilton-code` for a new correction attempt, the finding is addressed through the same test-first cycle when a behavioral check is possible, and relevant verification runs again before fresh feedback is requested

### Requirement: Exceptional verification

When a conventional failing test cannot be written before implementation, `hamilton-code` SHALL record the concrete reason before changing production files and SHALL define a repeatable alternative verification strategy that exercises the intended observable behavior. The alternative SHALL run in place of the red/green test evidence, SHALL be kept passing through refactoring, and SHALL be supplied with the implementation context to `hamilton-code-feedback`. The exception SHALL NOT be used merely to avoid writing a feasible test.

- Priority: must
- Rationale: Documentation, configuration, integration-boundary, and other exceptional tasks still need explicit proof and an honest explanation for why a conventional red test is unavailable.

#### Scenario: no conventional test is possible

- WHEN a task's intended behavior cannot be expressed as a meaningful failing unit or integration test before implementation
- THEN the attempt records the concrete constraint and a repeatable alternative such as a contract check, fixture comparison, command smoke test, or other observable verification before the implementation is treated as green

#### Scenario: weak justification

- WHEN a conventional failing test is feasible but the implementer prefers not to write one
- THEN the exception is invalid and the implementation cycle remains incomplete until a failing test is added or a genuine constraint and alternative verification are recorded

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
