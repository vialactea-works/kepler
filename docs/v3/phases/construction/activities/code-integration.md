# Code Integration Activity

[Shared Activity rules](README.md) | [Implementation](../implementation.md)

**Status:** Accepted by the requester under [IE27](../../../authoring_progress.md#completed-implementation-decisions). The unit lock, check duties, acceptance boundary, attempts, and return paths remain binding.

## Goal and inputs

Integrate one validated task output into the unit's current state and supply evidence for task completion.

Use the [shared assignment](README.md#shared-execution-rules), validated output, valid Generation and Validation evidence, and fixed admission baseline. Identify the unit integration target, relevant history, project checks, conditions, and required permissions or resources.

Satisfy applicable prerequisites before affected integration work and checks. Waiting for the lock remains within the current Activity attempt. Lock availability must not control task admission.

Earlier Activities can establish initial application and verification infrastructure. A pre-existing application is not required.

## Integration procedure

1. **Acquire the lock.** Use the owning unit's integration lock before reading its current integrated checkpoint.
2. **Prepare the candidate.** Read the current unit checkpoint after acquiring the lock. Combine it with validated task output. Record actual Integration inputs separately from the fixed admission baseline.
3. **Check the candidate.** Run typechecking, the project build, and the full application test suite against the combined candidate. All three must succeed. Bind results to that candidate, actual inputs, and relevant conditions.
4. **Accept the checked candidate.** Use authorized orchestrator and CLI operations to accept only the bytes covered by successful checks. If bytes change, check the changed candidate before acceptance. Failed or incomplete required checks prevent acceptance.
5. **Release the lock.** Release it when the operation ends, including before a return to Generation.

Hold the lock through reading current state, preparation, checks, and acceptance. All changes to that unit's integrated state must respect this lock. Same-unit Integration checks are serialized; other permitted task Activities and units continue.

A build proves typechecking only when it performs that check. Additional project obligations remain binding. Check configuration, physical lock implementation, ownership records, and interrupted-lock recovery remain implementation work.

Keep the admission baseline fixed despite later integrations. Do not add global `HEAD`, shared admission-commit, clean-workspace, or completed-batch gates.

Report required implementation changes to the orchestrator. After an authorized return, repeat Generation, Validation, and Integration as required. Integration-only retries retain their attempt and must not hide implementation changes. A new session cannot take over an uncertain lock.

## Roles and skills

`kepler-orchestrator` is the accepted Activity owner; [kepler-orchestrate](../../../skills.md#kepler-orchestrate) is the accepted entry skill. It prepares and checks the candidate, reports evidence, and supports authorized acceptance and return handling.

Workers report facts; authorized orchestrator and CLI operations control acceptance, completion, and revision. Sharing a profile with unit coordination does not combine their attempts. These role and skill contracts do not implement or adopt agent profiles or current skills.

## Review and approval

Apply the [shared review and recovery rules](README.md#review-correction-and-recovery). The entry skill self-checks actual inputs, check coverage, acceptance, task completion conditions, and retained evidence.

Additional review does not replace checks, Code Validation, or whole-unit review. Candidate acceptance grants no requester approval, publication, or deployment permission.

### Reopening questionnaire

1. Does the candidate combine the wrong inputs or omit required task output?
2. Do required checks fail, remain incomplete, or cover material other than the accepted candidate?
3. Does a correction require task implementation changes rather than an Integration-only retry?

Report answers, evidence, uncertainty, and the proposed boundary to the orchestrator. Answers do not authorize a return or stage revision.

## Completion conditions

Complete Integration only after authorized acceptance of the checked candidate and satisfaction of the task's other completion conditions.

Require valid originating Generation and Validation evidence, current-attempt Integration proof, completed self-review, and resolved blocking findings. Complete any requested additional review. Identify accepted material, actual inputs, conditions, results, and task completion in the handoff.

The accepted bytes must match the checked candidate. Keep actual Integration inputs separate from the admission baseline. Preserve the checked candidate, accepted checkpoint, logs, provenance, and external evidence under the [shared retention rules](README.md#records-and-supporting-detail).

Dependent tasks become eligible only after successful predecessor Integration and satisfaction of their admission conditions. Integration does not complete Implementation or whole-unit review.

## Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Integration check result | Combined candidate, current unit checkpoint, task output, and relevant conditions. | Typechecking, the project build, and the full application test suite succeed against the candidate under the unit lock. |
| Integration acceptance result | Checked candidate, accepted unit checkpoint, actual Integration inputs, and required check records. | The accepted material matches the successful candidate. Integration self-review confirms bindings and task completion conditions. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row is conditional on requester instruction. Preserve [original evidence bindings](README.md#records-and-supporting-detail); earlier evidence does not transfer to a new attempt. A commit identifier alone does not prove successful checks or retain material.

## Handoff

**Return to:** [Implementation coordination](../implementation.md#admission-and-coordination).

Supply task identity, accepted checkpoint, actual Integration inputs, and originating Generation, Validation, and Integration evidence. Identify established task completion and any nonblocking limitations.

The unit coordinator assesses dependent readiness and continues the graph. Unit of Work Review follows only after Implementation completes its own assessment.
