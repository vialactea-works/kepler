# Dependency-aware task execution: approved implementation plan

Approval: the requester's instruction to save and implement the approved proposal, recorded on 2026-10-12. Source baseline: `b4e8aae` on `fix/finish-work-gates`. The following preserves the approved proposal. Statements about a planning-only boundary or tests not run describe that original proposal, not subsequent implementation progress. Implementation evidence belongs in the change's task artifacts.

## 1. Current behavior

**Observed in this checkout:**

| Finding | Source |
|---|---|
| Planning assumes a coder that follows Steps verbatim, adds no design, and implements approximately one TDD cycle per task. | `skills/kepler-plan/SKILL.md:49–67` |
| Code must follow Steps exactly and touch only listed files; deviations generally require re-planning. | `skills/kepler-code/SKILL.md:16–18`, `:133–135`, `:267–270` |
| `Depends on` already exists. Its grammar is `none` or comma-separated references such as `Task 1, Task 4`. Validation rejects malformed, duplicate, unknown, abandoned, self-referencing, and cyclic dependencies. | `bundle/templates/plan.md`; `packages/cli/src/workbench/artifact-body.ts:1089–1146`, `:1187–1204` |
| Execution remains serial. An authorized `execution: {version: 1, order: [...]}` can insert prerequisites without renumbering tasks, but orchestration selects the earliest unresolved slot and forbids parallel implementers. | `skills/kepler-plan/SKILL.md`, “Serial execution order and prerequisite insertion”; `skills/kepler-orchestrate/SKILL.md:65–68` |
| The parser accepts absent Files, but the skills treat Files as a boundary, and scaffold-recovery checks require explicit file scope. | `artifact-body.ts:1302–1324`; `context.ts:1042–1067`; `precondition-artifacts.ts:331–335` |
| Root `done` means implementation completed. Full task clearance additionally requires matching task evidence and fresh, durable, independent `approved` feedback without blockers. | `skills/kepler-orchestrate/SKILL.md`, “Durable task approval” and “Task handoff consistency” |
| Code returns `done` or `blocked` plus commit information. Feedback returns task identity, full Base/Head, verdict, finding counts, and feedback commit. Orchestration independently verifies artifacts rather than trusting those responses. | `skills/kepler-orchestrate/references/implementer-prompt.md`; `skills/kepler-code-feedback/SKILL.md:274–289` |

Parallelism also encounters two concrete implementation constraints:

- Coders currently update the same root `progress.md`, including its mirrored YAML and Markdown statuses.
- Historical checkpoint recovery derives Base from the first parent of the earliest committed attempt. Admission commits, scope-reservation commits, or rewritten task commits would invalidate that assumption without a versioned replacement.

Sources: `skills/kepler-code/SKILL.md:246–306`; `packages/cli/src/workbench/task-checkpoint.ts:147–299`.

**Artifact context:** this checkout has historical `.hamilton/specs/` and `.hamilton/changes/`, but no `.kepler/` directory. The installed skills differ from the repository versions. This proposal targets repository resources; it does not modify installed skills or legacy sources.

## 2. Proposed behavior

### Task definition and implementation latitude

Define a task as **the smallest coherent change large enough to implement and verify through TDD**. Several related TDD cycles may belong to one task; split independently useful behaviors, not individual edits.

Each newly authored task requires:

- **Goal:** the observable outcome and its bounded responsibility.
- **Acceptance:** testable success criteria, including relevant failure cases.
- **Depends on:** explicit prerequisite task IDs.
- **Steps:** required TDD phases and binding technical constraints, without prescribing every implementation decision.
- **Verify** and **Commit:** retain the existing fields.
- **Files:** optional likely affected paths, using the existing Created/Modified/Deleted structure.

Changing an unlisted file to satisfy the existing Goal and Acceptance is ordinary implementation, not scope expansion. The coder may inspect relevant callers and tests and choose implementation details consistent with approved design and project standards.

