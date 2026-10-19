# Code Validation Activity

[Shared Activity rules](README.md) | [Implementation](../implementation.md)

**Status:** Accepted by the requester under [IE25](../../../authoring_progress.md#completed-implementation-decisions). Independent non-author feedback and check duties are still binding.

## Goal and inputs

Examine the generated task output and state whether it satisfies its contract and is ready for Code Integration.

Use the [shared assignment](README.md#shared-execution-rules), fixed baseline, actual output checkpoint, and valid Generation completion and evidence. Include project check configuration, relevant execution conditions, and permission or resource constraints. The reviewer can use the [Code Validation package](../../../diff-package.md#code-validation) when reviewing the baseline, task output, and original contribution history. It does not replace review of actual material or become a check result or completion condition.

The reviewer must examine actual material and relevant contracts, not only the author's summary. Satisfy applicable prerequisites before checks or review. The reviewer must not have authored the candidate.

Successful Integration, whole-unit review, and requester task approval are not entry requirements.

## Validation procedure

1. Examine task output against its baseline, task contract, functional obligations, quality requirements, and relevant upstream inputs.
2. Run typechecking, the project build, and the full application test suite against that material. Record actual commands, coverage, conditions, and results.
3. Obtain independent code feedback in a context separate from Generation. The reviewer must not author or edit the implementation.
4. Examine correctness, failure behavior, whether the tests provide sufficient coverage, applicable quality obligations, and unintended effects. State the findings.
5. Report blocking findings, missing proof, uncertainty, and proposed correction boundaries. Do a self-check of assessment coverage and evidence before handing off results.

A build proves typechecking only when it does that check. Project-required checks remain applicable. Review opinion cannot replace successful check execution.

A blocking finding identifies a violated obligation, failed required check, or missing proof. A preference alone does not redefine the task. Correct assessment errors within the current attempt when material and inputs remain valid.

The orchestrator authorizes implementation returns to Generation and required following Activities. The reviewer does not authorize returns or fix the implementation during Validation.

## Roles and skills

`kepler-reviewer` is the accepted Activity owner. [kepler-code-feedback](../../../skills.md#kepler-code-feedback) is the accepted entry skill. It supplies checks, independent feedback, assessment self-review, evidence reporting, and the Integration handoff.

Another model, vendor, or human is not necessary for independent feedback. These role and skill contracts do not put agent profiles or current skill implementations into effect or adopt them.

## Review and approval

Apply the [shared review and recovery rules](README.md#review-correction-and-recovery). Required independent assessment belongs to Validation. It is not optional additional review. Self-review checks the assessment without replacing independent implementation review.

### Reopening questionnaire

1. Does a finding invalidate required check results, independent feedback, or the validation assessment?
2. Does reviewed material or a relevant input differ from the material covered by Validation evidence?
3. Are Generation changes or an earlier upstream revision necessary to resolve the finding?

Report answers, evidence, uncertainty, and the proposed boundary to the orchestrator. Answers do not authorize a return or stage revision.

## Completion conditions

Complete Validation only when required checks succeed, independent feedback is complete, and no blocking findings are open. Missing or interrupted checks are not successful results.

Assessment coverage must pass a self-check, and current-attempt evidence must cover actual material, conditions, and relevant inputs. Coverage includes the task contract, upstream obligations, and fixed baseline.

Validation completion makes Integration eligible to start. It does not accept the combined candidate, complete the task or stage, or authorize delivery.

## Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Validation check result | Task output checkpoint, project check configuration, and relevant execution conditions. | Typechecking, the project build, and the full application test suite succeed. |
| Independent code feedback result | Actual task output against its baseline, task contract, functional design, and applicable quality requirements. | Independent feedback is complete. No blocking findings remain, and the validation assessment has passed a self-check. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row is conditional on requester instruction. Independent feedback is mandatory. Keep [original evidence bindings](README.md#records-and-supporting-detail). Validation evidence does not prove combined-candidate checks or whole-unit review.

## Handoff

**Next Activity:** [Code Integration](code-integration.md).

Supply unit and task identities, current definition, fixed baseline, reviewed output checkpoint, and originating Generation and Validation evidence. Include check commands, conditions, independent findings, resolved blocking concerns, and nonblocking limitations.

The orchestrator coordinates the handoff with each result's original material and attempt bindings. If the package helped with the review, keep its original source bindings. Keep these separate from the result, which belongs to the current Validation attempt.
