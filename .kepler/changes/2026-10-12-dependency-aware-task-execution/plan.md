---
artifact: plan
change: 2026-10-12-dependency-aware-task-execution
status: approved
created: 2026-10-12
author: Caio Ferreira <caiorcferreira@gmail.com>
decision: accepted
route_unit: null
intent_approvals:
  - path: requirements/execution.md
    reference: requester:2026-10-12:exact-requirements-preview:371e6afe6d3a645b549c5f6b4773f881d59a0695:approve-and-implement
    commit: d025e474bcc3784b844ff6f8ad087a0b56ab11de
  - path: requirements/review.md
    reference: requester:2026-10-12:exact-requirements-preview:371e6afe6d3a645b549c5f6b4773f881d59a0695:approve-and-implement
    commit: d025e474bcc3784b844ff6f8ad087a0b56ab11de
  - path: requirements/artifact-templates.md
    reference: requester:2026-10-12:exact-requirements-preview:371e6afe6d3a645b549c5f6b4773f881d59a0695:approve-and-implement
    commit: d025e474bcc3784b844ff6f8ad087a0b56ab11de
  - path: requirements/workbench.md
    reference: requester:2026-10-12:exact-requirements-preview:371e6afe6d3a645b549c5f6b4773f881d59a0695:approve-and-implement
    commit: d025e474bcc3784b844ff6f8ad087a0b56ab11de
  - path: requirements/framework-docs.md
    reference: requester:2026-10-12:exact-requirements-preview:371e6afe6d3a645b549c5f6b4773f881d59a0695:approve-and-implement
    commit: d025e474bcc3784b844ff6f8ad087a0b56ab11de
initialization:
  version: 1
  base: d025e474bcc3784b844ff6f8ad087a0b56ab11de
  authority: requester:2026-10-12:approved-plan-save-and-implement
  breakdown: 673b869228b6eff71f4dda4df90dec5ffefb69869ab8c01704420e8469a4f859
  taskIds: [1, 2, 3, 4, 5, 6]
execution:
  version: 1
  order: [1, 2, 3, 4, 5, 6]
---

# Plan: Dependency-aware goal-driven task execution

## Overview

- Change: .kepler/changes/2026-10-12-dependency-aware-task-execution/
- Goal: Implement the requester-approved goal-driven task contract with dependency readiness, bounded prerequisite expansion, isolated task admission and reliable joint code/feedback outcomes. Preserve historical serial behavior and artifact evidence.
- Approved implementation plan: docs/dependency-aware-task-execution-plan.md at ecaa54cd99797c066569719516157062c7e876a8.
- Spec impact: execution, review, artifact-templates, workbench and framework-docs change externally visible behavior. Their requirements deltas were explicitly approved as exact candidate bytes in the requester's questionnaire answer and committed at d025e474bcc3784b844ff6f8ad087a0b56ab11de; approval reference requester:2026-10-12:exact-requirements-preview:371e6afe6d3a645b549c5f6b4773f881d59a0695:approve-and-implement.
- Intent approvals: the five exact requirements paths and full committed revision above are owner-held assertions, not authenticated approval or self-approval of intent.
- Planning authority: the requester approved the original implementation sequence and then the exact requirements candidates. The implementation breakdown below is self-reviewed under explicit authority to implement; it does not extend those contracts.
- Execution compatibility: this bootstrap plan deliberately uses existing version-1 serial execution so work can begin before version 2 exists. Its task IDs, task definitions and initialization proof stay stable; new user plans adopt version 2 only after runtime and resources agree. Tasks 2 and 4 share schema/history files, so this implementation serializes them rather than creating conflicting writers.
- Owner/change: the requester directs this change; one designated controller coordinates the implementation and fresh independent feedback.
- Source branch: refs/heads/fix/finish-work-gates.
- Delivery target: refs/heads/main; source/target roles verified by named refs and current linked-worktree state, not equal-tip inference. No merge, push, release, install, deployment or worktree removal is authorized by this implementation request.
- Base/input revision: d025e474bcc3784b844ff6f8ad087a0b56ab11de.
- Workspace: /Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates; verified linked worktree, isolated yes. Preserve unrelated work and keep one writer in this checkout.
- Test: `bun --bun vitest run`.
- Build / typecheck: `bun run build`.
- Context notes: AGENTS.md defines Bun/Vitest, ESM .js imports, no code comments and typed runtime-port Nest operation boundaries. Legacy data was copied through KeplerService and verified byte-for-byte; .hamilton sources remain read-only. Repository skills and bundle/templates are the development targets; installed/global resources and Folio are outside scope.
- Quality notes: task seams separate artifact contracts, reservation accounting, pure readiness, guarded state mutation, workflow resources and public evidence. Several related TDD checks can serve one coherent acceptance; one serial writer and task-owned independent feedback protect overlapping shared boundaries.
- Verification state: baseline build and focused plan-contract checks passed. The complete baseline suite passed all 972 tests across 55 files with maxWorkers=2 in 332.35 seconds; initial outer command budgets expired without test verdicts. Final implementation gates still require default-settings full Vitest and build without timeout/config relaxation.
- Finish boundary: change-side requirements describe the approved capability deltas. Canonical-spec synchronization and external/workspace shipping effects belong to separately selected finish-work, not this implementation or its documentary task.