### Dependency readiness

Preserve the existing syntax:

```markdown
- Depends on: none
- Depends on: Task 1
- Depends on: Task 1, Task 4
```

Dependencies form a DAG. Numeric IDs remain stable identities, not execution positions.

A task becomes ready when:

1. Its contract, inputs, checkpoint, and dispatch identity are valid.
2. Every declared prerequisite is fully gated: matching committed implementation completion plus fresh, durable `approved` feedback.
3. Prerequisite work and approval evidence are reachable in the task’s admitted workspace.
4. No other worker owns that task.

Handling:

- Missing `Depends on` in a new dependency-mode task: validation failure; never infer independence.
- Unknown, abandoned, duplicate, self, malformed, or cyclic references: stop dispatch and return to planning.
- Valid dependency with missing completion or approval evidence: hold the dependent task.
- Blocked prerequisite: hold its descendants; unrelated ready tasks may continue.
- Changed dependency evidence or plan revision: invalidate affected dispatches and preserve partial work before reconsidering readiness.

### Parallel eligibility and publication

Independent ready tasks **may** run concurrently when they have isolated worktrees, compatible contracts, and isolated test resources. File lists help investigation but cannot prove independence. Shared APIs, migrations, generated outputs, or unresolved ownership may require serialization even without a declared dependency.

Recommend:

- One writer per task worktree.
- One serialized coordinator for authoritative root-ledger publication.
- Serialized integration that preserves original task commits and checkpoint ancestry.
- Integrated verification before publishing implementation `done`.
- Fresh feedback over the integrated task range before releasing dependents.

This requires an explicit ownership change: in the new mode, code owns implementation and task-local attempts; the coordinator publishes root implementation statuses through a guarded operation. Feedback remains reviewer-owned and never changes progress.

### Bounded scope expansion

Recommend **at most two prerequisite expansions per task lifetime, each affecting at most four explicitly named implementation/test/documentation paths**.

Each expansion must:

- Address an observed blocker necessary to achieve the original acceptance.
- Contain one coherent prerequisite change.
- Remain within approved change intent and architectural boundaries.
- Leave Goal, Acceptance, sibling tasks, and dependency declarations unchanged.
- Include its own TDD or justified alternative-verification evidence.

New features, unapproved public-contract changes, new dependencies, and security-policy changes require owner approval rather than autonomous expansion.

Reserve an expansion in task-local metadata and commit that reservation **before its production edits**. Reservations consume the allowance even if abandoned; retries and feedback corrections do not reset it. Feedback checks necessity and scope, while schema/history checks enforce counts and immutable reservations.

Before a third expansion, or an expansion exceeding four paths, finish a canonical `blocked` attempt. Re-planning appends a separately scoped prerequisite task and adds the appropriate dependency. Preserve partial work, original IDs, Base, and history.

**Decisions proposed for approval:** the two-expansion/four-path limits, versioned dependency mode, and serialized root publication. I recommend these defaults without per-plan configuration knobs.

## 3. Skill-by-skill plan

### `kepler-plan`

- Replace “weak coder,” verbatim execution, and “more small tasks” assumptions with coherent goals and constrained implementation judgment.
- Require task-local Goal, Acceptance, and explicit dependencies.
- Make Files optional guidance.
- Validate the graph before finalizing.
- Document readiness, parallel eligibility, expansion limits, and prerequisite insertion.
- Preserve TDD phase order, exact verification evidence, approved intent, stable IDs, and append-only histories.
- In dependency mode, permit authorized scheduling-only amendments to implementation-done but uncleared tasks. Keep Goal and Acceptance unchanged; freeze fully gated task definitions.

### `kepler-code`

