# Activity: Code Validation

[Implementation Execution](implementation-execution.md) | [Activity](../activity.md) | [Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

This document defines the Code Validation Activity contract within Implementation Execution. Independent non-author feedback, check duties, and attempt rules are agreed. Role assignments and details about completion, evidence, and handoffs remain proposed.

Saving this draft does not accept its proposals or authorize an executing task.

## Goal

Determine whether the generated task output satisfies its contract and is ready for Code Integration.

Successful Code Validation makes the task eligible for Code Integration. Code Validation does not accept the unit's combined candidate or complete the enclosing Implementation Execution stage.

## Inputs

- The current task definition, acceptance criteria, verification obligations, and relevant upstream contracts.
- The task's fixed admission baseline and actual generated output checkpoint.
- Applicable Generation completion, check results, self-review evidence, and relevant input bindings.
- Project check configuration, available execution conditions, and applicable permission or resource constraints.
- The enclosing Execution attempt, the Code Validation occurrence and attempt, and retained findings when correcting or resuming an assessment.

Use the actual implementation and tests. The author's summary alone does not supply material for independent feedback.

## Entry conditions

Start Code Validation when:

- Applicable Generation completion and its output material are available and valid for the current task contract.
- The reviewer can inspect the actual candidate, fixed admission baseline, relevant contracts, and supporting evidence.
- Prerequisites for the affected checks or review are satisfied.
- The reviewer did not author the candidate.

These conditions do not require successful Code Integration, whole-unit review, or requester task approval.

## Scope

### Included

- Assess task correctness, quality obligations, failures, test adequacy, and unintended effects.
- Run typechecking, the project build, and the full application test suite against the task output.
- Provide independent code feedback and identify concrete blocking findings or missing proof.
- Self-check the assessment and supply valid results for Code Integration.

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

Code Validation is an Activity after Code Generation. Inspect the generated output against the task contract, upstream obligations, and fixed admission baseline.

Run typechecking, the project build, and the full application test suite. Identify commands and actual coverage; a build proves typechecking only when it performs that check.

Obtain independent code feedback from a reviewer who did not author the candidate. Use a worker context separate from Code Generation. Give the reviewer the actual task material and relevant contracts.

The reviewer reports findings and uncertainty without editing the implementation. Independence does not require a different model, vendor, or human reviewer.

Assess correctness, applicable quality obligations, failure behavior, test adequacy, and unintended effects. Required project checks remain applicable; review opinion cannot replace them.

### Findings and correction

A blocking finding identifies a violated obligation, failed required check, or missing proof needed for task completion. A preference alone does not redefine the task.

Report findings, evidence, uncertainty, and proposed correction boundaries to the orchestrator. The reviewer does not authorize a return or fix the implementation during Validation.

A task-local implementation defect can require an authorized return to Code Generation and the following Activities. Independent work continues while its inputs and contracts remain valid.

Correct assessment errors within the active Code Validation attempt when its material and inputs remain valid. Follow the shared revision rules when completion or upstream contracts are invalid.

## Attempts, failures, and recovery

Use the Code Validation Activity attempt within the enclosing Implementation Execution attempt. Task implementation and the Activity sequence add no task-coding or protocol-run attempt identity.

Failed commands, assessment corrections, pauses, and resumes retain the current Activity attempt under the shared [attempt rules](../runtime.md#activity-attempts).

The orchestrator authorizes returns under the shared [revision rules](../revision.md#authority-and-escalation). Apply Implementation Execution's [return and recovery rules](implementation-execution.md#attempts-failures-and-recovery), including unit-wide shutdown and proposed post-completion returns.

Preserve work during interruptions and confirm previous workers stopped before resuming an unended attempt. Do not transfer earlier completion into a reopened Code Validation attempt, even when candidate bytes match.

## Depth

Apply the shared [depth definition](../depth.md). Code Validation inherits the Implementation Execution depth, including any explicit stage override. Do not set an Activity-level depth.

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

The orchestrator coordinates handoffs and revision decisions. The Code Validation worker does not need to spawn a reviewer or call the Code Generation worker.

## Supporting skills

[kepler-code-feedback](../skills.md#kepler-code-feedback) is the proposed entry skill. It owns required checks, independent feedback, assessment self-review, evidence reporting, and the Code Integration handoff.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Apply the [common skill rules](../skills.md#common-rules).

These responsibilities do not adopt existing skill implementations or settle role-profile details.

## Review and approval

### Self-review

Self-check the validation scope, findings, and evidence before reporting completion. Report disputed requirements or upstream problems to the orchestrator.

Self-review belongs in `kepler-code-feedback`. It checks the assessment and does not replace independent review of the task implementation.

### Additional review

Apply Implementation Execution's [additional-review rule](implementation-execution.md#additional-review). The required independent assessment is part of Validation, not an optional additional review.

### Requester intervention

Apply Implementation Execution's [requester-intervention rule](implementation-execution.md#requester-intervention). Failed checks and ordinary code defects follow agent-led correction paths, not requester task-approval steps.

### Reopening questionnaire

1. Does a finding invalidate required check results, independent feedback, or the validation assessment?
2. Does reviewed material or a relevant input differ from the material covered by Validation evidence?
3. Does resolving the finding require Generation changes or an earlier upstream revision?

Report answers and the proposed boundary to the orchestrator under the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers do not authorize a return or stage revision.

## Completion conditions

Complete Code Validation only when required checks succeed, independent feedback is complete, and no blocking findings remain. A missing or interrupted check is not a successful result.

The draft also requires:

- The assessment covers the actual candidate, task contract, relevant upstream obligations, and fixed admission baseline.
- Required evidence identifies the actual task material, conditions, relevant inputs, and current Activity attempt.
- The assessment's scope, findings, and evidence have been self-checked.

Code Validation completion requires no routine requester task approval. Task completion still requires successful Code Integration and the task's other completion conditions.

### Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Validation check result | Task output checkpoint, project check configuration, and relevant execution conditions. | Typechecking, the project build, and the full application test suite succeed. |
| Independent code feedback result | Actual task output against its baseline, task contract, functional design, and applicable quality requirements. | Independent feedback is complete. No blocking findings remain, and the validation assessment is self-checked. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row applies only when the requester asks for that review. Required independent feedback remains mandatory.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Keep Code Validation evidence bound to its Activity attempt and covered material. Record results through CLI-owned operations; skills do not edit journals or projections directly.

An assessment or check record retains its originating attempt and material bindings. It does not establish successful combined-candidate Code Integration checks or whole-unit review.

## Handoff

**Next Activity:** [Code Integration](code-integration.md).

Identify the unit, task, current definition, fixed admission baseline, reviewed output checkpoint, and originating Generation and Validation evidence.

Supply check commands, execution conditions, independent findings, resolved blocking concerns, and nonblocking limitations. Keep each result bound to its original material and attempt. The orchestrator coordinates the handoff to Code Integration.