## Tasks

### Task 1: Validate dependency-mode task contracts

- Goal: Admit version-2 goal-driven dependency plans and their authorized scheduling amendments without changing historical serial behavior.
- Depends on: none
- Files:
  - Created: none
  - Modified: `packages/cli/src/workbench/artifact-types.ts`, `packages/cli/src/workbench/artifact-schemas.ts`, `packages/cli/src/workbench/artifact-body.ts`, `packages/cli/src/workbench/artifact-contracts.ts`, `packages/cli/src/workbench/plan-history.ts`, `packages/cli/src/workbench/context.ts`, `packages/cli/src/workbench/precondition-artifacts.ts`, `packages/cli/src/workbench/precondition-reviews.ts`, `tests/workbench/plan-contract.test.ts`, `tests/workbench/artifact-schemas.test.ts`, `tests/workbench/artifact-contracts.test.ts`, `tests/workbench/context.test.ts`, `tests/workbench/precondition.test.ts`, `tests/workbench/lint.test.ts`
  - Deleted: none
- Acceptance:
  - Version 2 requires execution.mode dependencies plus visible nonempty Goal, Acceptance, explicit Depends on, Steps, Verify and Commit; Files is optional guidance. Extract validated goal and acceptance for consumers.
  - Validate chains, diamonds, later-numbered prerequisites and malformed, missing, duplicate, unknown, abandoned, self-referencing and cyclic references without falling back to serial execution.
  - Preserve absent-metadata numeric serial plans, version-1 authorized orders, historical missing fields, stable IDs, original initialization, authors and frozen history; unsupported versions fail closed.
  - Version-2 execution_transition binds the immediately preceding committed plan, a genuinely fully-gated set, owner approval, reason and affected obligations. Fully gated definitions freeze; scheduling-only amendments to implementation-done but uncleared tasks preserve Goal, Acceptance and existing evidence.
  - Update all affected existing consumers and history predicates consistently, including conservative optional-file scaffold recovery, without implementing readiness scheduling or task publication in this task.
  - Quality constraints: Keep schema and pure artifact parsing in the existing workbench contract boundary and Git-history validation behind existing runtime ports; do not introduce a second parser. Source: AGENTS.md and the approved implementation plan.
  - Decision context: Current source artifact-body.ts already parses Depends on and version-1 serial execution. Preserve those observed contracts and the original first-attempt history until version-2 authority exists.
