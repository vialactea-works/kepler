# Activity

[Workflow phase index](README.md) | [Construction phase index](phases/construction/README.md)

## Purpose

An **Activity** is a named, bounded execution responsibility performed within a stage. The owning phase or stage defines its scope and contract.

An Activity is not a workflow stage, an agent, a skill, a planned task, or an independent lifecycle milestone. Supporting skills can perform an Activity. They do not define its boundary.

## Definition, occurrence, and attempt

An Activity definition is a reusable contract. It names the responsibility and its required behavior.

An Activity occurrence binds that definition to one stage execution and a work scope defined by the owning phase. An Activity attempt is one execution of that occurrence.

The owning phase or stage defines its scope, inputs, outputs, outcomes, role limits, procedures, checks, evidence, completion, corrections, and handoffs. Phases do not share a universal unit or task schema for Activities.

An Activity inherits the effort of its owning stage. It does not have a separate effort setting. Activity completion does not complete the enclosing stage or grant requester consent or permission to operate.

## Activity attempts

Each Activity attempt has a distinct identity and run floor. Bind it to its Activity occurrence and enclosing stage attempt. The stage attempt supplies coordination context; it does not replace the Activity attempt.

Allow at most one active attempt for a fixed Activity occurrence. Keep the enclosing stage's active-attempt limit. Failed commands, local corrections within the current Activity, waits, pauses, resumes, and new sessions do not create another Activity attempt.

An authorized return creates a new Activity attempt when the Activity executes again. Keep each result bound to the attempt and material that produced it. Ended-attempt results cannot complete or cancel newer work, even if candidate bytes and the enclosing stage attempt remain unchanged.

The stage and each Activity own their named evidence. Shared scope and material bindings do not replace either contract. Do not move historical Activity evidence to a new stage attempt.

Use the shared CLI-owned journal and attempt mechanics. Do not add a second lifecycle engine, protocol-run identity, or task-coding attempt identity. Phase event payloads, Activity ID formats, commands, and projections remain implementation choices under the shared [event envelope](runtime.md#event-envelope-choices).

## Construction MVP

Within Construction's Implementation stage, run a fixed Activity procedure for each task:

1. **Code Generation** implements the task outcome, runs typechecking and modification-related tests, and performs self-review.
2. **Code Validation** runs typechecking, the project build, and the full application test suite. A non-author reviewer gives independent feedback without editing the candidate.
3. **Code Integration** checks and accepts the combined candidate under the unit's integration lock.

The owning stage controls handoffs. Activity workers report findings; they cannot authorize returns or reopen upstream stages. Authorized returns route required code changes to Code Generation, then repeat Validation and Integration as required. Integration-only retries stay within the current Code Integration attempt. See [Implementation](phases/construction/implementation.md) for coordination and recovery rules.

This fixed procedure does not replace the accepted task dependency graph. The plan defines task dependencies and prerequisite conditions. The orchestrator assesses readiness from those requirements and current execution facts. Activity order is separate from task scheduling. Feedback routes are not task dependencies.

No generic Activity registry, arbitrary graph language, interpreter, or Basic/Workshop/Factory preset belongs in this MVP. No team engine, swarm, extra protocol state store, or universal domain graph belongs in it. Defer a general graph engine; keep the feedback routes required by this procedure. Add only behavior needed to complete an agreed MVP scenario correctly. Future execution variants alone do not justify new machinery.

## Related contracts

[Code Generation](phases/construction/activities/code-generation.md), [Code Validation](phases/construction/activities/code-validation.md), and [Code Integration](phases/construction/activities/code-integration.md) define separate Activity contracts. They remain proposals except for their Activity classification and the accepted Construction rules recorded in [authoring progress](authoring_progress.md).