- Retain one exact active Task N per invocation.
- Replace verbatim implementation with discretion inside Goal, Acceptance, binding constraints, and TDD order.
- Permit task-relevant file discovery.
- Implement expansion reservation, accounting, and exhaustion rules.
- Validate prerequisite clearance rather than a previous serial slot.
- Support isolated execution and guarded publication in dependency mode.
- Preserve `done | blocked` results, truthful interruptions, required verification, and partial-work protection.

### `kepler-code-feedback`

- Review Goal and Acceptance, including recorded expansions and their verification.
- Reject unnecessary expansion, exhausted allowance, or unrecorded prerequisite work.
- Do not reject a path merely because Files did not predict it.
- Preserve `approved | changes-requested`, historical `skipped`, full Base/Head, append-only passes, artifact-only commits, and typed blocker routing.
- Continue commit-attributed inspection of cumulative ranges; never hide overlapping changes through filename exclusions.

### `kepler-orchestrate`

- Select the ready set instead of the earliest unresolved serial slot.
- Dispatch independent eligible tasks concurrently; integrate and publish through one coordinator.
- Recompute readiness after implementation, feedback, dependency changes, and interruptions.
- Keep unaffected lanes progressing when one task is blocked.
- Require every active task fully gated before whole-branch review.

**Outcome contract:**

| Verified code result | Verified feedback result | Orchestration outcome and action |
|---|---|---|
| `done`, integrated and verified | Fresh durable `approved`, no blockers | Task fully done; release dependents. |
| Canonical `blocked` attempt | Any, including an older approval | Task blocked; hold descendants; retry only with changed useful input. |
| `done` | `changes-requested`, unresolved blockers | Task gate blocked. Route code defects to correction, evidence gaps to adjudication, intent defects upstream. |
| `done` | Missing, stale, skipped, undurable, or incomplete | Not fully done. Obtain or repair feedback; hold dependents. |
| Unavailable/interrupted response | Committed evidence is complete and consistent | Recover from verified artifacts, not the missing response. |
| Unavailable/incomplete or contradictory evidence | Any | Hold and diagnose. Preserve `pending`/`in-progress` as applicable; never invent a terminal attempt. |

Preserve the status distinction: unresolved feedback can block the **task gate** while root implementation status remains `done`. Orchestration’s completion display uses both results; it must not rewrite implementation history to manufacture a code blocker.

## 4. Artifact changes

### Versioning and structure

For new plans, propose this frontmatter addition:

```yaml
execution:
  version: 2
  mode: dependencies
```

Keep existing `version: 1` serial execution unchanged. Version 2 obtains graph edges solely from task-body `Depends on` fields.

For graph amendments, extend `execution_transition` with a version-2 shape containing:

- `previousPlanCommit`
- `fullyGatedTasks`, a verified set rather than a serial prefix
- `approval`, `reason`, and `affected`

Record changes against the actual preceding plan revision. Scheduling amendments refresh affected dispatch/input bindings without changing completed acceptance scope.

### Before and after

These are illustrative excerpts using the repository’s task format, not changes to an existing plan.

**Before:**

```markdown
### Task 2: Report task readiness

- Depends on: Task 1
- Files:
  - Modified: `packages/cli/src/workbench/context.ts`
- Acceptance:
  - Context reports the next task.
- Steps:
  1. Add assertions to the context tests.
  2. Implement the prescribed selection logic.
- Verify: `bun --bun vitest run tests/workbench/context.test.ts` → passes
- Commit: `feat: report task readiness`
```

**After:**

```markdown
### Task 2: Report task readiness

- Goal: Report tasks eligible to start from verified dependency completion.
- Depends on: Task 1, Task 4
- Files:
  - Modified: `packages/cli/src/workbench/context.ts`
- Acceptance:
  - A task is ready only when every dependency has committed completion and fresh approved feedback.
  - Unrelated ready tasks remain eligible when another task is blocked.
- Steps:
  1. Red — add behavioral checks for readiness and holds; observe intended failures.
  2. Green — implement the smallest solution satisfying Acceptance.
  3. Refactor — preserve behavior and rerun relevant regression checks.
- Verify: `bun --bun vitest run tests/workbench/context.test.ts` → passes
- Commit: `feat: report task readiness`
```

