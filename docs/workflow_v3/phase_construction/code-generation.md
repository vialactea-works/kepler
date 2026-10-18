# Activity: Code Generation

[Implementation Execution](implementation-execution.md) | [Activity](../activity.md) | [Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

This document defines the Code Generation Activity contract within Implementation Execution. The fixed Activity order, check duties, and attempt rules are agreed. Role assignments and details about completion, evidence, and handoffs remain proposed.

Saving this draft does not accept its proposals or authorize an executing task.

## Goal

Implement one task's bounded outcome and supply checked material for independent Code Validation.

Code Generation completion does not complete the enclosing Implementation Execution stage or establish successful Validation, Code Integration, or task completion.

## Inputs

- The current task identity and definition in `tasks-dag.json`, including inputs, outputs, acceptance criteria, guidance, verification, dependencies, and prerequisites.
- Relevant `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, supporting files, and project standards.
- The fixed admission baseline containing required predecessor work.
- Applicable implementation authority, the enclosing Execution attempt, the Code Generation occurrence and attempt.
- Relevant source, tests, check configuration, and available execution conditions.
- Retained work, earlier findings, and evidence when correcting or resuming the task.

Read task definitions from the [authored graph](task-graph.md). Read execution state through CLI-owned operations, not authored status fields.

## Entry conditions

Start Code Generation when:

- The orchestrator has admitted the task under the [admission rules](../runtime.md#task-admission-and-baselines), or authorized a return for code changes.
- The task contract, relevant upstream inputs, fixed admission baseline, and applicable execution authority are available.
- Prerequisites for the affected implementation work are satisfied.

Existing application code, tests, and passing checks are not entry requirements. Establish planned infrastructure before dependent work or verification needs it.

Code Generation is an Activity within Implementation Execution. Use the admitted baseline and current task contract. Preserve valid retained work during corrections; the baseline does not require discarding it.

## Scope

### Included

- Implement the task's code, tests, configuration, and required documentation.
- Establish planned verification infrastructure and exercise changed behavior.
- Run typechecking and tests related to the modifications.
- Self-review the implementation against its task and upstream obligations.
- Supply identified output material, evidence, findings, and relevant inputs for Code Validation.

### Excluded

- Changing upstream requirements, task definitions, or selected planning decisions without applicable revision authority.
- Treating author self-review as independent Code Validation.
- Accepting the combined integration candidate or declaring the task integrated.
- Publishing, releasing, deploying, or granting requester approval.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Task output checkpoint | Identify the implementation, tests, configuration, and required documentation supplied to Validation. |
| Generation evidence | Record checks, self-review, covered material, relevant inputs, and actual results through CLI-owned operations. |
| Optional supporting detail | Explain useful task findings under `details/code-generation/`, with relevant references and task scope. |

The draft proposes no required Generation Markdown document. Do not duplicate task definitions or store execution state in authored files.

Optional supporting Markdown uses the shared [metadata contract](../metadata.md) and `supporting-document` type. Application outputs and evidence logs follow their own contracts.

## Generation procedure

Implement the bounded task outcome with the selected solution and suitable project patterns. Add or update tests for changed public behavior, including relevant failures and boundaries.

Use the lowest test level that proves the behavior. Test real collaborations when isolated tests cannot establish correctness. Cover critical complete workflows when their wiring matters.

Run typechecking and tests related to the modifications. Establish planned missing infrastructure; do not invent successful results or waive required checks.

Prepare the task output checkpoint under the shared [checkpoint procedure](../runtime.md#repository-checkpoint-procedure). Final evidence must cover that material, not an earlier working copy.

Use the self-review and completion conditions below before reporting the result. Workers report facts. The orchestrator and authorized CLI operations control progress and handoffs.

## Attempts, failures, and recovery

Use the Code Generation Activity attempt within the enclosing Implementation Execution attempt. Task implementation and the Activity sequence add no task-coding or protocol-run attempt identity.

Local corrections, failed commands, pauses, and resumes retain the current Activity attempt under the shared [attempt rules](../runtime.md#activity-attempts).

Validation or Integration findings can require a return to Code Generation. The orchestrator authorizes that return under the [revision rules](../revision.md#authority-and-escalation). Execute Code Generation, then Validation and Integration as required by the fixed procedure.

For interrupted work, preserve retained material and confirm that earlier workers stopped before resuming an unended attempt. Apply Implementation Execution's [unit-wide shutdown and scoped-return rules](implementation-execution.md#attempts-failures-and-recovery). An ended attempt cannot complete a task or transfer its completion to a reopened Activity.

## Depth

Apply the shared [depth definition](../depth.md). Code Generation inherits the Implementation Execution depth, including any explicit stage override. Do not set an Activity-level depth.

| Depth | Generation guidance |
| --- | --- |
| Minimal | Supply concise implementation findings, changed scope, check results, and handoff references. |
| Standard | Explain significant implementation choices, relevant failures, test coverage, and corrections. |
| Comprehensive | Explain complex interactions, difficult failure conditions, and verification limits in linked supporting detail. |

Depth does not remove task obligations, checks, self-review, evidence, or subsequent independent Validation.

## Agent roles

The assignment below remains proposed.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Code Generation owner | `kepler-coder` | Implement the task, tests, and required documentation; run Generation checks and self-review. |

Use a worker context separate from the Code Validation worker. This preserves non-author Validation. The Activity contract does not implement role profiles or add a worker-topology choice.

The orchestrator coordinates handoffs and revision decisions. The Code Generation worker does not need to spawn a reviewer or call the Validation worker.

## Supporting skills

[kepler-code](../skills.md#kepler-code) is the proposed entry skill. It owns implementation, Generation checks, self-review, evidence reporting, and the Code Validation handoff.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Apply the [common skill rules](../skills.md#common-rules).

These responsibilities do not adopt existing skill implementations or settle role-profile details.

## Review and approval

### Self-review

Review the implementation, tests, scope, and task acceptance conditions. Correct local defects within the current Generation attempt.

Self-review belongs in `kepler-code`. It does not replace the following Code Validation Activity or require another Activity attempt.

### Additional review

Apply Implementation Execution's [additional-review rule](implementation-execution.md#additional-review). Required independent Code Validation remains separate from requester-triggered additional review.

### Requester intervention

Apply Implementation Execution's [requester-intervention rule](implementation-execution.md#requester-intervention). Report hard blockers to the orchestrator. Do not request routine task approval or ask the requester to resolve ordinary implementation corrections.

### Reopening questionnaire

1. Does the task implementation, its tests, or required documentation need correction?
2. Does a finding invalidate the generated outputs or their required check coverage?
3. Does a suspected upstream problem exceed the current task contract or authorized implementation choices?

Report answers and the proposed boundary to the orchestrator under the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers do not authorize a return or stage revision.

## Completion conditions

Complete Code Generation when it supplies the required outputs and its typechecking, related tests, and self-review succeed. Pass the output checkpoint, relevant inputs, changed scope, and evidence to Code Validation.

The draft also requires:

- The outputs satisfy the task's implementation obligations without unauthorized upstream changes.
- Required evidence identifies the actual output material, relevant inputs, conditions, and current Activity attempt.
- No blocking Generation finding remains unresolved.

Code Generation makes the task eligible for Code Validation. It does not complete the enclosing stage, task, or Unit of Work.

### Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Generation check result | Task output checkpoint, changed behavior, related tests, task contract, and relevant inputs. | Typechecking and modification-related tests succeed against the identified material. |
| Generation self-review result | Task implementation, tests, required documentation, and acceptance conditions. | Required outputs are supplied; no blocking Generation findings remain. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row applies only when the requester asks for that review. It does not replace Code Validation.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Keep Generation evidence bound to its Activity attempt and covered material. Record results through CLI-owned operations; skills do not edit journals or projections directly.

A commit identifies material. It does not establish successful checks, independent feedback, or requester approval.

## Handoff

**Next Activity:** [Code Validation](code-validation.md).

Identify the unit, task, current definition, fixed admission baseline, Generation attempt, and output checkpoint.

Supply relevant upstream contracts, changed scope, check results, self-review evidence, execution conditions, and nonblocking limitations. Keep each result bound to its original material and attempt. The orchestrator coordinates the handoff to the separate Validation worker context.
