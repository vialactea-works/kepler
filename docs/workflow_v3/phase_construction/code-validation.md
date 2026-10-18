# Task stage: Code Validation

[Implementation Execution](implementation-execution.md) | [Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

The requester retains independent Code Validation in the Generation–Validation loop and requires this dedicated task-stage contract. Check duties, attempt rules, and independent non-author feedback remain agreed. Role assignments and additional details about completion, evidence, and handoffs remain proposed.

Saving this draft does not accept its proposals or authorize an executing task.

## Goal

Determine whether the generated task output satisfies its contract and is ready for Task Integration.

Successful Validation makes the task ready for Task Integration. Validation does not accept the unit's combined candidate.

## Inputs

- The current task definition, acceptance criteria, verification obligations, and relevant upstream contracts.
- The task's admitted baseline and actual generated output checkpoint.
- Applicable Generation completion, check results, self-review evidence, and relevant input bindings.
- Project check configuration, available execution conditions, and applicable permission or resource constraints.
- The enclosing Execution scope, the task's Validation attempt, and retained findings when correcting or resuming an assessment.

Use the actual implementation and tests. The author's summary alone does not supply the material needed for independent feedback.

## Entry conditions

The draft proposes starting when:

- Applicable Generation completion and its output material are available and valid for the current task contract.
- The reviewer can inspect the actual candidate, admitted baseline, relevant contracts, and supporting evidence.
- Prerequisites needed for the affected checks or review are satisfied.
- The reviewer meets the independence rule below.

These conditions do not require successful Task Integration, whole-unit review, or requester task approval.

## Scope

### Included

- Assess task correctness, quality obligations, failures, test adequacy, and unintended effects.
- Run typechecking, the project build, and the full application test suite against the task output.
- Provide independent code feedback and identify concrete blocking findings or missing proof.
- Self-check the assessment and supply valid results to Task Integration.

### Excluded

- Authoring or editing the implementation under review.
- Waiving required checks or accepting changed requirements without applicable revision authority.
- Treating review opinion as successful check execution.
- Accepting the combined candidate, completing whole-unit review, or authorizing delivery.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Validation check evidence | Identify commands, conditions, task material, and actual check results. |
| Independent code feedback | Identify assessment coverage, findings, relevant obligations, uncertainty, and proposed correction boundaries. |
| Optional supporting detail | Explain substantial assessment findings under `details/code-validation/`, with relevant references and task scope. |

The draft proposes no required Validation Markdown document. Record execution facts through CLI-owned operations, not authored status fields.

Optional supporting Markdown uses the shared [metadata contract](../metadata.md) and `supporting-document` type. Retained check output and generated views follow their own contracts.

## Validation procedure

Code Validation is a task-scoped stage after Code Generation. Inspect the generated output against the task contract, upstream obligations, and admitted baseline.

Run typechecking, the project build, and the full application test suite. Identify commands and actual coverage; a build proves typechecking only when it performs that check.

Obtain independent code feedback from a reviewer who did not author the candidate. Give the reviewer the actual task material and relevant contracts.

The reviewer reports findings and uncertainty without editing the implementation. Independence does not require a different model, vendor, or human reviewer.

Assess correctness, applicable quality obligations, failure behavior, test adequacy, and unintended effects. Required project checks remain applicable; do not replace them with review opinion.

### Findings and correction

A blocking finding identifies a violated obligation, failed required check, or missing proof needed for task completion. A preference alone does not redefine the task.

Report findings, evidence, uncertainty, and proposed correction boundaries to the orchestrator. The reviewer does not authorize reopening or fix the implementation within Validation.

A task-local implementation defect can require an authorized return to Generation and the following task stages. Independent work continues while its inputs and contracts remain valid.

Correct assessment errors within the active Validation attempt when its material and inputs remain valid. Follow the shared revision rules when completion or upstream contracts are invalid.

## Attempts, failures, and recovery

Use the task-scoped Validation attempt within the enclosing Execution attempt. Task coding and task implementation add no attempt identities or run floors.

Failed commands, assessment corrections, pauses, and resumes retain the current attempt under the shared [attempt rules](../runtime.md#stage-attempts).

The orchestrator authorizes returns under the shared [revision rules](../revision.md#authority-and-escalation). Apply Execution's [return and recovery rules](implementation-execution.md#attempts-failures-and-recovery), including unit-wide shutdown and proposed post-completion returns.

Preserve work during interruptions and confirm previous workers stopped before resuming an unended attempt. Do not transfer earlier completion into a reopened Validation attempt, even when candidate bytes match.

## Depth

Apply the shared [depth definition](../depth.md), including the unit default and any explicit override for this stage.

| Depth | Validation guidance |
| --- | --- |
| Minimal | State reviewed material, check coverage, findings, required results, and handoff references concisely. |
| Standard | Explain significant failure paths, test gaps, quality concerns, and finding evidence. |
| Comprehensive | Explain complex interactions, difficult verification limits, and competing interpretations in linked supporting detail. |

Depth does not remove full-suite checks, independent feedback, evidence, or blocking-finding resolution.

## Agent roles

The assignment below remains proposed.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Code Validation owner | `kepler-reviewer` | Perform required checks, independent feedback, evidence assessment, and validation reporting without editing the implementation. |

The non-author reviewer must assess the actual candidate without authoring or editing its implementation. A different model, vendor, or human is not required.

The orchestrator coordinates stage handoffs and revision decisions. This contract does not require the Generation worker to spawn the Validation reviewer.

## Supporting skills

[kepler-code-feedback](../skills.md#kepler-code-feedback) is the proposed entry skill. It owns required checks, independent feedback, assessment self-review, evidence reporting, and the Integration handoff.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Apply the [common skill rules](../skills.md#common-rules).

These responsibilities do not adopt existing skill implementations or settle inline, subagent, or swarm working discipline.

## Review and approval

### Self-review

Self-check the validation scope, findings, and evidence before reporting completion. Report disputed requirements or upstream problems to the orchestrator.

Self-review belongs in `kepler-code-feedback`. It checks the assessment and does not replace independent review of the task implementation.

### Additional review

Apply Execution's [additional-review rule](implementation-execution.md#additional-review). The required independent assessment is part of Validation, not an optional additional review.

### Requester intervention

Apply Execution's [requester-intervention rule](implementation-execution.md#requester-intervention). Failed checks and ordinary code defects follow agent-led correction paths, not requester task-approval steps.

### Reopening questionnaire

1. Does a finding invalidate required check results, independent feedback, or the validation assessment?
2. Does reviewed material or a relevant input differ from the material covered by validation evidence?
3. Does resolving the finding require Generation changes or an earlier upstream revision?

Report answers and the proposed boundary to the orchestrator under the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers do not authorize reopening.

## Completion conditions

Complete Validation only when required checks succeed, independent feedback is complete, and no blocking findings remain. A missing or interrupted check is not a successful result.

The draft additionally requires:

- The assessment covers the actual candidate, task contract, relevant upstream obligations, and admitted baseline.
- Required evidence identifies the actual task material, conditions, relevant inputs, and current Validation attempt.
- The assessment's scope, findings, and evidence have been self-checked.

Validation completion requires no routine requester task approval. Task completion still requires successful Task Integration and the task's other completion conditions.

### Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Validation check result | Task output checkpoint, project check configuration, and relevant execution conditions. | Typechecking, the project build, and the full application test suite succeed. |
| Independent code feedback result | Actual task output against its baseline, task contract, functional design, and applicable quality requirements. | Independent feedback is complete. No blocking findings remain, and the validation assessment is self-checked. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row applies only when the requester asks for that review. Required independent feedback remains mandatory.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Record results through CLI-owned operations; skills do not edit journals or projections directly.

An assessment or check record retains its originating attempt and material bindings. It does not establish successful combined-candidate Integration checks or whole-unit review.

## Handoff

**Next stage:** [Task Integration](task-integration.md).

Identify the unit, task, current definition, admitted baseline, reviewed output checkpoint, and originating Generation and Validation evidence.

Supply check commands, execution conditions, independent findings, resolved blocking concerns, and nonblocking limitations. A successful handoff makes the task eligible for Integration; it does not accept the combined candidate.