- Notes: {"version":1,"repository":"/Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates","intentCommit":"d025e474bcc3784b844ff6f8ad087a0b56ab11de","taskDefinition":"ec82fe317983451aaa104e5fc7f34b891183dfa199141dd01bcb84c5d76f0359","inputs":[{"path":"AGENTS.md","blob":"a9c5350c0f8978b382383cf3171cf123ee28f345"},{"path":"docs/dependency-aware-task-execution-plan.md","blob":"a382d69e3b07b257fd0b58c78af95e8f137f76cc"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/execution.md","blob":"5ae94ecd8ce07594f0cc168620ae9332a7a4237f"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/review.md","blob":"bb630e71a7ed72ed1f458abd431e5853b1c4d3c2"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/artifact-templates.md","blob":"7e3b01eb6cce440a895b2711aa8a72180ccf060b"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/workbench.md","blob":"fa19fd33114e2ff6c4a823a2ef6eebc01efa8474"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/framework-docs.md","blob":"a5888d7596299d3cc3da32f5788b0d93e2832794"}]}
- Steps:
  1. Red — add behavioral contract checks for the acceptance and relevant negative cases; run `bun --bun vitest run tests/workbench/plan-contract.test.ts tests/workbench/artifact-schemas.test.ts tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts` before production edits and observe the intended failure. If a conventional failing test is technically impossible, record the concrete reason and run a repeatable distinguishing alternative before production edits.
  2. Green — implement the smallest coherent solution within the acceptance and approved requirements; rerun the same failing check until it passes for the intended reason. Use additional related TDD cycles when needed without changing the goal.
  3. Refactor — inspect the implementation against project standards and the task quality constraints, perform behavior-preserving cleanup or record why none is needed, and rerun relevant regression checks.
  4. If a phase fails for the wrong reason, final verification fails or feedback requests correction, record the cause and repeat Red, Green and Refactor within this task. Preserve all prior attempts and block rather than cross approved scope.
- Verify: `bun --bun vitest run tests/workbench/plan-contract.test.ts tests/workbench/artifact-schemas.test.ts tests/workbench/artifact-contracts.test.ts tests/workbench/lint.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts`, then `bun --bun vitest run` and `bun run build` → all pass after Refactor.
- Commit: `feat: validate dependency-mode task contracts`

### Task 2: Enforce lifetime prerequisite reservations

- Goal: Make necessary scope-expansion reservations bounded, append-only and provably committed before their production edits.
- Depends on: Task 1
- Files:
  - Created: `packages/cli/src/workbench/scope-expansions.ts`, `tests/workbench/scope-expansions.test.ts`
  - Modified: `packages/cli/src/workbench/artifact-types.ts`, `packages/cli/src/workbench/artifact-schemas.ts`, `packages/cli/src/workbench/artifact-body.ts`, `packages/cli/src/workbench/artifact-contracts.ts`, `packages/cli/src/workbench/plan-history.ts`, `packages/cli/src/workbench/context.ts`, `packages/cli/src/workbench/task-checkpoint.ts`, `packages/cli/src/workbench/precondition-artifacts.ts`, `packages/cli/src/workbench/runtime.ts`, `packages/cli/src/workbench/precondition-runtime.ts`, `tests/workbench/plan-contract.test.ts`, `tests/workbench/artifact-schemas.test.ts`, `tests/workbench/artifact-contracts.test.ts`, `tests/workbench/context.test.ts`, `tests/workbench/precondition.test.ts`, `tests/workbench/diff.test.ts`
  - Deleted: none
- Acceptance:
  - Optional task-local scope_expansions uses exactly the approved id, attempt, prerequisite, necessity, evidence, paths and verify information and rejects malformed, duplicate or unsafe explicit path records.
  - At most two reservations exist over the task lifetime, each with at most four concrete implementation/test/documentation paths. Abandonment, retries and feedback corrections never refund or reset reservations.
  - History validation rejects erased, rewritten, reordered, retroactively inserted or post-production reservations and does not manufacture task attempts, terminal outcomes or scope authority from metadata.
  - Preserve unique append-only terminal task attempts and existing Goal, Acceptance, dependencies, sibling evidence and historical artifacts.
  - Ordinary goal-serving unlisted file changes do not require a reservation. Necessity and approved-intent judgment remain reviewer/owner policy; automated validation enforces the finite accounting and chronology.
  - Quality constraints: Keep reservation policy as pure functions over typed records, with Git chronology through existing ports. Reuse history helpers and fail-closed diagnostics rather than creating parallel persistence. Source: AGENTS.md and the approved implementation plan.
  - Decision context: Approved requirements execution.md and artifact-templates.md fix the lifetime allowance at two reservations and four paths each; no per-plan knobs or new status vocabulary are authorized.
- Notes: {"version":1,"repository":"/Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates","intentCommit":"d025e474bcc3784b844ff6f8ad087a0b56ab11de","taskDefinition":"36e1738abffa154551cc37e973a8e8674c3e68bc14bd5377da9fa009ed507d6d","inputs":[{"path":"AGENTS.md","blob":"a9c5350c0f8978b382383cf3171cf123ee28f345"},{"path":"docs/dependency-aware-task-execution-plan.md","blob":"a382d69e3b07b257fd0b58c78af95e8f137f76cc"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/execution.md","blob":"5ae94ecd8ce07594f0cc168620ae9332a7a4237f"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/review.md","blob":"bb630e71a7ed72ed1f458abd431e5853b1c4d3c2"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/artifact-templates.md","blob":"7e3b01eb6cce440a895b2711aa8a72180ccf060b"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/workbench.md","blob":"fa19fd33114e2ff6c4a823a2ef6eebc01efa8474"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/framework-docs.md","blob":"a5888d7596299d3cc3da32f5788b0d93e2832794"}]}
- Steps:
  1. Red — add behavioral contract checks for the acceptance and relevant negative cases; run `bun --bun vitest run tests/workbench/scope-expansions.test.ts tests/workbench/artifact-schemas.test.ts tests/workbench/artifact-contracts.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts tests/workbench/diff.test.ts` before production edits and observe the intended failure. If a conventional failing test is technically impossible, record the concrete reason and run a repeatable distinguishing alternative before production edits.
  2. Green — implement the smallest coherent solution within the acceptance and approved requirements; rerun the same failing check until it passes for the intended reason. Use additional related TDD cycles when needed without changing the goal.
  3. Refactor — inspect the implementation against project standards and the task quality constraints, perform behavior-preserving cleanup or record why none is needed, and rerun relevant regression checks.
  4. If a phase fails for the wrong reason, final verification fails or feedback requests correction, record the cause and repeat Red, Green and Refactor within this task. Preserve all prior attempts and block rather than cross approved scope.
- Verify: `bun --bun vitest run tests/workbench/scope-expansions.test.ts tests/workbench/artifact-schemas.test.ts tests/workbench/artifact-contracts.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts tests/workbench/diff.test.ts`, then `bun --bun vitest run` and `bun run build` → all pass after Refactor.
- Commit: `feat: enforce bounded lifetime scope reservations`

### Task 3: Project verified dependency readiness

- Goal: Report tasks eligible for admission, held tasks and fully gated tasks from validated dependency and durable code/feedback evidence.
- Depends on: Task 1, Task 2
- Files:
  - Created: `packages/cli/src/workbench/task-readiness.ts`, `tests/workbench/task-readiness.test.ts`
  - Modified: `packages/cli/src/workbench/context.ts`, `packages/cli/src/workbench/artifact-types.ts`, `packages/cli/src/workbench/precondition-artifacts.ts`, `packages/cli/src/workbench/precondition-reviews.ts`, `packages/cli/src/workbench/precondition.ts`, `packages/cli/src/workbench/task-checkpoint.ts`, `packages/cli/src/workbench/runtime.ts`, `packages/cli/src/workbench/precondition-runtime.ts`, `tests/workbench/context.test.ts`, `tests/workbench/precondition.test.ts`, `tests/workbench/diff.test.ts`
  - Deleted: none
- Acceptance:
  - Expose versioned ready, held and fully-gated projections while preserving tasks.done as an implementation-only count and the legacy serial resume behavior.
  - A dependency clears only with matching committed implementation done, a physically last fresh durable independent approved feedback-only commit without blockers, valid Base/Head and reachable evidence; absent, stale, skipped, incomplete, undurable, changes-requested or contradictory evidence holds.
  - Exercise all approved code/feedback outcome-table rows, including missing responses recoverable from verified artifacts, and never fabricate a terminal result or rewrite implementation done into a feedback blocker.
  - Hold blocked descendants without holding unrelated eligible work; valid first-run initialization can establish eligibility before durable admission is created, avoiding a circular admission/readiness gate.
  - Check invalid input/checkpoint/history evidence conservatively. Keep pure readiness decisions separate from Git/filesystem collection and leave task-state mutation to Task 4.
  - Whole-branch review and finish remain closed until every active task is fully gated, regardless of readiness elsewhere.
  - Quality constraints: Reuse existing feedback freshness, durability, independence and implementation-consistency predicates; do not weaken them or redefine the existing done count. Source: AGENTS.md and the approved implementation plan.
  - Decision context: Current root done denotes implementation completion only. Approved review.md requires joint clearance, and unknown or contradictory evidence must remain a hold rather than a synthetic blocked attempt.
- Notes: {"version":1,"repository":"/Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates","intentCommit":"d025e474bcc3784b844ff6f8ad087a0b56ab11de","taskDefinition":"5720629c03f7bbfca826ffe13081265b3ee3f20526520df6c9aab06eeb54afb1","inputs":[{"path":"AGENTS.md","blob":"a9c5350c0f8978b382383cf3171cf123ee28f345"},{"path":"docs/dependency-aware-task-execution-plan.md","blob":"a382d69e3b07b257fd0b58c78af95e8f137f76cc"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/execution.md","blob":"5ae94ecd8ce07594f0cc168620ae9332a7a4237f"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/review.md","blob":"bb630e71a7ed72ed1f458abd431e5853b1c4d3c2"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/artifact-templates.md","blob":"7e3b01eb6cce440a895b2711aa8a72180ccf060b"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/workbench.md","blob":"fa19fd33114e2ff6c4a823a2ef6eebc01efa8474"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/framework-docs.md","blob":"a5888d7596299d3cc3da32f5788b0d93e2832794"}]}
- Steps:
  1. Red — add behavioral contract checks for the acceptance and relevant negative cases; run `bun --bun vitest run tests/workbench/task-readiness.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts tests/workbench/diff.test.ts` before production edits and observe the intended failure. If a conventional failing test is technically impossible, record the concrete reason and run a repeatable distinguishing alternative before production edits.
  2. Green — implement the smallest coherent solution within the acceptance and approved requirements; rerun the same failing check until it passes for the intended reason. Use additional related TDD cycles when needed without changing the goal.
  3. Refactor — inspect the implementation against project standards and the task quality constraints, perform behavior-preserving cleanup or record why none is needed, and rerun relevant regression checks.
  4. If a phase fails for the wrong reason, final verification fails or feedback requests correction, record the cause and repeat Red, Green and Refactor within this task. Preserve all prior attempts and block rather than cross approved scope.
- Verify: `bun --bun vitest run tests/workbench/task-readiness.test.ts tests/workbench/context.test.ts tests/workbench/precondition.test.ts tests/workbench/diff.test.ts`, then `bun --bun vitest run` and `bun run build` → all pass after Refactor.
- Commit: `feat: project verified dependency readiness`

### Task 4: Guard task admission and publication

- Goal: Provide durable isolated-task admission, original-Base recovery and serialized verified integration/root publication through the real CLI.
- Depends on: Task 2, Task 3
- Files:
  - Created: `packages/cli/src/workbench/task-state.ts`, `packages/cli/src/workbench/task-admission.ts`, `packages/cli/src/workbench/task-readiness.ts`, `packages/cli/src/workbench/scope-expansions.ts`, `packages/cli/src/cli/nest/task-state.command.ts`, `tests/workbench/task-state.test.ts`, `tests/workbench/task-readiness.test.ts`
  - Modified: `packages/cli/src/workbench/artifact-types.ts`, `packages/cli/src/workbench/artifact-schemas.ts`, `packages/cli/src/workbench/artifact-body.ts`, `packages/cli/src/workbench/context.ts`, `packages/cli/src/workbench/task-checkpoint.ts`, `packages/cli/src/workbench/diff.ts`, `packages/cli/src/workbench/plan-history.ts`, `packages/cli/src/workbench/runtime.ts`, `packages/cli/src/workbench/precondition-runtime.ts`, `packages/cli/src/workbench/precondition-artifacts.ts`, `packages/cli/src/workbench/precondition-reviews.ts`, `packages/cli/src/workbench/precondition.ts`, `packages/cli/src/cli/nest/workbench.command.ts`, `packages/cli/src/cli/nest/workbench.module.ts`, `tests/workbench/context.test.ts`, `tests/workbench/diff.test.ts`, `tests/workbench/precondition.test.ts`, `tests/workbench/plan-contract.test.ts`, `tests/cli/workbench.test.ts`, `tests/cli/workbench-module.test.ts`, `tests/cli/nest-metadata.test.ts`
  - Deleted: none
- Acceptance:
  - Expose the native task-state operation through Nest with the existing typed runtime-port, structured result and strict argument conventions; implement actual admission, reservation and publication mechanics rather than scaffolding.
  - Admission commits current per-task root metadata with a version, original full Base, committed plan revision/digest, task digest, worker/lane/worktree identity and prerequisite approval commits. One owner per task and one writer per admitted worktree are enforced before dispatch.
  - Use one serialized coordinator, refuse stale/concurrent mutation safely and preserve unrelated staged/dirty work, every sibling entry and both mirrored root representations. No scheduler database or cross-clone exclusivity claim.
  - Support real isolated Git lanes completing in either order, serialize ancestry-preserving integration of original task commits, run actual integrated verification before publishing done, and keep dependency release closed until fresh integrated-range feedback is durable.
  - Version-2 checkpoint creation/recovery uses verified original admission history, not earliest-attempt parent guessing. Original Base survives reservations, later admissions, integration, corrections and missing caches; legacy recovery remains unchanged.
  - Bind current dispatch and selected input provenance to the admitted worker workspace within the same verified repository, including linked-worktree identity; reject foreign repositories, changed plans, definitions, approvals, worker/worktree identities and arbitrary Base claims while preserving partial work.
  - Allow genuine task-local reservation commits before production edits and persist blocked outcomes without committing partial production work or inventing evidence. Re-admission/correction preserves original Base, immutable lifetime reservations and authorized goal/acceptance scope.
  - Provide real CLI smoke coverage plus boundary cases for interruptions, conflicting owners, stale publication, unavailable verification, ambiguous recovery and all-done-but-uncleared finish; preserve existing legacy operation semantics.
  - Quality constraints: Model TaskAdmission, ScopeExpansion and TaskReadiness using existing artifact vocabulary; application policy owns invariants and injected adapters own Git, files and process execution. Keep one authoritative root publisher. Source: AGENTS.md and the approved implementation plan.
  - Decision context: The approved plan explicitly replaces first-attempt-parent authority only for dependency mode and explicitly changes root publication ownership. Do not reuse a copied root ledger or a mutable cache as authority for a lane.
- Notes: {"version":1,"repository":"/Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates","intentCommit":"d025e474bcc3784b844ff6f8ad087a0b56ab11de","taskDefinition":"737835e547a1c3c5092da0f6e43c2f21aee876f9e1aeff52083db416cbddd0e6","inputs":[{"path":"AGENTS.md","blob":"a9c5350c0f8978b382383cf3171cf123ee28f345"},{"path":"docs/dependency-aware-task-execution-plan.md","blob":"a382d69e3b07b257fd0b58c78af95e8f137f76cc"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/execution.md","blob":"5ae94ecd8ce07594f0cc168620ae9332a7a4237f"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/review.md","blob":"bb630e71a7ed72ed1f458abd431e5853b1c4d3c2"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/artifact-templates.md","blob":"7e3b01eb6cce440a895b2711aa8a72180ccf060b"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/workbench.md","blob":"fa19fd33114e2ff6c4a823a2ef6eebc01efa8474"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/framework-docs.md","blob":"a5888d7596299d3cc3da32f5788b0d93e2832794"}]}
- Steps:
  1. Red — add behavioral contract checks for the acceptance and relevant negative cases; run `bun --bun vitest run tests/workbench/task-state.test.ts tests/workbench/task-readiness.test.ts tests/workbench/context.test.ts tests/workbench/diff.test.ts tests/workbench/precondition.test.ts tests/cli/workbench.test.ts tests/cli/workbench-module.test.ts` before production edits and observe the intended failure. If a conventional failing test is technically impossible, record the concrete reason and run a repeatable distinguishing alternative before production edits.
  2. Green — implement the smallest coherent solution within the acceptance and approved requirements; rerun the same failing check until it passes for the intended reason. Use additional related TDD cycles when needed without changing the goal.
  3. Refactor — inspect the implementation against project standards and the task quality constraints, perform behavior-preserving cleanup or record why none is needed, and rerun relevant regression checks.
  4. If a phase fails for the wrong reason, final verification fails or feedback requests correction, record the cause and repeat Red, Green and Refactor within this task. Preserve all prior attempts and block rather than cross approved scope.
- Verify: `bun --bun vitest run tests/workbench/task-state.test.ts tests/workbench/task-readiness.test.ts tests/workbench/context.test.ts tests/workbench/diff.test.ts tests/workbench/precondition.test.ts tests/cli/workbench.test.ts tests/cli/workbench-module.test.ts`, then `bun --bun vitest run` and `bun run build` → all pass after Refactor.
- Commit: `feat: guard isolated task admission and publication`

### Task 5: Update goal-driven workflow resources

- Goal: Make repository skills, prompts, rubrics and templates describe and consume the implemented goal-driven dependency-mode mechanics without weakening TDD or approval.
- Depends on: Task 2, Task 4
- Files:
  - Created: none
  - Modified: `skills/kepler-plan/SKILL.md`, `skills/kepler-code/SKILL.md`, `skills/kepler-code-feedback/SKILL.md`, `skills/kepler-orchestrate/SKILL.md`, `skills/kepler-plan/references/code-quality.md`, `skills/kepler-code-feedback/references/code-quality.md`, `skills/kepler-orchestrate/references/implementer-prompt.md`, `skills/kepler-orchestrate/references/code-feedback-prompt.md`, `skills/kepler-orchestrate/references/whole-branch-review-prompt.md`, `skills/kepler-propose/SKILL.md`, `skills/kepler-propose/references/code-quality.md`, `skills/kepler-critique/references/code-quality.md`, `bundle/templates/plan.md`, `bundle/templates/progress.md`, `bundle/templates/task-progress.md`, `bundle/templates/README.md`, `tests/skills/plan-tdd-contract.test.ts`, `tests/skills/planning-resources-contract.test.ts`, `tests/skills/execution-contracts.test.ts`, `tests/skills/orchestrate-contract.test.ts`, `tests/skills/code-feedback-contract.test.ts`, `tests/skills/dispatch-preflight.test.ts`, `tests/templates/artifact-contracts.test.ts`, `tests/skills/change-artifact-lint-contract.test.ts`, `tests/skills/lint-source-of-truth-contract.test.ts`, `tests/skills/workbench-contract.test.ts`, `tests/skills/domain-language-contract.test.ts`
  - Deleted: none
- Acceptance:
  - Remove conflicting weak-coder, verbatim Steps and file-allowlist assumptions. Require the new coherent Goal/Acceptance/dependency contract and permit related TDD cycles and goal-serving unlisted paths while retaining binding design/standards and phase ordering.
  - New templates emit version 2, show optional Files, versioned per-task admission/current root ownership and optional lifetime scope reservations, with no new feedback/review/finish format or result vocabulary.
  - Document and use the actual implemented CLI flags for dependency readiness, admission, scope reservation, guarded publication and checkpoint recovery; do not invent commands or imply the CLI owns scheduling judgment.
  - Orchestration derives ready sets, holds blocked descendants, permits only compatible isolated concurrent lanes and serializes original-commit integration/publication. Every code/feedback outcome-table row remains explicit and all active tasks must be fully gated before final review.
  - Code owns task-local attempts and root updates only in legacy modes; dependency-mode root publication is coordinator-owned. Reviewer-owned feedback remains artifact-only, append-only, independent and range-attributed.
  - Scope expansion policy fixes two lifetime reservations of at most four paths, before-edit commitment, no reset/refund, no new dependencies or public/security-policy changes, and a canonical blocked/re-plan boundary.
  - Preserve historical serial instructions under explicit version scoping, stable IDs, authors, initialization, owner-held intent approvals, unique outcomes, truthful interruptions, partial-work protection, fresh independent feedback and original Base.
  - Update conflicting wording assertions into behavior-backed contracts without dropping unrelated safety assertions or weakening tests just to pass. Repository resources only: do not modify installed/global skills or perform setup/install.
  - Quality constraints: Keep each skill's own self-contained contract and rubric; share existing vocabulary and CLI mechanisms instead of introducing a second scheduling convention or copying sibling skill rules. Source: AGENTS.md and the approved implementation plan.
  - Decision context: Installed skills differ from repository versions. Development and evaluations must explicitly load this checkout's resources and isolate any fixture HOME; current user's installed templates and Casa-managed state remain untouched.
- Notes: {"version":1,"repository":"/Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates","intentCommit":"d025e474bcc3784b844ff6f8ad087a0b56ab11de","taskDefinition":"d6731b87a920ca78278167e02f5149e6418f418513ac9e57c035e38c844b87ed","inputs":[{"path":"AGENTS.md","blob":"a9c5350c0f8978b382383cf3171cf123ee28f345"},{"path":"docs/dependency-aware-task-execution-plan.md","blob":"a382d69e3b07b257fd0b58c78af95e8f137f76cc"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/execution.md","blob":"5ae94ecd8ce07594f0cc168620ae9332a7a4237f"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/review.md","blob":"bb630e71a7ed72ed1f458abd431e5853b1c4d3c2"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/artifact-templates.md","blob":"7e3b01eb6cce440a895b2711aa8a72180ccf060b"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/workbench.md","blob":"fa19fd33114e2ff6c4a823a2ef6eebc01efa8474"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/framework-docs.md","blob":"a5888d7596299d3cc3da32f5788b0d93e2832794"}]}
- Steps:
  1. Red — add behavioral contract checks for the acceptance and relevant negative cases; run `bun --bun vitest run tests/skills tests/templates` before production edits and observe the intended failure. If a conventional failing test is technically impossible, record the concrete reason and run a repeatable distinguishing alternative before production edits.
  2. Green — implement the smallest coherent solution within the acceptance and approved requirements; rerun the same failing check until it passes for the intended reason. Use additional related TDD cycles when needed without changing the goal.
  3. Refactor — inspect the implementation against project standards and the task quality constraints, perform behavior-preserving cleanup or record why none is needed, and rerun relevant regression checks.
  4. If a phase fails for the wrong reason, final verification fails or feedback requests correction, record the cause and repeat Red, Green and Refactor within this task. Preserve all prior attempts and block rather than cross approved scope.
- Verify: `bun --bun vitest run tests/skills tests/templates`, then `bun --bun vitest run` and `bun run build` → all pass after Refactor.
- Commit: `feat: adopt goal-driven dependency workflow resources`

### Task 6: Document and exercise the new task contract

- Goal: Align public documentation and examples with implemented dependency execution and record real-agent verification without rewriting historical results.
- Depends on: Task 5
- Files:
  - Created: `docs/examples/dependency-task-execution.md`, `docs/examples/dependency-task-execution/plan.md`, `docs/examples/dependency-task-execution/progress.md`, `tests/skills/dependency-execution-scenarios.md`
  - Modified: `README.md`, `docs/skills.md`, `docs/sdd-framework.md`, `docs/modes.md`, `docs/change-state-machine.md`, `tests/docs/tdd-workflow.test.ts`, `tests/docs/workbench-docs.test.ts`, `tests/templates/artifact-contracts.test.ts`, `tests/skills/change-state-machine-scenarios.md`
  - Deleted: none
- Acceptance:
  - Reader-facing docs explain coherent tasks, Goal/Acceptance scope, optional file guidance, strict TDD/correction order, two/four finite expansion bounds, readiness versus implementation done, isolated parallel eligibility and serialized root publication.
  - Show lint-valid actual-format examples for dependency chains, diamonds, later-numbered prerequisites and held work using the implemented CLI. Preserve the seven-stage identity, approval gates and legacy/unversioned/version-1 compatibility guidance.
  - Preserve docs/dependency-aware-task-execution-plan.md as the saved approved proposal, docs/change-state-machine-stpa-plan.md as historical analysis, all .hamilton sources and every prior scenario result; append new evidence rather than backfilling or fabricating old results.
  - Approved requirements remain byte-for-byte at their committed requester-approved revisions; reference them as change-side deltas and do not perform shipping, finish-work or canonical-spec synchronization before a separately selected finish strategy.
  - Record representative real native-agent runs in disposable repositories using this checkout's updated code skill and templates, including ordinary unlisted-file latitude, a reserved prerequisite and a negative exhaustion/re-planning boundary. Use actual model/run/artifact references and distinguish observed behavior from inference.
  - Real filesystem/Git/CLI integration tests cover chains, diamonds, blocked independent lanes, finish gates, two-lane order/concurrency safety, stale ownership/plan/approval, reservation chronology/lifetime limits and original-Base recovery; static prose tests never substitute for actor behavior.
  - Run the focused doc/example checks, the complete default-settings bun --bun vitest run suite and bun run build. Escalate observed failures causally rather than relaxing test timeouts or changing the suite to force a pass.
  - Quality constraints: Keep canonical requirements at capability altitude and examples in disposable/example scope. Documentation names actual behavior, limitations and authority rather than promising unsupported distributed scheduling. Source: AGENTS.md and the approved implementation plan.
  - Decision context: Baseline build passed and all 972 baseline tests passed with maxWorkers=2 in 332.35 seconds; early outer command timeouts were not test failures. Final acceptance still requires the complete default-settings suite, fresh task feedback and whole-branch review.
- Notes: {"version":1,"repository":"/Users/caioferreira/workspace/vialactea-works/kepler/.worktrees/fix/finish-work-gates","intentCommit":"d025e474bcc3784b844ff6f8ad087a0b56ab11de","taskDefinition":"227370f2e10fcf03beb430b9bebda7fbb89f6064b75704ca8b89ef4d0c792182","inputs":[{"path":"AGENTS.md","blob":"a9c5350c0f8978b382383cf3171cf123ee28f345"},{"path":"docs/dependency-aware-task-execution-plan.md","blob":"a382d69e3b07b257fd0b58c78af95e8f137f76cc"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/execution.md","blob":"5ae94ecd8ce07594f0cc168620ae9332a7a4237f"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/review.md","blob":"bb630e71a7ed72ed1f458abd431e5853b1c4d3c2"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/artifact-templates.md","blob":"7e3b01eb6cce440a895b2711aa8a72180ccf060b"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/workbench.md","blob":"fa19fd33114e2ff6c4a823a2ef6eebc01efa8474"},{"path":".kepler/changes/2026-10-12-dependency-aware-task-execution/requirements/framework-docs.md","blob":"a5888d7596299d3cc3da32f5788b0d93e2832794"}]}
- Steps:
  1. Red — add behavioral contract checks for the acceptance and relevant negative cases; run `bun --bun vitest run tests/docs tests/templates` before production edits and observe the intended failure. If a conventional failing test is technically impossible, record the concrete reason and run a repeatable distinguishing alternative before production edits.
  2. Green — implement the smallest coherent solution within the acceptance and approved requirements; rerun the same failing check until it passes for the intended reason. Use additional related TDD cycles when needed without changing the goal.
  3. Refactor — inspect the implementation against project standards and the task quality constraints, perform behavior-preserving cleanup or record why none is needed, and rerun relevant regression checks.
  4. If a phase fails for the wrong reason, final verification fails or feedback requests correction, record the cause and repeat Red, Green and Refactor within this task. Preserve all prior attempts and block rather than cross approved scope.
- Verify: `bun --bun vitest run tests/docs tests/templates`, then `bun --bun vitest run` and `bun run build` → all pass after Refactor.
- Commit: `docs: explain and verify dependency-aware task execution`

## Done when

- Every active task has matching root implementation done and committed task-local Red, Green, Refactor and final verification evidence, or a concrete justified alternative Red.
- Every active task has fresh durable independent approved task feedback without blockers over its stable original Base and current implementation Head.
- The complete default-settings `bun --bun vitest run` suite and `bun run build` pass without weakened assertions or changed test timeouts.
- Real CLI/Git fixtures and real native-agent scenarios verify the new task contract; observations and artifact/model/run references are recorded without historical backfill.
- Whole-branch review is fresh and approved without blocking findings. Installed/global resources, Folio, .hamilton sources, historical reports and unrelated user work remain unchanged.
