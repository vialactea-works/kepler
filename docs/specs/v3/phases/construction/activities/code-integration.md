# Code Integration Activity

[Shared Activity rules](README.md) | [Implementation](../implementation.md)

**Status:** Accepted by the requester under [IE27](../../../authoring_progress.md#completed-implementation-decisions). The unit lock, check duties, acceptance boundary, attempts, and return paths are still binding.

## Goal and inputs

Integrate one validated task output into the unit's current state and supply evidence for task completion.

Use the [shared assignment](README.md#shared-execution-rules), validated output, valid Generation and Validation evidence, and fixed admission baseline. Identify the unit integration target, relevant history, project checks, conditions, and required permissions or resources.

Satisfy applicable prerequisites before affected integration work and checks. Waiting for the lock does not end the current Activity attempt. Lock availability must not control task admission.

Earlier Activities can set up initial application and verification infrastructure. A pre-existing application is not required.

## Integration procedure

1. **Acquire the lock.** Use the owning unit's integration lock before reading its current repository-qualified checkpoint set.
2. **Prepare the candidate.** Read the current unit checkpoint set after acquiring the lock. Combine it with validated task outputs. Record actual Integration inputs separately from the fixed admission baseline.
3. **Do a check of the candidate.** Run typechecking, the project build, and the full application test suite against the combined candidate set. All three must succeed. Record each necessary repository result. Bind results to the candidate that passed the checks, actual inputs, and relevant conditions.
4. **Accept the candidate that passed the checks.** Use authorized orchestrator and CLI operations to accept only the candidate set covered by successful checks. If material changes in any repository, run the required checks against the changed candidate before acceptance. Failed or incomplete required checks prevent acceptance. Repository commits do not form an atomic cross-repository commit.
5. **Release the lock.** Release it when the operation ends, including before a return to Generation.

Hold the lock through reading current state, preparation, checks, and acceptance across the selected repositories. All changes to that unit's integrated state must respect this lock. Same-unit Integration checks are serialized. Other permitted task Activities and units continue.

For optional inspection, use the [Code Integration package](../../../diff-package.md#code-integration) with the owning operation's recorded checkpoint set and prepared candidate set. Package rendering consumes those recorded bindings. It does not acquire or manage the lock, prepare or accept a candidate, or add an independent review step.

A build proves typechecking only when it does that check. Additional project obligations still apply. Configuration checks, physical lock implementation, ownership records, and interrupted-lock recovery are still implementation work.

Keep the admission baseline fixed despite later integrations. Do not add global `HEAD`, shared admission-commit, clean-workspace, or completed-batch gates.

Report required implementation changes to the orchestrator. After an authorized return, repeat Generation, Validation, and Integration as required. Integration-only retries keep their attempt and must not hide implementation changes. A new session cannot take over an uncertain lock.

## Roles and skills

`kepler-orchestrator` is the accepted Activity owner. [kepler-orchestrate](../../../skills.md#kepler-orchestrate) is the accepted entry skill. It prepares and checks the candidate, reports evidence, and helps the orchestrator handle authorized acceptance and returns.

Workers report facts. Authorized orchestrator and CLI operations control acceptance, completion, and revision. Sharing a profile with unit coordination does not combine their attempts. These role and skill contracts state responsibilities. They do not set agent profiles or adopt current skill implementations.

## Review and approval

Apply the [shared review and recovery rules](README.md#review-correction-and-recovery). The entry skill self-checks actual inputs, check coverage, acceptance, task completion conditions, and retained evidence.

Additional review does not replace checks, Code Validation, or whole-unit review. Candidate acceptance grants no requester approval, publication, or deployment permission.

### Reopening questionnaire

1. Does the candidate combine the wrong inputs or omit required task output?
2. Do required checks fail, stay incomplete, or cover material other than the accepted candidate?
3. Are task implementation changes necessary to correct this rather than an Integration-only retry?

Report answers, evidence, uncertainty, and the proposed boundary to the orchestrator. Answers do not authorize a return or stage revision.

## Completion conditions

Complete Integration only after authorized acceptance of the candidate that passed its checks and all other task conditions hold.

Valid originating Generation and Validation evidence, current-attempt Integration proof, and completed self-review are necessary. Resolve blocking findings. Complete any requested additional review. Identify accepted material, actual inputs, conditions, results, and task completion in the handoff.

Each accepted repository result must match the candidate that passed the checks. Keep actual Integration inputs separate from the admission baseline. Keep the candidate set, accepted checkpoint set, logs, provenance, and external evidence under the [shared retention rules](README.md#records-and-supporting-detail).

Dependent tasks become eligible only after successful predecessor Integration and satisfaction of their admission conditions. Integration does not complete Implementation or whole-unit review.

## Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Integration check result | Combined candidate set, current unit checkpoint set, task outputs, and relevant conditions. | Typechecking, the project build, and the full application test suite succeed against the combined candidate set under the unit lock. Record each necessary repository result. |
| Integration acceptance result | Candidate set that passed the checks, accepted repository results, actual Integration inputs, and required check records. | Each accepted result matches the successful candidate. Integration self-review states that bindings and task completion conditions are valid. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row is conditional on requester instruction. Keep [original evidence bindings](README.md#records-and-supporting-detail). Earlier evidence does not transfer to a new attempt. A commit identifier alone does not show that checks passed or keep the material.

## Handoff

**Return to:** [Implementation coordination](../implementation.md#admission-and-coordination).

Supply task identity, accepted repository-qualified checkpoint set, actual Integration inputs, and originating Generation, Validation, and Integration evidence. Identify established task completion and any nonblocking limitations.

The unit coordinator examines dependent readiness, decides which tasks are ready, and continues the graph. Unit of Work Review follows only after Implementation completes its own assessment.
