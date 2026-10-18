# Construction Activities

[Construction phase](../README.md) | [Implementation](../implementation.md) | [Activity concept](../../../activity.md)

## Purpose

These contracts define Code Generation, Code Validation, and Code Integration within Implementation. They are Activities, not workflow stages.

The Activity classification, fixed execution model, check duties, and shared attempt rules are agreed. Detailed role, evidence, completion, and handoff proposals remain open. Shorter contracts do not accept those proposals or authorize an executing unit.

## Shared execution rules

Use one orchestrator-controlled subagent model. The orchestrator dispatches workers and coordinates the fixed Generation, Validation, and Integration procedure, including authorized correction routes.

Ready tasks can run concurrently under the [task admission rules](../../../runtime.md#task-admission-and-baselines). Keep each admitted baseline fixed. Activity feedback does not change authored task dependencies.

Each assignment identifies the task, current definition, upstream contracts, baseline, prerequisite conditions, and execution authority. Include the Activity occurrence, its current attempt, the enclosing Implementation attempt, and retained work or findings.

Within one Implementation attempt, the task and Activity definition identify one fixed occurrence. Apply the shared [Activity attempt rules](../../../runtime.md#activity-attempts). Keep original attempt and material bindings; late results cannot complete newer work.

Workers report facts. Authorized orchestrator and CLI operations control progress, returns, acceptance, and completion. Workers do not need to spawn reviewers or call one another. Generation and non-author Validation use separate contexts.

Activities inherit [Effort](../../../effort.md) from Implementation. They have no separate Effort setting. Effort does not remove required work, checks, independent feedback, or authority rules.

## Records and supporting detail

Read task definitions from the [authored graph](../task-graph.md). Read execution progress through the CLI. Do not store changing progress in task definitions or supporting documents.

Each Activity owns its named [evidence](../../../runtime.md#stage-and-activity-evidence). Bind results to scope, attempt, material, relevant inputs, conditions, and supporting output. Retain required checkpoints and external evidence.

The drafts propose no required Activity Markdown document. Optional detail uses `details/code-generation/`, `details/code-validation/`, or `details/code-integration/` within the unit.

Optional supporting Markdown uses the [metadata contract](../../../metadata.md) and `supporting-document` type. Proposed entry skills perform self-review; they do not write journals or projections directly.

## Review, correction, and recovery

Required Code Validation and Unit of Work Review are separate from additional review. The drafts propose additional review only when the requester asks for it.

Apply [requester intervention](../implementation.md#requester-intervention) only for hard blockers beyond agent authority. Ordinary defects, failed checks, and assessment corrections follow agent-led paths. Routine task completion needs no requester approval.

Activity questionnaires support the orchestrator's return decision. Their answers do not authorize returns or upstream revision. Apply the [revision rules](../../../revision.md) when approved contracts or completion are invalid.

Local corrections, failed commands, waits, pauses, resumes, and new sessions keep the current unended Activity attempt. Reexecution after an authorized return or reopening starts a new attempt. Integration-only retries keep the current Integration attempt and cannot hide implementation changes.

Preserve interrupted work and confirm earlier workers stopped before resuming. Use the [Implementation recovery rules](../implementation.md#attempts-failures-and-recovery), including unit-wide shutdown and the separately proposed post-completion return policy.

Activity completion does not complete Implementation or grant publication, deployment, or requester approval.

## Contracts

- [Code Generation](code-generation.md): implement and check task material.
- [Code Validation](code-validation.md): check and independently assess actual task material.
- [Code Integration](code-integration.md): prepare, check, and accept the combined candidate under the unit lock.
