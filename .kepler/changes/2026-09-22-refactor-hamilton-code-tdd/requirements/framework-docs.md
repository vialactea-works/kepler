---
artifact: requirements-change
capability: framework-docs
change: 2026-09-22-refactor-hamilton-code-tdd
status: draft
created: 2026-09-22
author: Hermes Agent
decision: accepted
---

# Capability: framework-docs

Hamilton's framework documentation explains the role, inputs, outputs, and handoffs of each core skill and the artifacts that carry a change through the pipeline.

## ADDED Requirements

*(none)*

## MODIFIED Requirements

### Requirement: Document the TDD task loop

The public skill and SDD framework references SHALL describe `hamilton-code` as an ordered red/green/refactor cycle, SHALL identify `hamilton-code-feedback` as the refactor-phase tactical gate, SHALL state that green alone does not complete a task, and SHALL explain that requested feedback returns the same task to a new correction cycle with verification before advancement. The documentation SHALL also describe the required justification and alternative verification path for tasks that cannot begin with a conventional failing test.

- Priority: must
- Rationale: Readers need the same workflow contract that the executable skills enforce; otherwise the handoff remains ambiguous even when the skill files are correct.

#### Scenario: reader follows a normal task

- WHEN a reader consults the skills reference or SDD framework before implementing a planned task
- THEN the reader can identify the red, green, refactor, feedback, and correction order without inferring it from separate pages

#### Scenario: reader encounters an exceptional task

- WHEN a reader has a task that cannot start with a conventional failing test
- THEN the documentation requires a concrete justification and repeatable alternative verification rather than an unqualified test omission

#### Scenario: reader sees requested feedback

- WHEN the refactor reviewer requests changes
- THEN the documentation directs the reader back to the same task's implementation cycle and requires fresh verification and feedback before advancement

## REMOVED Requirements

*(none)*

## RENAMED Requirements

*(none)*
