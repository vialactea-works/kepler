# Unit of Work Review

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Draft for discussion.

The requester agreed that this stage reviews the complete integrated result after Implementation under [CN17](../../authoring_progress.md#completed-construction-decisions). This draft proposes the remaining review procedure, roles, skills, evidence, approval conditions, and handoff.

Saving this draft does not approve its proposals, accept an executing unit, or authorize delivery.

## Goal

Determine whether the complete integrated result satisfies the Unit of Work's agreed outcome, functional contracts, and quality obligations.

Assess the unit as a whole, including interactions between task outputs. A collection of successful task reports does not establish that complete outcome.

## Inputs

- Current `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, `tasks-dag.json`, and relevant supporting files.
- The completed Implementation handoff and final integrated checkpoint.
- Required Activity results, independent feedback, integration provenance, and completion evidence.
- Relevant project constraints, verification conditions, requester decisions, and applicable approvals.
- Known deployment constraints and planned delivery dependencies.
- Earlier review findings and retained evidence when revising the result.

Treat earlier results as inputs with their original bindings. They do not establish completion of this review attempt.

## Entry conditions

The draft proposes starting when:

- Implementation is complete under its applicable contract for the current unit.
- The integrated result, relevant upstream artifacts, and required execution evidence are identified and available.
- Review scope and unit acceptance conditions are explicit enough to assess the complete outcome.

Do not require delivery, publication, deployment, or requester acceptance before performing the review that informs those decisions.

## Scope

### Included

- Assess the integrated outcome against the unit's purpose, scope, functional behavior, and applicable quality requirements.
- Examine component interactions, compatibility, failure behavior, and required operational or deployment preparation.
- Check coverage of applicable obligations and assess the relevance of supporting evidence.
- Identify concrete defects, unsupported claims, missing proof, and material limitations.
- Report findings, uncertainties, and proposed correction boundaries to the orchestrator.
- Prepare a reviewed-result handoff for Deliver when completion conditions are met.

### Excluded

- Replacing required Code Generation, Code Validation, or Code Integration work with a review opinion.
- Editing implementation or upstream contracts to make the reviewed result appear compliant.
- Waiving requirements or accepting consequential trade-offs without the requester's authority.
- Publishing, releasing, deploying, or creating an external review request as an automatic review effect.

The stage can inspect source, retained outputs, interfaces, and available environments. Additional check execution follows existing permissions and relevant project obligations.

## Artifacts and records

The draft proposes no separate required review Markdown document. Record review evidence and findings through CLI-owned operations, with retained supporting output where needed.

A readable review report can be a derived view or retained evidence attachment. It must not become an independent authority for completion, approvals, or changing finding dispositions.

Optional authored analysis can use `details/unit-of-work-review/` and `type: supporting-document`. Reference it from the relevant owning artifact or evidence record and explain its purpose.

The integrated implementation and upstream artifacts retain their existing ownership. Review consumes them; it does not redefine their contracts.

## Review procedure

1. **Identify the result.** Establish the integrated checkpoint, relevant upstream versions, unit obligations, and originating execution records.
2. **Assess evidence.** Check required Activity coverage, combined-result checks, relevant conditions, applicability, and retention.
3. **Review the outcome.** Examine the complete behavior, interactions, failure cases, quality obligations, and deployment preparation against current contracts.
4. **Report findings.** State each material problem, its evidence, affected obligation, uncertainty, and proposed correction boundary.
5. **Resolve blocking findings.** Obtain the orchestrator's decision and execute any authorized revision cascade before claiming review completion.
6. **Complete the assessment.** Self-check review coverage, record the result and any applicable approval, then prepare the Deliver handoff.

### Evidence assessment

Successful task checks are relevant evidence, not automatic proof of every unit acceptance condition. Determine which obligations they cover and identify gaps.

Assess the final integrated material, not only isolated worker branches or changed files. Use relevant unchanged behavior and configuration when they affect the outcome.

The draft does not require an unconditional repeat of typechecking, the build, and the full suite in this stage. Their required Implementation results must remain applicable.

Run additional checks when needed to establish an uncovered review obligation, subject to applicable permissions. Do not claim compliance from an unexecuted check.

Missing mandatory upstream evidence invalidates the relevant upstream completion. Report it for revision; new review checks do not retroactively complete an earlier stage attempt.

A changed checkpoint alone does not require repeating valid checks. Apply the shared [evidence applicability rules](../../runtime.md#evidence-applicability) to covered material and relevant inputs.

### Findings and correction

A blocking finding prevents establishing an applicable unit obligation or required completion condition. Identify the violated contract or missing evidence; distinguish it from optional advice.

A nonblocking limitation must not conceal an unmet requirement. Describe its actual scope and why it does not prevent the agreed outcome.

The reviewer reports facts and proposed boundaries. The orchestrator decides whether clarification, investigation, or reopening is required under the shared [revision authority](../../revision.md#authority-and-escalation).

| Finding | Proposed boundary for assessment |
| --- | --- |
| The review assessment or its references need correction, with unchanged valid implementation. | Correct within the current review attempt when the stage remains active. |
| The implementation or required Implementation evidence is invalid. | Implementation, followed by a new Unit of Work Review and Deliver. |
| The task graph or technical solution must change. | Implementation Planning and every subsequent unit stage. |
| Functional or quality obligations are invalid. | The earliest affected upstream stage and its downstream cascade. |
| Delivery instructions alone need correction after valid review. | Deliver, while its inputs and the reviewed result remain valid. |

An upstream revision invalidates current downstream completion immediately. Reexecute the affected stages even when some artifact bytes remain unchanged.

Code Generation, Code Validation, and Code Integration are Activities within Implementation. Apply its proposed [post-completion return rule](implementation.md#return-after-completed-implementation) when that unit stage reopens. Reopened Activities require new attempts and evidence. Unaffected Activity records retain their original bindings after applicability assessment; the new unit attempt still requires its own completion assessment.

## Effort

Apply the shared [effort definition](../../effort.md).

| Effort | Unit of Work Review guidance |
| --- | --- |
| Minimal | State coverage, material findings, evidence applicability, and the whole-unit conclusion concisely. |
| Standard | Explain significant interactions, quality concerns, verification gaps, and correction rationale. |
| Comprehensive | Analyze complex failure paths, cross-boundary effects, operational concerns, and evidence limitations in supporting detail. |

Effort does not remove whole-unit coverage, independent assessment, blocking-finding resolution, or applicable requester authority.

## Agent roles

The draft proposes `kepler-reviewer` as the stage owner. It needs functional analysis, code review, quality assessment, and evidence evaluation capabilities.

The proposed reviewer must not be the primary implementation author for the reviewed result. Earlier task review participation does not itself prevent whole-unit review.

Review independence does not require a different model, vendor, or human. The reviewer must assess the actual integrated material and relevant contracts independently.

The orchestrator owns revision decisions and coordination. The requester retains authority over the intended outcome, scope, consequential trade-offs, and applicable acceptance.

These assignments do not implement agent profiles. [CN22](../../authoring_progress.md#completed-construction-decisions) selects an orchestrator-controlled subagent model for Implementation only. It does not select a worker model for Unit of Work Review.

## Supporting skills

The draft proposes [kepler-review](../../skills.md#kepler-review) as the entry skill. It performs whole-unit assessment, self-checks its coverage, records evidence, and prepares the handoff.

Use [kepler-research](../../skills.md#kepler-research) for uncertain facts and [kepler-grilling](../../skills.md#kepler-grilling) for requester-owned questions. These supporting procedures do not authorize revisions.

Apply the [common skill rules](../../skills.md#common-rules). Current skill implementations and legacy review artifacts do not automatically apply.

## Review and approval

These additional review and approval rules are proposals.

### Self-review

Self-review belongs in `kepler-review`. Check that the assessment covers the complete unit, uses applicable evidence, addresses blocking findings, and identifies the correct result.

Self-review checks the review's completeness. It does not replace the proposed independent whole-unit assessment or required task-level feedback.

### Additional review

The draft proposes additional external review only when the requester asks for it. The Unit of Work Review stage itself remains required.

### Requester acceptance

Resolve requester-owned consequential choices before completion. The draft proposes separate whole-unit acceptance only when an applicable authority rule or requester instruction requires it.

When acceptance is required, present the actual integrated result, assessment, material limitations, and decisions covered. Record explicit acceptance against the current review attempt and reviewed material through CLI-owned operations.

A positive review, successful checks, or a repository commit does not grant requester acceptance. Review completion does not authorize delivery side effects.

### Reopening questionnaire

1. Does a finding invalidate the whole-unit conclusion, review coverage, or assessment of a required obligation?
2. Does the reviewed material or a relevant input differ from what the review evidence covers?
3. Does a blocking finding remain unresolved or lack an authorized correction decision?
4. Does evidence fail to establish required upstream completion or an applicable unit acceptance condition?
5. Does an applicable requester acceptance no longer cover the current reviewed material or consequential decision?

Report answers and the proposed earliest boundary to the orchestrator under the shared [revision procedure](../../revision.md#revision-procedure).

Answers do not authorize reopening or exempt this stage from an upstream cascade. Satisfy the stage conditions again after authorized reopening, including any applicable acceptance.

## Completion conditions

The draft proposes completion when:

- The current integrated result and relevant upstream contracts are identified and consistent.
- The complete unit outcome has been reviewed against applicable functional, quality, compatibility, and known deployment obligations.
- Required execution evidence is available, applicable, retained, and sufficient for the obligations it claims to cover.
- Missing proof has been resolved through appropriate checks or authorized upstream revision, not by waiving required evidence.
- No blocking finding or unresolved requester-owned consequential choice remains.
- Nonblocking limitations have explicit scope and rationale consistent with current obligations.
- The proposed independent assessment, self-review, and any requested additional review are complete.
- Any applicable requester acceptance is recorded against the actual reviewed material.
- The handoff identifies the reviewed checkpoint, obligations, evidence, findings, and delivery constraints.

Publication, release, deployment, and completed delivery operations are not review completion requirements.

### Evidence coverage

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Implementation evidence assessment | Final integrated material, upstream contracts, required Activity records, conditions, and integration provenance. | Required earlier evidence is present, applicable, and retained. Claimed coverage and any gaps are explicit. |
| Whole-unit review result | Complete integrated outcome against unit scope, functional design, quality requirements, plan, and known delivery constraints. | Independent assessment establishes the required outcome. Blocking findings are resolved; self-review confirms coverage and handoff accuracy. |
| Additional check result | Material, obligation, and conditions that require additional verification during review. | The identified check succeeds and supplies the missing review proof without replacing mandatory upstream records. |
| Requested additional review result | Material and scope identified in an additional review request. | The requested review is complete and its blocking findings are resolved. |
| Applicable requester acceptance record | Integrated result, assessment, material limitations, and decisions covered by required acceptance. | The requester explicitly accepts the identified material for the current review attempt. |

Additional check and review rows apply only when their stated conditions occur. These conditions do not make required unit coverage optional.

Bind this stage's new assessment to its unit-scoped attempt, material, relevant inputs, result, and supporting output. Preserve originating bindings when referencing earlier evidence.

Apply the shared [evidence and approval rules](../../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Create the output checkpoint before recording any required requester acceptance.

Exact event types, record formats, commands, and derived report layouts remain implementation work. No new execution-state authority or mandatory report filename is proposed.

## Handoff

**Standard workflow next stage:** [Deliver](deliver.md).

Supply the reviewed integrated checkpoint, current upstream artifacts, review result, evidence references, and any applicable requester acceptance.

Include known delivery constraints, remaining nonblocking limitations, planned prerequisites, and operations that need existing permissions or requester decisions.

Deliver must establish its own requested outcome and operation authority. A successful review does not imply permission to push, merge, publish, release, or deploy.
