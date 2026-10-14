---
artifact: requirements-change
capability: workbench
change: 2026-10-12-dependency-aware-task-execution
status: approved
created: 2026-10-12
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
---

# Capability: workbench

This capability owns native typed workflow mechanics at the CLI-to-Git/filesystem boundary. Skills retain scheduling and review judgment; application policy remains independent of infrastructure adapters.

## ADDED Requirements

### Requirement: Verified task readiness

The workbench SHALL expose ready, held and fully-gated task projections from validated dependency and committed evidence while preserving the existing implementation-only tasks.done count.

- Priority: must

#### Scenario: Dependency diamond

- WHEN two independent tasks share an approved prerequisite and feed a later task
- THEN both eligible tasks are reported ready and the later task remains held until both branches have committed completion and fresh durable approved feedback reachable in its workspace.

#### Scenario: Invalid graph or evidence

- WHEN task dependencies, checkpoints, input bindings or durable evidence are malformed or contradictory
- THEN the workbench fails closed instead of declaring readiness or recovering from an older approval.

### Requirement: Guarded admission and publication

The workbench SHALL provide a typed-runtime-port task-state operation for serialized durable admission and authoritative root publication without introducing a scheduler database.

- Priority: must

#### Scenario: Admission

- WHEN a validated ready task is assigned an isolated worker and worktree
- THEN guarded admission binds the original Base, current committed plan and task definition, worker/worktree identity and prerequisite approval commits before code dispatch.

#### Scenario: Two completed lanes

- WHEN isolated tasks complete in either order
- THEN serialized integration and publication preserve original commits, all sibling evidence and both mirrored root statuses, with integrated verification preceding implementation done and fresh feedback preceding dependency release.

#### Scenario: Concurrent or stale publisher

- WHEN another task owner or a changed plan, prerequisite approval or workspace invalidates a mutation
- THEN the operation refuses without losing existing ledger updates or partial production work.

### Requirement: Admission-backed checkpoint recovery

Diff, context and precondition consumers SHALL verify version-2 admission history for task checkpoints and reserve first-attempt-parent recovery for historical serial tasks.

- Priority: must

#### Scenario: Missing checkpoint cache

- WHEN a dependency-mode task has reservation and implementation commits but its ignored cache is missing
- THEN the original admitted Base is recovered only from consistent durable admission history.

### Requirement: Conservative optional-file recovery

Scaffold and prior-work checks SHALL treat Files as optional guidance in dependency mode and require conservative material and history evidence before declaring a task untouched.

- Priority: must

#### Scenario: Ambiguous work

- WHEN file guidance is absent or does not establish whether task work already exists
- THEN the workbench inspects relevant material and history and holds any unresolved ambiguity instead of authorizing a cropped checkpoint.

## MODIFIED Requirements

### Requirement: Shared finish predicates

Finish preconditions SHALL enforce matching implementation completion and fresh durable independent approved feedback for all active tasks regardless of execution mode.

- Priority: must

#### Scenario: Unapproved implementation

- WHEN the root implementation count is complete but an active task lacks valid clearance
- THEN finish remains closed without waiving task feedback through a whole-branch freshness waiver.

## REMOVED Requirements

None. Preserve explicit lint selectors, fail-closed parsing, existing operation semantics and structured stdout, stderr and exitCode results.

## RENAMED Requirements

None.
