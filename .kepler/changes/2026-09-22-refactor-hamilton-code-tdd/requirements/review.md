---
artifact: requirements-change
capability: review
change: 2026-09-22-refactor-hamilton-code-tdd
status: draft
created: 2026-09-22
author: Hermes Agent
decision: accepted
---

# Capability: review

Hamilton's task feedback skill judges one implementation attempt within its stable diff and controls whether that task may advance toward whole-branch review.

## ADDED Requirements

*(none)*

## MODIFIED Requirements

### Requirement: Refactor-phase task feedback

`hamilton-code-feedback` SHALL act as the explicit review mechanism for the refactor phase of a `hamilton-code` cycle. It SHALL receive the exact task acceptance and cited constraints, project standards, the stable checkpoint-to-head diff, the latest task-local implementation evidence, and any recorded exceptional-verification justification. It SHALL judge whether the implementation preserves the passing behavior while satisfying code-quality expectations. An `approved` pass SHALL permit the driver to advance; a `changes-requested` pass SHALL identify findings that the next `hamilton-code` correction attempt must resolve. Findings SHALL remain in the append-only task feedback artifact and SHALL not be silently skipped, rewritten, or fixed by the reviewer itself.

- Priority: must
- Rationale: The separate tactical reviewer is the durable gate for refactoring quality and keeps implementation, review, and evidence ownership distinct.

#### Scenario: review after refactoring

- WHEN `hamilton-code` has completed green verification and its behavior-preserving refactor
- THEN `hamilton-code-feedback` reviews the stable task diff and latest red/green/refactor evidence before the task is advanced

#### Scenario: requested refactor change

- WHEN feedback identifies a correctness, test, quality, scope, or boundary defect
- THEN it records a `changes-requested` pass with a located finding, and orchestration routes the same task back to `hamilton-code` rather than advancing

#### Scenario: approved refactor

- WHEN the stable diff, task evidence, acceptance criteria, and project standards contain no blocking finding
- THEN feedback records an artifact-only `approved` pass and orchestration may select the next task or whole-branch review

#### Scenario: exceptional verification review

- WHEN the implementation uses the exceptional verification path
- THEN feedback checks the recorded justification and alternative verification instead of treating the absence of a conventional red test as an automatic approval

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
