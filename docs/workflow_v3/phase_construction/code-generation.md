# Task stage: Code Generation

[Implementation Execution](implementation-execution.md) | [Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

The requester requires a dedicated contract for this task-scoped stage. The Generation–Validation loop, check duties, and attempt rules remain agreed. Role assignments and additional details about completion, evidence, and handoffs remain proposed.

Saving this draft does not accept its proposals or authorize an executing task.

## Goal

Implement one task's bounded outcome and supply checked material for independent Code Validation.

Generation completion does not establish successful Code Validation or task completion.

## Inputs

- The current task identity and definition in `tasks-dag.json`, including inputs, outputs, acceptance criteria, guidance, verification, dependencies, and prerequisites.
- Relevant `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, supporting files, and project standards.
- The recorded admission baseline containing required predecessor work.
- Applicable implementation authority, the enclosing Execution scope, and the task's Generation attempt.
- Relevant source, tests, check configuration, and available execution conditions.
- Retained work, earlier findings, and evidence when correcting or resuming the task.

Read task definitions from the [authored graph](task-graph.md). Read execution state through CLI-owned operations, not authored status fields.

## Entry conditions

The draft proposes starting when:

- Execution has admitted the task under the [admission rules](../runtime.md#task-admission-and-baselines), or authorized correction requires Generation again.
- The task contract, relevant upstream inputs, admitted baseline, and applicable execution authority are available.
- Prerequisites needed for the affected implementation work are satisfied.

Existing application code, tests, and passing checks are not entry requirements. Establish any planned infrastructure that is missing before dependent work or verification needs it.

Code Generation is a task-scoped stage within Task coding. Use the admitted task baseline and current task contract. Preserve valid retained work during corrections; the baseline is not a command to discard it.

## Scope

### Included

- Implement the task's code, tests, configuration, and required documentation.
- Establish planned verification infrastructure and exercise changed behavior.
- Run typechecking and modification-related tests.
- Self-review the implementation against its task and upstream obligations.
- Supply identified output material, evidence, findings, and relevant inputs to Code Validation.

### Excluded

- Changing upstream requirements, task definitions, or selected planning decisions without applicable revision authority.
- Treating author self-review as independent Code Validation.
- Accepting the combined integration candidate or declaring the task integrated.
- Publishing, releasing, deploying, or granting requester approval.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Task output checkpoint | Identify the task implementation, tests, configuration, and required documentation supplied to Validation. |
| Generation evidence | Record checks, self-review, covered material, relevant inputs, and actual results through CLI-owned operations. |
| Optional supporting detail | Explain useful task findings under `details/code-generation/`, with relevant references and task scope. |

The draft proposes no required Generation Markdown document. Do not duplicate task definitions or store execution state in authored files.

Optional supporting Markdown uses the shared [metadata contract](../metadata.md) and `supporting-document` type. Application outputs and evidence logs follow their own contracts.

## Generation procedure

Implement the bounded task outcome using the selected solution and suitable project patterns. Add or update tests for changed public behavior, including relevant failures and boundaries.

Use the lowest test level that proves the behavior. Test real collaborations where isolated tests cannot establish correctness. Cover critical complete workflows where their wiring matters.

Run typechecking and tests related to the modifications. Establish planned missing infrastructure rather than inventing successful results or waiving required checks.

Prepare the task output checkpoint under the shared [checkpoint procedure](../runtime.md#repository-checkpoint-procedure). Final evidence must cover that material, not an earlier working copy.

Use the self-review and completion conditions below before reporting the result. Workers report facts; the orchestrator and authorized CLI operations control transitions.

## Attempts, failures, and recovery

Use the task-scoped Generation attempt within the enclosing Execution attempt. Task coding and task implementation add no attempt identities or run floors.

Local corrections, failed commands, pauses, and resumes retain the current attempt under the shared [attempt rules](../runtime.md#stage-attempts).

Validation or Integration findings can require an authorized return to Generation. The orchestrator selects the boundary under the [revision rules](../revision.md#authority-and-escalation). Execute Generation and the following task stages again under the applicable return rules.

For interrupted work, preserve retained material and confirm earlier workers stopped before resuming an unended attempt.

Apply Execution's [unit-wide shutdown and scoped-return rules](implementation-execution.md#attempts-failures-and-recovery). Do not complete an ended attempt or transfer old completion into a reopened stage.

## Depth

Apply the shared [depth definition](../depth.md), including the unit default and any explicit override for this stage.

| Depth | Generation guidance |
| --- | --- |
| Minimal | Supply concise implementation findings, changed scope, check results, and handoff references. |
| Standard | Explain significant implementation choices, relevant failures, test coverage, and corrections. |
| Comprehensive | Explain complex interactions, difficult failure conditions, and verification limitations in linked supporting detail. |

Depth does not remove task obligations, checks, self-review, evidence, or subsequent independent Validation.

## Agent roles

The assignment below remains proposed.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Code Generation owner | `kepler-coder` | Implement the task, tests, and required documentation; run Generation checks and self-review. |

The orchestrator coordinates stage handoffs and revision decisions. This contract does not require the Generation worker to spawn a Validation subagent.

## Supporting skills

[kepler-code](../skills.md#kepler-code) is the proposed entry skill. It owns implementation, Generation checks, self-review, evidence reporting, and the Validation handoff.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Apply the [common skill rules](../skills.md#common-rules).

These responsibilities do not adopt existing skill implementations or settle inline, subagent, or swarm working discipline.

## Review and approval

### Self-review

Perform self-review of the implementation, tests, scope, and task acceptance conditions. Correct local defects within the current Generation attempt.

Self-review belongs in `kepler-code`. It does not replace the following Code Validation stage or require another stage attempt.

### Additional review

Apply Execution's [additional-review rule](implementation-execution.md#additional-review). Required Code Validation remains separate from requester-triggered additional review.

### Requester intervention

Apply Execution's [requester-intervention rule](implementation-execution.md#requester-intervention). Report hard blockers to the orchestrator. Do not request routine task approval or ask the requester to resolve ordinary implementation corrections.

### Reopening questionnaire

1. Does the task implementation, its tests, or required documentation need correction?
2. Does a finding invalidate the generated outputs or their required check coverage?
3. Does a suspected upstream problem exceed the current task contract or authorized implementation choices?

Report answers and the proposed boundary to the orchestrator under the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers do not authorize reopening.

## Completion conditions

Complete Generation when it supplies the required outputs and its typechecking, related tests, and self-review succeed. Pass the output checkpoint, relevant inputs, changed scope, and evidence to Code Validation.

The draft additionally requires:

- The supplied outputs satisfy the task's implementation obligations without unauthorized upstream changes.
- Required evidence identifies the actual output material, relevant inputs, conditions, and current Generation attempt.
- No blocking Generation finding remains unresolved.

Generation success makes the task ready for Code Validation, not Task Integration or delivery.

### Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Generation check result | Task output checkpoint, changed behavior, related tests, task contract, and relevant inputs. | Typechecking and modification-related tests succeed against the identified material. |
| Generation self-review result | Task implementation, tests, required documentation, and acceptance conditions. | Required outputs are supplied; no blocking Generation findings remain. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row applies only when the requester asks for that review. It does not replace Code Validation.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Record results through CLI-owned operations; skills do not edit journals or projections directly.

A commit identifies material. It does not establish successful checks, independent feedback, or requester approval.

## Handoff

**Next stage:** [Code Validation](code-validation.md).

Identify the unit, task, current definition, admitted baseline, Generation attempt, and output checkpoint.

Supply relevant upstream contracts, changed scope, check results, self-review evidence, execution conditions, and nonblocking limitations. Keep evidence's original material and attempt bindings.
