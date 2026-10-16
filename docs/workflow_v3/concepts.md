# Concepts

[Reference index](README.md) | Next: [Workflow map](lifecycle.md)

## 1. Work units

| Term | Meaning |
| --- | --- |
| Project | An existing Git repository, its standards, and its Kepler data. |
| Change | One related result that proceeds from intent to finish. |
| Domain | The subject area that a project models. |
| Subdomain | A problem area within a domain. |
| Bounded context | The boundary within which a specific model and language apply. |
| Capability | A durable area of responsibility with an observable contract. |
| Intent | The required result, its boundaries, and the approved design decisions. |
| Tactical change | A change that preserves existing domain and boundary contracts. Its plan can state its intent without formal proposal artifacts. |
| Task | One numbered implementation unit in a plan. Its numeric ID remains stable. |
| Prerequisite | A result that a task needs before it can proceed. |
| Dependency | A declared relationship between a task and another task whose result it needs. |
| Route unit | One coarse delivery unit from Wayfinder. A change can implement a route unit through several tasks. |
| Artifact | A durable document that stores a contract, state, decision, or evidence. |

A route unit is not a task. Task numbers identify tasks. Task numbers do not define dependency order.

## 2. Steps, states, and transitions

A **step** owns a workflow responsibility. The seven step numbers remain 0 through 6.

A **state** describes the condition of work inside a step. A state can exist without a dedicated `status` field.

A **transition** changes the state through a named operation. A **gate** is a condition that must pass before that transition can complete.

A **contract** defines the required inputs, outputs, responsibilities, and limits of an operation or record.

A state table defines the responsibility and evidence for each state. A transition table defines the actor, input, output, and contract for each operation.

Each transition table references gates from [Gates](gates.md). The diagram omits those conditions to remain readable.

Identifiers such as `C3`, `C07`, and `G09` identify a state, transition, and gate. They are reference labels, not CLI values.

## 3. Recorded and derived state

A **recorded state** is a stored value, such as a root task status of `done`.

A **derived state** is a conclusion from verified evidence. For example, a fully gated task needs more evidence than `done`.

| Concept | Required distinction |
| --- | --- |
| Ready | The task can enter admission. Ready does not permit edits. |
| Admitted | The coordinator binds a task to a worker, lane, plan, inputs, and Git boundary. |
| Published | The coordinator records an integrated implementation outcome in the root ledger. |
| Fully gated | Published completion and current independent feedback satisfy all task and prerequisite gates. |
| Held | A failed or unknown gate prevents the affected operation. Held is not a new root status. |
| Blocked | An actor records a truthful terminal obstacle. The actor preserves partial work. |
| Interrupted | An execution stops without a terminal record. Interruption does not prove completion or blockage. |
| Stale | Evidence no longer covers the required current revision. |
| Durable | A committed record exists at the required path and satisfies its commit and ancestry rules. |
| Fresh | Evidence covers the revisions that the applicable gate requires. |
| Clearance | Current evidence permits the next defined operation. Clearance does not grant unrelated authority. |

Different subjects can have different states at the same time. A root task can be `in-progress` while its initialized task log remains `pending`.

During a correction, the root task can be `in-progress` while its task log retains the previous terminal attempt.

## 4. Actors and ownership

| Actor | Responsibility |
| --- | --- |
| Requester | Defines the goal and approves formal intent or consequential changes. |
| Intent owner | Maintains proposal, requirements, and design through the propose step. |
| Planner | Defines tasks, dependencies, input records, and the initial progress scaffold. |
| Coordinator | Admits workers and serializes shared integration and root publication. |
| Worker | Implements one assigned task and records its task-local evidence. |
| Task reviewer | Independently judges one task range and writes only its feedback. |
| Branch reviewer | Judges the complete change and writes only the root review. |
| Finish owner | Verifies finish gates, records intent, performs authorized effects, and records observed results. |

A person or agent can perform a role. The role determines its write boundary. Delegation does not transfer requester authority.

The coordinator can use `kepler-orchestrate`. A direct skill invocation still needs the applicable admission and evidence.

## 5. Git and evidence terms

The command-line interface (CLI) provides workbench operations. Spec-driven development (SDD) uses written contracts to guide a change.

Test-driven development (TDD) uses Red, Green, and Refactor phases. [Task cycle](task-cycle.md) defines the evidence for each phase.

| Term | Meaning |
| --- | --- |
| Source branch | The named branch that owns the change work. |
| Target branch | The explicit branch that receives delivery. |
| Lane | An isolated worker branch and worktree under one admission. |
| Task Base | The immutable Git checkpoint for a task across attempts and corrections. |
| Coordinator source HEAD | The coordinator revision observed before admission. |
| Admission commit | The commit that records guarded admission. |
| Attempt start HEAD | The admitted worker revision before the attempt. The worker records it as `Start HEAD`. |
| Next coordinator HEAD | The coordinator revision returned after the guarded operation. |
| Integrated HEAD | The revision that contains the original worker commit after integration. |
| Publication commit | The root-ledger commit that records the integrated outcome. |
| Coverage | The exact publication commit identified by a task feedback pass. |
| Merge base | The Git common ancestor computed against the explicit target. |
| Material change | A tracked change outside the narrowly excluded execution and verdict records. |
| Artifact-only commit | A commit whose path list contains only the artifact permitted by the operation. |
| Provenance | Evidence that identifies a record's origin, revision, and owner boundary. |
| Digest | A hash that identifies the content of a task definition or breakdown. |
| Input standing | The current validity of a task's selected input revisions. |
| Physical last pass | The final pass in the file, regardless of an earlier verdict. |
| Readback | An independent observation of a file, Git state, or provider result after an operation. |

A Git hash identifies bytes or history. It does not authenticate a requester or prove semantic approval.

The source and target roles depend on branch identities and configured mappings. Equal tip commits do not make distinct branch roles equal.

## 6. Common hold and recovery contract

This contract applies to every internal state and transition in this reference.

| ID | From and to | Operation and actor | Input and output | Contract and gate |
| --- | --- | --- | --- | --- |
| H01 | Any state to held | Stop the affected operation. The current actor owns this action. | Failed or unknown evidence produces a located blocker report. Existing artifacts remain evidence. | Preserve work. Do not claim the intended target state. Apply [G01](gates.md#g01-common-evidence) and the failed transition gate. |
| H02 | Held to the last proven state | Diagnose and re-evaluate. The responsible artifact owner acts. | New evidence or an authorized correction produces a current gate result. | Apply [G24](gates.md#g24-recovery-and-retry). Do not erase unresolved findings or manufacture history. |

Held is a control condition, not a replacement artifact status. The diagrams omit these common edges.

If an operation partly succeeds, preserve the observed partial state. Do not assume rollback or atomic file updates.

Before a retry, identify the changed code, evidence, external condition, or corrected command input. An identical retry without changed input cannot resolve a gate.
