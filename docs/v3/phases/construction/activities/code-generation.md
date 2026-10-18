# Code Generation Activity

[Shared Activity rules](README.md) | [Implementation Execution](../implementation-execution.md)

**Status:** Draft for discussion. Existing check duties and shared execution rules remain binding; detailed assignments and completion evidence remain proposed.

## Goal and inputs

Implement one task's bounded outcome and supply checked material for independent Code Validation.

Use the [shared assignment](README.md#shared-execution-rules), current task contract, relevant upstream documents, project standards, and retained work. The orchestrator must admit the task or authorize its return. Satisfy prerequisites before their affected work.

Existing application code, tests, and passing checks are not entry requirements. Establish planned infrastructure before dependent work or verification needs it. Keep the admitted baseline and valid retained work.

## Generation procedure

1. Implement the task's code, tests, configuration, and required documentation using the selected solution and suitable project patterns.
2. Test changed public behavior, including relevant failures and boundaries. Use the lowest test level that proves the behavior.
3. Test real collaborations and critical complete workflows when isolated tests cannot establish correctness.
4. Run typechecking and modification-related tests. Establish planned missing infrastructure; do not invent successful results or waive required checks.
5. Self-review the implementation, task acceptance conditions, and upstream obligations. Correct local defects within the current Generation attempt.
6. Prepare the output under the shared [checkpoint procedure](../../../runtime.md#repository-checkpoint-procedure). Final evidence must cover that checkpoint, not an earlier working copy.

Do not change upstream requirements, task definitions, or selected planning decisions without applicable revision authority. Author self-review does not replace independent Code Validation or establish task integration.

## Roles and skills

The proposed owner is `kepler-coder`; the proposed entry skill is [kepler-code](../../../skills.md#kepler-code). The entry skill owns implementation, checks, self-review, evidence reporting, and the Validation handoff.

Use a context separate from the Validation worker. The orchestrator coordinates handoffs and revision decisions. These proposals do not implement profiles or current skills.

## Review and approval

Apply the [shared review and recovery rules](README.md#review-correction-and-recovery). Self-review belongs in the entry skill. Additional review does not replace required Validation.

### Reopening questionnaire

1. Does the task implementation, its tests, or required documentation need correction?
2. Does a finding invalidate the generated outputs or their required check coverage?
3. Does a suspected upstream problem exceed the current task contract or authorized implementation choices?

Report answers, evidence, uncertainty, and the proposed boundary to the orchestrator. Answers do not authorize a return or stage revision.

## Completion conditions

Complete Generation when required outputs, typechecking, modification-related tests, and self-review succeed.

The draft also requires current-attempt evidence for actual material, relevant inputs, and conditions. Outputs must satisfy the task without unauthorized upstream changes, and no blocking Generation finding may remain.

Generation completion makes the task eligible for Validation. It does not complete the task, enclosing stage, or Unit of Work.

## Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Generation check result | Task output checkpoint, changed behavior, related tests, task contract, and relevant inputs. | Typechecking and modification-related tests succeed against the identified material. |
| Generation self-review result | Task implementation, tests, required documentation, and acceptance conditions. | Required outputs are supplied; no blocking Generation findings remain. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row is conditional on requester instruction. Preserve [evidence bindings and retention](README.md#records-and-supporting-detail); a commit alone does not establish successful checks or approval.

## Handoff

**Next Activity:** [Code Validation](code-validation.md).

Supply unit and task identities, current definition, fixed baseline, Generation attempt, and output checkpoint. Include upstream contracts, changed scope, check results, self-review evidence, execution conditions, and nonblocking limitations.

The orchestrator passes the material and original evidence bindings to the separate Validation worker context.
