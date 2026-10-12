---
artifact: requirements-change
capability: review
change: 2026-10-12-dependency-aware-task-execution
status: draft
created: 2026-10-12
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: skipped
---

# Capability: review

This capability owns independent task feedback and whole-branch review at the existing code-to-review boundary. It retains the existing artifact ownership, freshness and verdict vocabulary.

## ADDED Requirements

### Requirement: Review of implementation latitude

Task feedback SHALL judge Goal, Acceptance, binding constraints, task-local TDD evidence and any prerequisite expansion for necessity, coherence, recorded scope and verification.

- Priority: must

#### Scenario: Goal-serving unlisted path

- WHEN implementation changes an unlisted path to satisfy the existing goal and acceptance
- THEN the reviewer does not reject it solely because Files did not predict it.

#### Scenario: Invalid expansion

- WHEN prerequisite work is unnecessary, unrecorded, exceeds the lifetime allowance or crosses approved intent
- THEN feedback records a located blocking finding under changes-requested.

## MODIFIED Requirements

### Requirement: Full task clearance

Orchestration SHALL derive full task clearance jointly from matching committed code completion and fresh durable independent approved feedback, while root done continues to mean implementation completion.

- Priority: must

#### Scenario: Requested changes

- WHEN code is done and feedback has unresolved blocking findings
- THEN the task gate remains blocked and descendants remain held without rewriting code completion into a fabricated blocked attempt.

#### Scenario: Missing or unusable feedback

- WHEN code is done but feedback is absent, stale, skipped, incomplete or undurable
- THEN the task is not fully done and feedback must be obtained or repaired before dependency release.

#### Scenario: Unavailable worker response

- WHEN a response is interrupted or unavailable but committed implementation and feedback artifacts are complete and consistent
- THEN orchestration recovers from independently verified artifacts; contradictory or incomplete evidence holds without inventing terminal outcomes.

### Requirement: Review after integrated verification

Dependency-mode task feedback SHALL review the stable integrated task range before it clears dependent work, using commit attribution rather than filename exclusions for prerequisite and peer changes.

- Priority: must

#### Scenario: Shared file range

- WHEN a cumulative range contains certified peer or prerequisite changes in an assigned task's paths
- THEN feedback distinguishes attributed commits and still inspects new task changes rather than hiding the shared paths.

### Requirement: Final review and finish gate

Whole-branch review and finish SHALL remain closed until every active task has matching implementation completion and fresh durable approved task feedback without blockers.

- Priority: must

#### Scenario: Partial ready-set completion

- WHEN some independent tasks are approved but another active task is held or uncleared
- THEN orchestration may continue eligible task work but does not enter whole-branch review or finish.

## REMOVED Requirements

None. Preserve append-only feedback and review histories, full Base and Head, artifact-only commits, independence and physically-last-pass semantics.

## RENAMED Requirements

None. Code outcomes remain done or blocked; feedback verdicts remain approved or changes-requested, with historical skipped never providing clearance.
