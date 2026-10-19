# Code Generation Activity

[Shared Activity rules](README.md) | [Implementation](../implementation.md)

**Status:** Accepted by the requester under [IE24](../../../authoring_progress.md#completed-implementation-decisions). Existing check duties and shared execution rules are still binding.

## Goal and inputs

Do the work for one bounded task outcome and give material that passed the required checks for independent Code Validation.

Use the [shared assignment](README.md#shared-execution-rules), current task contract, relevant upstream documents, project standards, and retained work. The orchestrator must admit the task or authorize its return. Satisfy prerequisites before their affected work.

Existing application code, tests, and passing checks are not entry requirements. Set up planned infrastructure before it is necessary for dependent work or verification. Keep the admitted baseline and valid prior work.

## Generation procedure

1. Do the task's code, test, configuration, and required documentation work using the selected solution and suitable project patterns.
2. Do tests of changed public behavior, including relevant failures and boundaries. Use the lowest test level that proves the behavior.
3. Do tests of real collaborations and critical complete workflows when isolated tests cannot show correctness.
4. Run typechecking and modification-related tests. Set up planned infrastructure that is missing. Do not invent successful results or waive required checks.
5. Self-review the implementation, task acceptance conditions, and upstream obligations. Correct local defects within the current Generation attempt.
6. Prepare the output under the shared [checkpoint procedure](../../../runtime.md#repository-checkpoint-procedure). Final evidence must cover that checkpoint, not an earlier working copy.

Do not change upstream requirements, task definitions, or selected planning decisions without applicable revision authority. Author self-review does not replace independent Code Validation or complete task integration.

## Roles and skills

`kepler-coder` is the accepted Activity owner. [kepler-code](../../../skills.md#kepler-code) is the accepted entry skill. The entry skill owns implementation, checks, self-review, evidence reporting, and the Validation handoff.

Use a context separate from the Validation worker. The orchestrator coordinates handoffs and revision decisions. These role and skill contracts state responsibilities. They do not set agent profiles or adopt current skill implementations.

## Review and approval

Apply the [shared review and recovery rules](README.md#review-correction-and-recovery). Self-review belongs in the entry skill. Additional review does not replace required Validation.

### Reopening questionnaire

1. Is a correction necessary for the task implementation, its tests, or required documentation?
2. Does a finding invalidate the generated outputs or their required check coverage?
3. Does a suspected upstream problem exceed the current task contract or authorized implementation choices?

Report answers, evidence, uncertainty, and the proposed boundary to the orchestrator. Answers do not authorize a return or stage revision.

## Completion conditions

Complete Generation when required outputs, typechecking, modification-related tests, and self-review succeed.

Current-attempt evidence must cover actual material, relevant inputs, and conditions. Outputs must satisfy the task without unauthorized upstream changes, and no blocking Generation finding may remain.

Generation completion makes the task eligible for Validation. It does not complete the task, enclosing stage, or Unit of Work.

## Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Generation check result | Task output checkpoint, changed behavior, related tests, task contract, and relevant inputs. | Typechecking and modification-related tests succeed against the identified material. |
| Generation self-review result | Task implementation, tests, required documentation, and acceptance conditions. | Required outputs are supplied. No blocking Generation findings remain. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row is conditional on requester instruction. Keep [evidence bindings and retention](README.md#records-and-supporting-detail). A commit alone does not show that checks passed or approval exists.

## Handoff

**Next Activity:** [Code Validation](code-validation.md).

Supply unit and task identities, current definition, fixed baseline, Generation attempt, and output checkpoint. Include upstream contracts, changed scope, check results, self-review evidence, execution conditions, and nonblocking limitations.

The orchestrator passes the material and original evidence bindings to the separate Validation worker context. For optional inspection, use the [Code Validation package](../../../diff-package.md#code-validation) with this Generation attempt, fixed baseline, and output checkpoint. Package generation is not a Generation completion gate and does not make an unstarted Validation attempt necessary.
