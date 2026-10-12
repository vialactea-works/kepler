---
artifact: requirements-change
capability: framework-docs
change: 2026-10-12-dependency-aware-task-execution
status: approved
created: 2026-10-12
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: framework-docs

This capability owns the public description of task planning, implementation, feedback and coordination. It preserves the seven-stage pipeline and aligns prose with the implemented versioned contracts.

## ADDED Requirements

### Requirement: Goal-driven task guidance

The maintained skills, prompts, quality rubrics and public workflow documentation SHALL describe coherent task goals, testable acceptance, constrained implementation judgment and optional file guidance without weak-coder or verbatim-diff assumptions.

- Priority: must

#### Scenario: Task handoff

- WHEN a reader or worker consumes the current task contract
- THEN Goal and Acceptance define scope, binding constraints and Red, Green, Refactor and Verify remain mandatory, and relevant unlisted files do not by themselves require re-planning.

### Requirement: Dependency-mode coordination guidance

Documentation SHALL distinguish version-2 readiness and isolated parallel eligibility from historical numeric serial execution and version-1 authorized serial orders.

- Priority: must

#### Scenario: Blocked task

- WHEN one dependency is blocked
- THEN readers learn that descendants hold, unrelated eligible tasks may proceed, integration and authoritative root publication remain serialized, and full task clearance requires both code and feedback evidence.

### Requirement: Finite expansion guidance

Documentation SHALL explain two lifetime prerequisite reservations of at most four explicit paths each, before-edit commitment, immutable accounting across retries and the blocked-to-re-plan boundary.

- Priority: must

#### Scenario: Scope distinction

- WHEN a task needs a goal-serving unlisted edit versus a new prerequisite
- THEN readers can distinguish ordinary implementation latitude from a recorded bounded expansion and from a scope change requiring owner approval.

## MODIFIED Requirements

### Requirement: Versioned migration and evidence

Public guidance and examples SHALL preserve historical plans and reports while directing new version-2 authors to matching CLI, skills and templates and documenting durable admission and checkpoint authority.

- Priority: must

#### Scenario: Existing change

- WHEN an in-flight historical plan is encountered
- THEN its serial behavior and evidence remain unchanged and no automatic mass conversion is implied.

#### Scenario: Missing response

- WHEN code or feedback responses are unavailable
- THEN examples require verified committed artifacts before recovery and never manufacture terminal outcomes or treat skipped feedback as approval.

### Requirement: Executable workflow verification

The change SHALL verify the implemented mechanics through real temporary filesystem and Git fixtures, regression tests and build, plus representative real-agent skill scenarios in disposable repositories.

- Priority: must

#### Scenario: New scenario evidence

- WHEN real-agent cases test ordinary latitude, prerequisite allowance, readiness or interruption
- THEN observations and verification are recorded as new evidence without rewriting historical scenario results or claiming static wording tests prove agent behavior.

## REMOVED Requirements

None. Preserve approval gates, stable IDs, artifact ownership, append-only evidence and the distinction between implementation done and fully gated completion.

## RENAMED Requirements

None.
