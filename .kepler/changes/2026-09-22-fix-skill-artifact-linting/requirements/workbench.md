---
artifact: requirements-change
capability: workbench
change: 2026-09-22-fix-skill-artifact-linting
status: draft
created: 2026-09-22
author: "Caio Ferreira <caiorcferreira@gmail.com>"
decision: accepted
---

# Capability: workbench

The workbench provides explicitly scoped CLI mechanics and validation for Hamilton artifacts.

## ADDED Requirements

## MODIFIED Requirements

### Requirement: Lint accepts a pristine pending task log

The system SHALL accept a `task-progress` artifact with valid identity and lifecycle metadata, the exact task-progress title, and no attempt records when its frontmatter status is `pending`. It SHALL continue to reject an attempt-free task-progress artifact in any other status and SHALL validate all present attempt records using the existing append-only contract.

- Priority: must
- Rationale: planning creates task logs before execution; an empty history is accurate and is not a malformed artifact.

#### Scenario: Lint a newly initialized task log

- WHEN `--file` selects `tasks/task-N/progress.md` with matching `task: N`, `status: pending`, a valid date, and its exact task heading but no attempt
- THEN lint reports the task-progress artifact as valid and exits `0`

#### Scenario: An unfinished status has no attempt

- WHEN `--file` selects an attempt-free task-progress artifact whose status is `in-progress`, `blocked`, or `done`
- THEN lint reports the missing attempt and exits nonzero

### Requirement: Lint accepts a persisted finish intent awaiting its outcome

The system SHALL accept a finish artifact whose physically latest record is one unmatched `Attempt N` only when its frontmatter identifies the lifecycle as pending (`status: pending` and `result: pending`). It SHALL continue to require each completed or blocked attempt to have its matching outcome, and SHALL reject unmatched outcomes, malformed attempts, non-monotonic records, and stale attempts followed by later records.

- Priority: must
- Rationale: finish-work commits intent before external effects and records the observed outcome afterward; interruption between those commits is a supported state requiring reconciliation.

#### Scenario: Lint a newly committed finish intent

- WHEN a valid finish artifact contains contiguous paired history followed by exactly one complete unmatched `Attempt N` and has pending frontmatter status and result
- THEN lint accepts the artifact so the skill can safely perform or reconcile the intended effect

#### Scenario: Reject invalid finish history

- WHEN a finish artifact has an unmatched `Outcome N`, an unmatched attempt with non-pending status or result, or malformed/non-contiguous records
- THEN lint reports a finding and exits nonzero
