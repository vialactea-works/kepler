# Unit of Work Review

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Accepted by the requester under [UR16](../../authoring_progress.md#unit-of-work-review-decisions).

The requester accepted the complete Unit of Work Review contract. It specifies the review procedure, roles, skills, evidence, approval conditions, and handoff. [CN17](../../authoring_progress.md#completed-construction-decisions) records the agreed whole-unit review scope.

This approval concerns the specification. It does not approve an executing Unit of Work or authorize delivery.

## Goal

Determine whether the complete integrated result satisfies the Unit of Work's agreed outcome, functional contracts, and quality obligations.

Review the unit as a whole, including interactions between task outputs. A collection of successful task reports does not prove that the complete outcome is met.

## Inputs

- Current `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `tasks-dag.json`, and relevant supporting files.
- The completed Implementation handoff and final repository-qualified integrated checkpoint set.
- Required Activity results, independent feedback, integration provenance, and completion evidence.
- Relevant project constraints, verification conditions, requester decisions, and applicable approvals.
- Known deployment constraints and planned delivery dependencies.
- Earlier review findings and retained evidence when revising the result.

Treat earlier results as inputs with their original bindings. They do not prove completion of this review attempt.

## Entry conditions

Start when:

- Implementation is complete under its applicable contract for the current unit.
- The integrated result, relevant upstream artifacts, and required execution evidence are identified and available.
- Review scope and unit acceptance conditions are explicit. They give sufficient detail for a whole-unit conclusion.

Do not make delivery, publication, deployment, or requester acceptance a precondition for this review.

## Scope

### Included

- Determine whether the integrated outcome meets the unit's purpose, scope, functional behavior, and applicable quality requirements.
- Examine component interactions, compatibility, failure behavior, and required operational or deployment preparation.
- Identify the applicable obligations. Determine which obligations the supporting evidence covers and whether that evidence is relevant.
- Identify concrete defects, unsupported claims, missing proof, and material limitations.
- Report findings, uncertainties, and proposed correction boundaries to the orchestrator.
- Prepare a reviewed-result handoff for Deliver when completion conditions are met.

### Excluded

- Replacing required Code Generation, Code Validation, or Code Integration work with a review opinion.
- Editing implementation or upstream contracts to make the reviewed result appear compliant.
- Waiving requirements or accepting consequential trade-offs without the requester's authority.
- Publishing, releasing, deploying, or creating an external review request as an automatic review effect.

The stage can examine source, retained outputs, interfaces, and available environments. Additional check execution follows existing permissions and relevant project obligations.

## Artifacts and records

No separate review Markdown document is required. Record review evidence and findings through CLI-owned operations, with retained supporting output where needed.

A readable review report can be a derived view or retained evidence attachment. It must not become an independent authority for completion, approvals, or changing finding dispositions.

Optional authored analysis can use `details/unit-of-work-review/` and `type: supporting-document`. Reference it from the relevant owning artifact or evidence record and explain its purpose.

Keep the existing ownership of the integrated implementation and upstream artifacts. Review consumes them. It does not redefine their contracts.

## Review procedure

1. **Identify the result.** Record the integrated checkpoint set, relevant upstream versions, unit obligations, and originating execution records.
2. **Determine evidence coverage.** Determine whether required Activity coverage, combined-result checks, relevant conditions, applicability, and retention satisfy the evidence requirements.
3. **Review the outcome.** Examine the complete behavior, interactions, failure cases, quality obligations, and deployment preparation against current contracts.
4. **Report findings.** State each material problem, its evidence, affected obligation, uncertainty, and proposed correction boundary.
5. **Resolve blocking findings.** Obtain the orchestrator's decision and execute any authorized revision cascade before claiming review completion.
6. **Complete the assessment.** Self-check review coverage, record the result and any applicable approval, then prepare the Deliver handoff.

### Evidence assessment

Successful task checks are relevant evidence, not automatic proof of every unit acceptance condition. Determine which obligations they cover and identify gaps.

Review the final integrated material, not only isolated worker branches or changed files. Use relevant unchanged behavior and configuration when they affect the outcome. The [Unit of Work Review package](../../diff-package.md#unit-of-work-review) covers the range from the original unit Review baseline set to the assessed final checkpoint set. It does not limit review to changed lines. Review the complete outcome, current contracts, relevant unchanged behavior, and applicable evidence.

This stage does not make an unconditional repeat of typechecking, the build, and the full suite necessary. Use required Implementation results only while they apply to the material and inputs.

Run additional checks when needed to show that an uncovered review obligation is satisfied, subject to applicable permissions. Do not claim compliance from an unexecuted check.

Missing mandatory upstream evidence invalidates the relevant upstream completion. Report it for revision. New review checks do not retroactively complete an earlier stage attempt.

A changed checkpoint alone is not a reason to repeat valid checks. Apply the shared [evidence applicability rules](../../runtime.md#evidence-applicability) to covered material and relevant inputs.

### Findings and correction

A blocking finding prevents proof that the unit satisfies an applicable obligation or required completion condition. Identify the violated contract or missing evidence. Distinguish it from optional advice.

A nonblocking limitation must not conceal an unmet requirement. Describe its actual scope and why it does not prevent the agreed outcome.

The reviewer reports facts and proposed boundaries. The orchestrator decides whether clarification, investigation, or reopening is required under the shared [revision authority](../../revision.md#authority-and-escalation).

| Finding | Proposed boundary for assessment |
| --- | --- |
| The review assessment or its references are incorrect, with unchanged valid implementation. | Correct within the current review attempt when the stage is active. |
| The implementation or required Implementation evidence is invalid. | Implementation, followed by a new Unit of Work Review and Deliver. |
| The task graph or technical solution must change. | Implementation Planning and every subsequent unit stage. |
| Functional or quality obligations are invalid. | The earliest affected upstream stage and its downstream cascade. |
| A valid review leaves only Delivery instructions to correct. | Deliver, while its inputs and the reviewed result are still valid. |

An upstream revision invalidates current downstream completion immediately. Reexecute the affected stages even when some artifact bytes stay unchanged.

Code Generation, Code Validation, and Code Integration are Activities within Implementation. Apply its accepted [post-completion return rule](implementation.md#return-after-completed-implementation) when that unit stage reopens. After reopening, Activities must use new attempts and evidence. Keep unaffected Activity records with their original bindings after applicability assessment. The new unit attempt must have its own completion assessment.

## Effort

Apply the shared [effort definition](../../effort.md).

| Effort | Unit of Work Review guidance |
| --- | --- |
| Minimal | State coverage, material findings, evidence applicability, and the whole-unit conclusion concisely. |
| Standard | Explain important interactions, quality concerns, verification gaps, and correction rationale. |
| Comprehensive | Analyze complex failure paths, cross-boundary effects, operational concerns, and evidence limitations in supporting detail. |

Effort does not remove whole-unit coverage, independent assessment, blocking-finding resolution, or applicable requester authority.

## Agent roles

`kepler-reviewer` is the accepted stage owner. The reviewer must have capabilities in functional analysis, code review, quality assessment, and evidence evaluation.

The reviewer must not be the primary implementation author for the reviewed result. Earlier task review participation does not itself prevent whole-unit review.

A different model, vendor, or person is not necessary for independent review. The reviewer must review the actual integrated material and relevant contracts independently.

The orchestrator owns revision decisions and coordination. The requester has authority over the intended outcome, scope, consequential trade-offs, and applicable acceptance.

These assignments do not implement agent profiles. [CN22](../../authoring_progress.md#completed-construction-decisions) selects an orchestrator-controlled subagent model for Implementation only. It does not select a worker model for Unit of Work Review.

## Supporting skills

[kepler-review](../../skills.md#kepler-review) is the accepted entry skill. It performs whole-unit assessment, self-checks its coverage, records evidence, and prepares the handoff.

Use [kepler-research](../../skills.md#kepler-research) for uncertain facts and [kepler-grilling](../../skills.md#kepler-grilling) for requester-owned questions. These supporting procedures do not authorize revisions.

Apply the [common skill rules](../../skills.md#common-rules). Current skill implementations and legacy review artifacts do not automatically apply.

## Review and approval

These additional review and approval rules are accepted.

### Self-review

Self-review belongs in `kepler-review`. It must cover the complete unit, use applicable evidence, address blocking findings, and identify the correct result.

Self-review reports whether review coverage is complete. It does not replace the required independent whole-unit assessment or task-level feedback.

### Additional review

Additional external review occurs only when the requester asks for it. The Unit of Work Review stage is still required.

### Requester acceptance

Resolve requester-owned consequential choices before completion. Obtain separate whole-unit acceptance only when an applicable authority rule or requester instruction makes it necessary.

When acceptance is required, present the actual integrated result, assessment, material limitations, and decisions covered. Record explicit acceptance against the current review attempt and reviewed material through CLI-owned operations.

A positive review, successful checks, or a repository commit does not grant requester acceptance. Review completion does not authorize delivery side effects.

### Reopening questionnaire

1. Does a finding invalidate the whole-unit conclusion, review coverage, or assessment of a required obligation?
2. Does the reviewed material or a relevant input differ from what the review evidence covers?
3. Is a blocking finding unresolved or missing an authorized correction decision?
4. Does evidence fail to prove required upstream completion or an applicable unit acceptance condition?
5. Does an applicable requester acceptance no longer cover the current reviewed material or consequential decision?

Report answers and the proposed earliest boundary to the orchestrator under the shared [revision procedure](../../revision.md#revision-procedure).

Answers do not authorize reopening or exempt this stage from an upstream cascade. Satisfy the stage conditions again after authorized reopening, including any applicable acceptance.

## Completion conditions

Complete the stage when:

- The current integrated result and relevant upstream contracts are identified and consistent.
- The complete unit outcome has been reviewed against applicable functional, quality, compatibility, and known deployment obligations.
- Required execution evidence is available, applicable, retained, and sufficient for the obligations it claims to cover.
- Missing proof has been resolved through applicable checks or authorized upstream revision, not by waiving required evidence.
- No blocking finding or requester-owned consequential choice is unresolved.
- Nonblocking limitations have explicit scope and rationale consistent with current obligations.
- The independent assessment, self-review, and any requested additional review are complete.
- Any applicable requester acceptance is recorded against the actual reviewed material.
- The handoff identifies the reviewed checkpoint, obligations, evidence, findings, and delivery constraints.

Publication, release, deployment, and completed delivery operations are not review completion requirements.

### Evidence coverage

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Implementation evidence assessment | Final integrated material, upstream contracts, required Activity records, conditions, and integration provenance. | Required earlier evidence is present, applicable, and retained. Claimed coverage and any gaps are explicit. |
| Whole-unit review result | Complete integrated outcome against unit scope, functional design, quality requirements, plan, and known delivery constraints. | Independent assessment shows the required outcome. Blocking findings are resolved. Self-review states that coverage is complete and the handoff is accurate. |
| Additional check result | Material, obligation, and conditions that make additional verification necessary during review. | The identified check succeeds and supplies the missing review proof without replacing mandatory upstream records. |
| Requested additional review result | Material and scope identified in an additional review request. | The requested review is complete and its blocking findings are resolved. |
| Applicable requester acceptance record | Integrated result, assessment, material limitations, and decisions covered by required acceptance. | The requester explicitly accepts the identified material for the current review attempt. |

Additional check and review rows apply only when their stated conditions occur. These conditions do not make required unit coverage optional.

Bind this stage's new assessment to its unit-scoped attempt, material, relevant inputs, result, and supporting output. Keep originating bindings when referencing earlier evidence. The package selects Implementation material. A completed Review is not necessary to render it. The actual Review result stays bound to this current Review attempt.

Apply the shared [evidence and approval rules](../../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Create the required repository checkpoint set before recording any requester acceptance.

Apply the shared [evidence and approval record requirements](../../runtime.md#evidence-and-approval-bindings). Exact phase event types, payload details, commands, and derived report layouts remain implementation work. No new execution-state authority or mandatory report filename is proposed.

## Handoff

**Standard workflow next stage:** [Deliver](deliver.md).

Supply the reviewed integrated checkpoint set, current upstream artifacts, review result, evidence references, and any applicable requester acceptance.

Include known delivery constraints, remaining nonblocking limitations, planned prerequisites, and operations that are subject to existing permissions or requester decisions.

Deliver must show that its requested outcome is met and its operation is authorized. A successful review does not imply permission to push, merge, publish, release, or deploy.