Files remains optional guidance. Task 4 may precede Task 2 without moving their headings or directories. Existing Quality constraints, Decision context, and versioned Notes remain part of the handoff.

### Execution evidence

- **Root `<change>/progress.md`:** retain the three-column table and existing task statuses. Add versioned per-task admission metadata identifying original Base, plan revision, task digest, lane/worktree/worker, and prerequisite approval commits. This is current admission state, not another attempt timeline.
- **`tasks/task-N/progress.md`:** retain attempts and unique terminal Outcomes. Add optional `scope_expansions` metadata with `id`, `attempt`, `prerequisite`, `necessity`, `evidence`, `paths`, and `verify`. Preserve reservations across attempts.
- **`tasks/task-N/.base`:** remains an ignored cache. For new dependency-mode tasks, recover Base from verified original admission history; retain first-attempt-parent recovery for older tasks.
- **`feedback.md`, `review.md`, `finish.md`:** retain their existing formats and verdict vocabularies. Expand task-feedback judgment, not its result schema.
- **Context:** add ready/held/fully-gated task projections. Preserve the existing `tasks.done` implementation count rather than silently redefining it.

### Exact resource impact

**Skills and references**
- `skills/kepler-plan/SKILL.md`
- `skills/kepler-code/SKILL.md`
- `skills/kepler-orchestrate/SKILL.md`
- `skills/kepler-code-feedback/SKILL.md`
- `skills/kepler-plan/references/code-quality.md`
- `skills/kepler-code-feedback/references/code-quality.md`
- `skills/kepler-orchestrate/references/implementer-prompt.md`
- `skills/kepler-orchestrate/references/code-feedback-prompt.md`
- `skills/kepler-orchestrate/references/whole-branch-review-prompt.md`

Remove conflicting weak-coder assumptions in `skills/kepler-propose/SKILL.md` and the code-quality references under `kepler-propose` and `kepler-critique`, without weakening their approval gates.

**Templates and documentation**
- `bundle/templates/plan.md`
- `bundle/templates/progress.md`
- `bundle/templates/task-progress.md`
- `bundle/templates/README.md`
- `README.md`
- `docs/skills.md`
- `docs/sdd-framework.md`
- `docs/modes.md`
- `docs/change-state-machine.md`

Preserve historical conclusions in `docs/change-state-machine-stpa-plan.md` and historical plans. Document the new behavior as superseding/versioned behavior rather than rewriting past evidence.

**Workbench implementation**
Modify these files under `packages/cli/src/workbench/`:

`artifact-types.ts`, `artifact-schemas.ts`, `artifact-body.ts`, `plan-history.ts`, `context.ts`, `task-checkpoint.ts`, `diff.ts`, `precondition-artifacts.ts`, and `precondition-reviews.ts`.

Propose two focused additions:

- `packages/cli/src/workbench/task-readiness.ts`: pure readiness decisions over validated evidence.
- `packages/cli/src/workbench/task-state.ts`: guarded, serialized admission/publication through typed runtime ports.

Expose publication through `packages/cli/src/cli/nest/task-state.command.ts`, wired through `workbench.command.ts` and `workbench.module.ts`. Keep graph policy separate from Git/filesystem adapters; do not introduce a scheduler database.

Optional Files also requires replacing completeness assumptions in scaffold recovery with conservative material/history inspection. Ambiguous prior work must still hold.

**Capability artifacts**
After approval, write change-side deltas for `execution`, `review`, `artifact-templates`, `workbench`, and `framework-docs` under `.kepler/changes/<change>/requirements/`. Finish-work would synchronize the corresponding `.kepler/specs/<capability>.md` files.

