# Standard Construction workflow

Use this explanation to understand Kepler's execution model. Follow the [prompt-first mission tutorial](missions/tutorial.md) to give an agent the named skills in order. The [CLI reference](cli.md) serves agents and operators who need exact command details.

## Concepts

A **mission** records a request, selected repositories, and the `standard` workflow. Its **record home** is the Git project that stores the mission's artifacts and history.

A **Unit of Work** is the mission's deliverable scope. It owns design, quality, planning, and delivery artifacts. A **stage** is a major part of the workflow. An **attempt** is one recorded execution of a stage or Activity. Use the exact attempt ID when you retry an operation. Run `stage start` or `activity start` to create a new attempt.

A **task** is a planned implementation scope. The task graph defines its inputs, outputs, acceptance criteria, verification, prerequisites, and dependencies. An **Activity** is a task-scoped part of Implementation.

**Evidence** records an observed check or review result. **Approval** records an explicit requester decision. These records have different purposes. A passed check does not imply approval. A Git commit does not imply that a check passed.

## Standard sequence

```text
Mission preparation
  -> Unit creation
  -> Functional Design
  -> Quality Requirements
  -> Implementation Planning
  -> Implementation
       task admission
       Code Generation -> Code Validation -> Code Integration
  -> Unit of Work Review
  -> Deliver
```

| Stage | Work and main result |
| --- | --- |
| Functional Design | Define observable behavior and scope. Commit the unit and design artifacts. Record assessments and requester approval. |
| Quality Requirements | Assess the eight quality categories. Define applicable targets and constraints. Record requester approval and the planning handoff. |
| Implementation Planning | Select an approach. Write `plan.md` and `tasks-dag.json`. Validate tasks, obligations, dependencies, prerequisites, and verification commands. |
| Implementation | Admit eligible tasks. Generate, independently validate, and integrate each task. Assess the combined result and prepare the review handoff. |
| Unit of Work Review | Assess the complete integrated result and implementation evidence as a non-author. Resolve blocking findings. |
| Deliver | Bind the agreed outcome to reviewed checkpoints. Perform only authorized operations. Verify the result and recipient handoff. |

The workflow does not require an existing application or test suite. A Git project with an existing local `.kepler/` directory is still required. Mission creation prepares selected workspaces. It does not start a stage or create the authored stage content.

## Execution owners

| Component | Responsibility |
| --- | --- |
| CLI adapters | Parse explicit command inputs and report JSON results. |
| Application operations | Check scope, history, material, authority, and state before a transition. |
| History | Retain the facts from which workflow state is derived. |
| Git and filesystem adapters | Read artifacts and checkpoints. Apply the operation's permitted local effects. |
| Skills | Explain a stage, pre-stage startup, interrupted-work recovery, or a supporting Activity. The developer invokes them through prompts. |
| Host or team | Assign workers, run commands, provide independent review, and manage sessions. |

The application core uses typed ports for external effects. Nest commands adapt the CLI to those operations. CLI interfaces are not a general workflow engine or a distributed scheduler.

Kepler setup places skill and role files in the selected version-specific home. Users and hosts choose their own discovery and loading configuration. Packaged profiles express responsibilities and tool declarations; they do not configure a host, create an operating-system sandbox, or prove agent behavior. See [Skills and roles](skills.md).

## Task execution and Integration

A task can become ready when its dependencies and prerequisites have recorded support. Readiness is a query. Admission is a separate guarded operation.

Code Generation produces task output and check evidence. Code Validation requires a non-author reviewer and separate worker context. Code Integration serializes acceptance within the unit. Its caller acquires a lock, prepares the combined candidate, runs the planned checks, records their results, and accepts that exact candidate.

The current Integration operation supports one repository per unit. Mission preparation can select more repositories, but that does not establish multi-repository Integration support. The CLI records check results; it does not run the submitted check commands for you.

## History, interruption, and revision

History is authoritative. A projection is the state that Kepler derives from those records. Agent sessions and local workspace attachments do not replace workflow history.

A timeout does not prove that a worker stopped or a write failed. Inspect the exact attempt, material, checkpoints, and lock ownership before resuming. Preserve uncertain effects. Use the guarded revision command when an upstream change invalidates downstream work. See [Recovery](recovery.md).

## Completion and limits

A complete exercise has all six current stage attempts in `completed` state. Deliver records the final handoff. There is no separate public `mission complete` command. Inspect the unit and audit history to verify the result.

Construction does not implement Initialization or Inception. The [earlier workbench](cli/workbench.md) has a separate artifact model. Kepler does not adopt its records as v3 authority.

Delivery permission remains explicit. Workflow completion does not authorize publication, deployment, push, merge, rollback, or deletion.

## Implementation sources

The main adapters are in [`packages/cli/src/cli/nest/`](../packages/cli/src/cli/nest/). Construction operations are in [`packages/cli/src/construction/`](../packages/cli/src/construction/). Shared artifact and event contracts are in [`packages/core/src/`](../packages/core/src/).

The [Standard specification](specs/v3/workflows/standard/README.md) defines intended contracts. Use source code, tests, and actual command results to establish implemented behavior.
