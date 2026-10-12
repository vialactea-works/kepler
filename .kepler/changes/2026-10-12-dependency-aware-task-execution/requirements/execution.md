---
artifact: requirements-change
capability: execution
change: 2026-10-12-dependency-aware-task-execution
status: approved
created: 2026-10-12
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: execution

This capability owns plan-task contracts, implementation evidence and dependency-mode execution within the change pipeline. The scope and vocabulary follow the existing canonical execution capability; orchestration remains the owner of workflow judgment.

## ADDED Requirements

### Requirement: Explicit dependency execution

Newly authored plans SHALL declare `execution: {version: 2, mode: dependencies}` and an explicit `Depends on: none` or comma-separated Task references for every active task.

- Priority: must

#### Scenario: Invalid dependency graph

- WHEN a dependency declaration is missing, malformed, duplicate, unknown, abandoned, self-referencing or cyclic
- THEN validation fails closed and orchestration dispatches no task from that invalid plan.

### Requirement: Dependency readiness

Orchestration SHALL release a task only after every declared dependency has matching committed implementation completion and fresh durable independent approved feedback reachable in the admitted workspace.

- Priority: must

#### Scenario: Completion without approval

- WHEN a prerequisite is implementation-done but feedback is absent, stale, skipped, incomplete, changes-requested or undurable
- THEN its dependent task remains held.

#### Scenario: Unrelated ready work

- WHEN a prerequisite is blocked
- THEN its descendants remain held while unrelated ready tasks may proceed.

### Requirement: Bounded prerequisite expansions

A task SHALL consume at most two prerequisite expansions during its lifetime, each naming at most four concrete implementation, test or documentation paths, with an immutable committed reservation preceding its production edits.

- Priority: must

#### Scenario: Reserved expansion

- WHEN an observed acceptance blocker needs one coherent prerequisite within approved intent
- THEN the task records `id`, `attempt`, `prerequisite`, `necessity`, `evidence`, `paths` and `verify` in task-local `scope_expansions`, commits the reservation, and verifies the prerequisite without changing Goal, Acceptance, dependencies or sibling scope.

#### Scenario: Exhausted allowance

- WHEN another prerequisite would require a third reservation, more than four paths, a new feature, an unapproved public contract or dependency, or a security-policy change
- THEN the task records a canonical blocked attempt and requires owner-approved re-planning instead of expanding autonomously.

#### Scenario: Retry or correction

- WHEN an expansion is abandoned, implementation retries or feedback requires correction
- THEN its reservation still consumes the lifetime allowance and cannot be erased, rewritten or reset.

## MODIFIED Requirements

### Requirement: Goal-driven implementation

Each new dependency-mode task SHALL define Goal, Acceptance, Depends on, Steps, Verify and Commit for the smallest coherent TDD-verifiable change, with Files as optional guidance rather than an allowlist.

- Priority: must

#### Scenario: Implementation judgment

- WHEN the coder implements one exact active Task N
- THEN it may choose details and inspect or edit goal-serving unlisted paths within Goal, Acceptance, binding constraints, approved design and project standards, while preserving Red before production edits, Green on the same check, Refactor and final verification.

#### Scenario: Several related checks

- WHEN one coherent acceptance outcome needs several related TDD cycles
- THEN they may remain in the same task; independently useful behavior belongs in separate tasks.

### Requirement: Isolated execution and authoritative publication

Dependency-mode execution SHALL use one writer per admitted task worktree and one serialized coordinator for integration and authoritative root-ledger publication.

- Priority: must

#### Scenario: Parallel eligibility

- WHEN independent ready tasks have compatible contracts, isolated worktrees and isolated test resources
- THEN orchestration may dispatch them concurrently, integrate their original commits serially, verify the integrated work before publishing implementation done, and obtain fresh integrated-range feedback before releasing dependents.

#### Scenario: Artifact ownership

- WHEN a dependency-mode coder completes or blocks its task
- THEN it owns task-local attempts and preserves sibling evidence; the guarded coordinator publishes only that task's mirrored root status, while feedback remains reviewer-owned.

### Requirement: Stable checkpoint authority

Dependency-mode task Base SHALL derive from verified original durable admission history binding the plan revision, task digest, worker, worktree and prerequisite approvals, with `.base` remaining an ignored cache.

- Priority: must

#### Scenario: Checkpoint recovery

- WHEN reservation commits, correction attempts, integration or a missing cache intervene
- THEN original Base remains unchanged and recovery verifies admission history instead of guessing the earliest attempt's parent.

#### Scenario: Stale dispatch

- WHEN plan revision, dependency evidence or worker/workspace identity no longer matches the admitted dispatch
- THEN execution holds, preserves partial work and requires renewed validated admission.

### Requirement: Versioned compatibility and amendments

Existing unversioned and version-1 plans SHALL retain legacy serial behavior, while dependency-mode scheduling amendments use a verified fully-gated set and never silently convert in-flight plans.

- Priority: must

#### Scenario: Historical plan

- WHEN a plan lacks new task fields or uses the existing authorized version-1 order
- THEN existing numeric identities, historical checkpoint recovery, author, initialization, attempts and feedback remain readable and unchanged.

#### Scenario: Authorized graph amendment

- WHEN the owner authorizes a dependency-mode scheduling amendment
- THEN `execution_transition` binds the preceding committed plan, `fullyGatedTasks`, approval, reason and affected obligations, freezes fully gated definitions, and permits scheduling-only changes to implementation-done but uncleared tasks without changing their Goal or Acceptance.

#### Scenario: Unknown execution version

- WHEN explicit execution metadata has an unsupported version
- THEN validation fails closed without a serial fallback.

## REMOVED Requirements

None. Existing serial and historical contracts remain supported.

## RENAMED Requirements

None.