Their existing sources here are `.hamilton/specs/<capability>.md`. Use Kepler’s copy-preserving migration before authoring canonical destinations; never edit or remove those legacy sources.

### Compatibility

- Existing plans without execution metadata retain numeric serial behavior.
- Existing version-1 plans retain their authorized serial sequence.
- Missing new task fields remain readable in historical contracts.
- Adopt version 2 for new changes or explicitly approved, not-yet-started plans; do not mass-convert in-flight history.
- Unknown versions fail closed without serial fallback.
- Preserve IDs, authors, initialization proofs, checkpoints, attempts, and feedback bodies.
- Update CLI, templates, and loaded skills together before producing version-2 artifacts.

## 5. Verification plan

Extend existing coverage:

- **Task parsing and compatibility:** `tests/workbench/plan-contract.test.ts`, `artifact-schemas.test.ts`, `artifact-contracts.test.ts`, and `lint.test.ts`.
- **Context, history, checkpoints, and finish:** `tests/workbench/context.test.ts`, `diff.test.ts`, and `precondition.test.ts`.
- **Skill contracts:** `tests/skills/plan-tdd-contract.test.ts`, `planning-resources-contract.test.ts`, `execution-contracts.test.ts`, `orchestrate-contract.test.ts`, `code-feedback-contract.test.ts`, and `dispatch-preflight.test.ts`.
- **Templates/docs:** `tests/templates/artifact-contracts.test.ts`, `tests/docs/tdd-workflow.test.ts`, and `workbench-docs.test.ts`.
- **CLI wiring:** existing workbench/module/metadata tests, plus new task-state command coverage.

Add `tests/workbench/task-readiness.test.ts` and `tests/workbench/task-state.test.ts`.

Required cases:

1. Chains, diamonds, multiple ready tasks, later-numbered prerequisites, missing declarations, unknown/abandoned/self/duplicate/cyclic edges.
2. Dependency `done` without approval never releases a dependent.
3. Blocked descendants hold while unrelated eligible tasks proceed.
4. Two isolated workers finish in either order without losing root statuses or changing sibling evidence.
5. Admission survives interruption; changed plan, dependency approval, worker, or workspace invalidates dispatch.
6. Original Base survives reservation commits, integration, corrections, and missing cache recovery.
7. Unlisted goal-serving files need no expansion; two valid expansions pass; a third, oversized, erased, or reset reservation fails.
8. Red precedes production edits; Green uses the same check; Refactor and final verification remain required.
9. Every outcome-table row, including unavailable responses with recoverable artifacts and contradictory terminal evidence.
10. Whole review and finish remain closed until all active tasks are fully gated.

After approval, exercise representative skills with real agents in disposable repositories. Static wording tests do not prove worker behavior or parallel safety. Append new cases to `tests/skills/change-state-machine-scenarios.md` without changing historical scenario results.

Final gates: `bun --bun vitest run` and `bun run build`.

## 6. Implementation sequence

| Step | Deliverable | Depends on |
|---|---|---|
| 1 | Approve dependency-mode, ownership, expansion, compatibility, and capability-delta contracts. | None |
| 2 | Implement versioned parsing, task fields, DAG validation, and historical compatibility with failing tests first. | 1 |
| 3 | Implement expansion reservations, limits, and append-only validation. | 2 |
| 4 | Implement readiness, durable admission, serialized publication, isolated integration, and checkpoint recovery. | 2 |
| 5 | Update skills, dispatch prompts, rubrics, templates, and outcome contracts against the implemented mechanics. | 3, 4 |
| 6 | Update public documentation, examples, and approved capability artifacts. | 5 |
| 7 | Run real-agent scenarios, regression suites, build, and whole-branch review. | 6 |

Steps 3 and 4 are logically independent, but overlapping schema/history edits require separate ownership or serialized integration.

**Planning only:** repository files and the Folio task remain unchanged; Git status is clean. No implementation tests or model evaluations were run.
