# Standard workflow

[Version 3 reference](../../README.md) | [Construction phase](../../phases/construction/README.md)

## Purpose

Standard composes the stages below into the complete Construction MVP workflow. It has one Unit of Work per mission. Phases own stage contracts. This workflow owns their selected order and routing.

The stage sequence and shared execution rules are agreed. The requester accepted all selected Construction stage and Activity contracts under their recorded decision IDs. This workflow does not approve a Unit of Work or prove implemented behavior.

## Entry

Start with a clear Unit of Work request and relevant available context. Functional Design's [entry conditions](../../phases/construction/functional-design.md#entry-conditions) apply.

Existing application code, tests, and completed Initialization or Inception contracts are not prerequisites. Greenfield work remains in scope. Construction, the first selected phase, owns mission creation and initial workspace facts. Prepare the workspace before Functional Design starts. Startup adds no stage. This workflow adds no Initialization or Inception stages.

Apply the accepted [workflow binding](../../cli.md#workflow-binding). Mission creation records the selected workflow. Construction unit creation records the matching `standard` binding. Later operations and resume use that binding. The `unit show` query exposes it. The MVP adds no per-command workflow selector, switching, or registry. See the [Mission contract](../../mission.md) for identity and startup rules.

## Stages

All selected stages belong to Construction. Their contracts state inputs, outputs, checks, authority, evidence, and completion conditions.

| Order | Stage | Result passed onward |
| --- | --- | --- |
| 1 | [Functional Design](../../phases/construction/functional-design.md) | Current unit definition, functional design, relevant context, and required requester approval. |
| 2 | [Quality Requirements](../../phases/construction/quality-requirements.md) | Applicable quality requirements, constraints, dependencies, and required requester approval. |
| 3 | [Implementation Planning](../../phases/construction/implementation-planning.md) | Technical rationale in `plan.md` and authored tasks in `tasks-dag.json`. |
| 4 | [Implementation](../../phases/construction/implementation.md) | Integrated unit result that passed required checks, with originating Activity evidence and a unit completion assessment. |
| 5 | [Unit of Work Review](../../phases/construction/unit-of-work-review.md) | Assessment of the complete integrated outcome, resolved blocking findings, and applicable acceptance records. |
| 6 | [Deliver](../../phases/construction/deliver.md) | The agreed delivery outcome, actual verification, limitations, and recipient handoff. |

```text
Functional Design -> Quality Requirements -> Implementation Planning
  -> Implementation -> Unit of Work Review -> Deliver
```

Advance only after the current stage satisfies its contract for the applicable material and scope. Selecting Standard does not approve a specific Unit of Work or waive required inputs, evidence, or approvals.

A stage contract's Standard handoff describes its use in this sequence. The Construction catalog assigns ownership, not an order for every possible workflow.

## Implementation

Use the agreed [orchestrator-controlled subagent model](../../phases/construction/implementation.md#agent-roles). Independent dependency-ready tasks run concurrently against fixed admission baselines.

For each task, execute [Code Generation](../../phases/construction/activities/code-generation.md), [Code Validation](../../phases/construction/activities/code-validation.md), then [Code Integration](../../phases/construction/activities/code-integration.md). These are Activities inside Implementation, not additional workflow stages.

The orchestrator coordinates handoffs and authorized correction routes. Generation and independent non-author Validation use separate contexts. Workers report facts. Authorized CLI operations control progress, revision, acceptance, and completion.

The [authored task DAG](../../phases/construction/task-graph.md) records dependencies and prerequisite conditions. The orchestrator determines readiness from those requirements and current execution facts. Activity feedback does not add task dependency edges.

Code Integration holds the unit lock through reading current state, preparation, typechecking, build, full-suite checks, and acceptance. Accept only a candidate that passed the checks. Other permitted task work and independent units continue.

The fixed Activity procedure and existing tracking mechanics are sufficient for the MVP. [CN20](../../authoring_progress.md#deferred-decisions) defers coordination protocol definitions beyond this MVP. Do not add a protocol registry, arbitrary graph language, general graph interpreter, team engine, or selectable protocol presets.

## Revision, Effort, and authority

Use the shared [revision procedure](../../revision.md) with this workflow's stage order and the owning phase's scope rules. Activity returns during active Implementation do not automatically reopen that enclosing stage. Apply the accepted [post-completion recovery rules](../../phases/construction/implementation.md#return-after-completed-implementation).

Apply [Effort](../../effort.md) without changing required stages, checks, review triggers, or authority. The Standard workflow name is independent of the Standard Effort level.

Stage completion does not grant publication, release, deployment, rollback, or cleanup permission. Deliver must show that the actual agreed outcome is met under applicable authority. Deployment is not required for every unit.
