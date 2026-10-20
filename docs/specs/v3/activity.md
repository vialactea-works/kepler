# Activity

[Workflow phase index](README.md) | [Construction phase index](phases/construction/README.md)

## Purpose

An **Activity** is a named, bounded execution responsibility within a stage. The owning phase or stage sets its scope and contract.

An Activity is not a workflow stage, an agent, a skill, a planned task, or an independent lifecycle milestone. Supporting skills can do the work for an Activity. They do not set its boundary.

## Definition, occurrence, and attempt

An Activity definition is a reusable contract. It states the responsibility and its required behavior.

An Activity occurrence links that definition to one stage execution and a work scope that the owning phase sets. An Activity attempt is one execution of that occurrence.

The owning phase or stage sets its scope, inputs, outputs, outcomes, role limits, procedures, checks, evidence, completion, corrections, and handoffs. No universal unit or task schema applies to Activities across phases.

An Activity inherits the effort of its owning stage. It does not have a separate effort setting. Activity completion does not complete the enclosing stage or grant requester consent or permission to operate.

## Activity attempts

Each Activity attempt has a distinct identity and run floor. Link it to its Activity occurrence and enclosing stage attempt. The stage attempt gives coordination context. It does not replace the Activity attempt.

Keep at most one active attempt for a fixed Activity occurrence. Keep the enclosing stage's active-attempt limit. Failed commands, local corrections within the current Activity, waits, pauses, resumes, and new sessions do not make another Activity attempt.

An authorized return makes a new Activity attempt when the Activity starts again. Keep each result bound to the attempt and material used to make it. Ended-attempt results cannot complete or cancel newer work, even if candidate bytes and the enclosing stage attempt stay unchanged.

The stage and each Activity own their named evidence. Shared scope and material bindings do not replace either contract. Do not move historical Activity evidence to a new stage attempt.

Use the shared CLI-owned journal and attempt mechanics. Do not add a second lifecycle engine, protocol-run identity, or task-coding attempt identity. Phase-owned Activity event payloads, commands, and projections stay implementation choices under the shared [event envelope](runtime.md#event-envelope-choices). Activity attempt IDs follow the shared [attempt identity rules](runtime.md#attempt-identity-and-active-scope).

## Construction Activities

Within Construction's Implementation stage, run a fixed Activity procedure for each task:

1. **Code Generation** makes the changes required for the task outcome, runs typechecking and modification-related tests, and does self-review.
2. **Code Validation** does typechecking, the project build, and the full application test suite. A non-author reviewer gives independent feedback without editing the candidate.
3. **Code Integration** runs the necessary checks and accepts the combined candidate under the unit's integration lock.

The owning stage controls handoffs. Activity workers report findings. They cannot authorize returns or reopen upstream stages. Authorized returns route necessary code changes to Code Generation, then run Validation and Integration again when necessary. Integration-only retries stay within the current Code Integration attempt. See [Implementation](phases/construction/implementation.md) for coordination and recovery rules.

This fixed procedure does not replace the accepted task dependency graph. The plan sets task dependencies and prerequisite conditions. The orchestrator uses these conditions and current execution facts to select ready tasks. Activity order is separate from task scheduling. Feedback routes are not task dependencies.

The accepted Activity contract defines one fixed procedure. It does not define an Activity registry, arbitrary graph language or interpreter, or Basic, Workshop, or Factory preset. It does not define a team engine, swarm, extra protocol state store, universal domain graph, or general graph engine. Keep the feedback routes required by this procedure. This specification does not define machinery for other execution variants.

## Related contracts

[Code Generation](phases/construction/activities/code-generation.md), [Code Validation](phases/construction/activities/code-validation.md), and [Code Integration](phases/construction/activities/code-integration.md) set separate accepted Activity contracts under IE24, IE25, and IE27 in [authoring progress](authoring_progress.md). These approvals do not add agent profiles or adopt existing skill implementations.
