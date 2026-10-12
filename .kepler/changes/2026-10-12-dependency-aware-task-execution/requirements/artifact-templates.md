---
artifact: requirements-change
capability: artifact-templates
change: 2026-10-12-dependency-aware-task-execution
status: approved
created: 2026-10-12
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: artifact-templates

This capability owns the bundled artifact shapes used at the planning, coding and coordination boundaries. It preserves the existing canonical filenames and historical instances.

## ADDED Requirements

### Requirement: Dependency-mode plan shape

The plan template SHALL author version-2 dependency execution with Goal, Acceptance, explicit Depends on, Steps, Verify and Commit for each task and Files as optional Created, Modified and Deleted guidance.

- Priority: must

#### Scenario: New plan

- WHEN planning instantiates the current template
- THEN task IDs remain numeric stable identities and tasks can depend on later-numbered tasks without moving their headings or directories.

### Requirement: Admission metadata shape

Root progress SHALL support versioned per-task admission metadata identifying original Base, plan revision, task digest, lane/worktree/worker and prerequisite approval commits without becoming an attempt timeline.

- Priority: must

#### Scenario: Current admission state

- WHEN the coordinator admits an isolated task
- THEN the mirrored root ledger remains an exact three-column Task, Status, Progress table and admission provenance is carried as versioned metadata rather than extra status vocabularies or execution-history rows.

### Requirement: Prerequisite reservation shape

Task progress SHALL support optional append-only lifetime `scope_expansions` entries containing `id`, `attempt`, `prerequisite`, `necessity`, `evidence`, `paths` and `verify` alongside unchanged task attempt records.

- Priority: must

#### Scenario: Reserved prerequisite

- WHEN a necessary expansion is reserved before production edits
- THEN schema and history validation enforce the two-reservation/four-path bounds and preserve existing attempts and unique terminal outcomes across retries and corrections.

## MODIFIED Requirements

### Requirement: Versioned root ownership

The progress template SHALL distinguish legacy code-owned root updates from dependency-mode coordinator-owned authoritative root publication while retaining planning-owned initialization and task-local coder evidence.

- Priority: must

#### Scenario: New dependency-mode worker

- WHEN a coder writes its isolated task attempt
- THEN it does not publish shared root state or mutate sibling metadata, and the coordinator uses the guarded publication operation after integration.

### Requirement: Historical artifact compatibility

Template and parser updates SHALL preserve existing task IDs, authors, initialization proofs, attempts, checkpoints and verdict histories and fail closed for unknown execution versions.

- Priority: must

#### Scenario: Historical shapes

- WHEN an existing serial plan lacks new task fields or admission metadata
- THEN current readers keep its legacy behavior without rewriting its historical artifacts into version 2.

## REMOVED Requirements

None. Feedback, review and finish templates and existing status/verdict vocabularies remain unchanged.

## RENAMED Requirements

None.
