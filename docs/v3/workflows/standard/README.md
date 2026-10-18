# Standard workflow

[Version 3 reference](../../README.md) | [Construction phase](../../phases/construction/README.md)

## Purpose

Standard composes the stages below into the complete Construction MVP workflow. Phases own stage contracts; this workflow owns their selected order and routing.

The stage sequence and shared execution rules are agreed. Detailed proposals in linked contracts remain open unless separately accepted. This workflow does not approve an executing unit or establish implemented behavior.

## Entry

Start with a clear Unit of Work request and relevant available context. Functional Design's [entry conditions](../../phases/construction/functional-design.md#entry-conditions) apply.

Existing application code, tests, and completed Initialization or Inception contracts are not prerequisites. Greenfield work remains in scope. This workflow defines no additional Initialization or Inception stages.

## Stages

All selected stages belong to Construction. Their contracts define inputs, outputs, checks, authority, evidence, and completion conditions.

| Order | Stage | Result passed onward |
| --- | --- | --- |
| 1 | [Functional Design](../../phases/construction/functional-design.md) | Current unit definition, functional design, relevant context, and required requester approval. |
| 2 | [Quality Requirements](../../phases/construction/quality-requirements.md) | Applicable quality requirements, constraints, dependencies, and required requester approval. |
| 3 | [Implementation Planning](../../phases/construction/implementation-planning.md) | Technical rationale in `plan.md` and authored tasks in `tasks-dag.json`. |
| 4 | [Implementation Execution](../../phases/construction/implementation-execution.md) | Verified, integrated unit result with originating Activity evidence and a unit completion assessment. |
| 5 | [Unit of Work Review](../../phases/construction/unit-of-work-review.md) | Assessment of the complete integrated outcome, resolved blocking findings, and applicable acceptance records. |
| 6 | [Deliver](../../phases/construction/deliver.md) | The agreed delivery outcome, actual verification, limitations, and recipient handoff. |

```text
Functional Design -> Quality Requirements -> Implementation Planning
  -> Implementation Execution -> Unit of Work Review -> Deliver
```

Advance only after the current stage satisfies its contract for the applicable material and scope. Selecting Standard does not accept unapproved contract proposals or waive required inputs, evidence, or approvals.

A stage contract's Standard handoff describes its use in this sequence. The Construction catalog defines ownership, not an order for every possible workflow.

## Implementation Execution

Use the agreed [orchestrator-controlled subagent model](../../phases/construction/implementation-execution.md#agent-roles). Independent dependency-ready tasks run concurrently against fixed admission baselines.

For each task, execute [Code Generation](../../phases/construction/activities/code-generation.md), [Code Validation](../../phases/construction/activities/code-validation.md), then [Code Integration](../../phases/construction/activities/code-integration.md). These are Activities inside Implementation Execution, not additional workflow stages.

The orchestrator coordinates handoffs and authorized correction routes. Generation and independent non-author Validation use separate contexts. Workers report facts; authorized CLI operations control progress, revision, acceptance, and completion.

The [authored task DAG](../../phases/construction/task-graph.md) defines dependencies and prerequisite conditions. The orchestrator assesses readiness from those requirements and current execution facts. Activity feedback does not add task dependency edges.

Code Integration holds the unit lock through reading current state, preparation, typechecking, build, full-suite checks, and acceptance. Accept only the checked candidate. Other permitted task work and independent units continue.

The fixed Activity procedure and existing tracking mechanics suffice for the MVP. [CN20](../../authoring_progress.md#deferred-decisions) defers coordination protocol definitions beyond this MVP. Do not add a protocol registry, arbitrary graph language, general graph interpreter, team engine, or selectable protocol presets.

## Revision, Effort, and authority

Use the shared [revision procedure](../../revision.md) with this workflow's stage order and the owning phase's scope rules. Activity returns during active Execution do not automatically reopen that enclosing stage. Post-completion recovery details remain proposed under the [Execution contract](../../phases/construction/implementation-execution.md#return-after-completed-execution).

Apply [Effort](../../effort.md) without changing required stages, checks, review triggers, or authority. The Standard workflow name is independent of the Standard Effort level.

Stage completion does not grant publication, release, deployment, rollback, or cleanup permission. Deliver must establish the actual agreed outcome under applicable authority; deployment is not required for every unit.
