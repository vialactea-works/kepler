# Task stage: Task Integration

[Implementation Execution](implementation-execution.md) | [Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

The requester requires a dedicated contract for this task-scoped stage. The integration lock, check duties, acceptance boundary, attempt rules, and return paths remain agreed. Role assignments and additional details about completion, evidence, and handoffs remain proposed.

Saving this draft does not accept its proposals or authorize an executing task.

## Goal

Integrate one validated task output into the unit's current state and establish successful task completion.

Accept only the combined candidate covered by successful required checks. Task acceptance does not establish requester approval, whole-unit review, or delivery authority.

## Inputs

- The current task identity, definition, required outputs, and relevant upstream contracts.
- The validated task output checkpoint and applicable Generation and Validation completion evidence.
- The task's recorded admission baseline and relevant input bindings.
- Access to the owning unit's integrated state and relevant integration history.
- Project check configuration, execution conditions, and required resource or permission information.
- The enclosing Execution scope, the task's Integration attempt, and retained work or findings when correcting or resuming.

Preserve each earlier result's originating material and attempt bindings. Read the current integrated checkpoint after acquiring the unit lock, not from an earlier unlocked observation.

## Entry conditions

The draft proposes starting when:

- Applicable Code Validation completion and its task output are available and valid for the current task contract.
- The unit integration target, task output, recorded admission baseline, and relevant evidence are identified.
- Applicable execution authority and prerequisites for the affected integration work or checks are available.

Waiting for the unit lock remains within the task's Integration attempt. Do not use lock availability as a task admission gate.

A pre-existing application is not required. Earlier task stages can establish the initial implementation and verification infrastructure.

## Scope

### Included

- Prepare the combined candidate from the current unit checkpoint and validated task output under the unit lock.
- Run required combined-candidate checks while holding that lock.
- Accept the checked candidate and record integration provenance through authorized CLI operations.
- Self-check evidence bindings, candidate acceptance, and task completion.
- Report findings and proposed correction boundaries to the orchestrator.

### Excluded

- Changing the fixed admission baseline to match a later integration checkpoint.
- Accepting failed, incomplete, unchecked, or materially different candidates.
- Replacing Code Validation or changing implementation inside an integration-only retry.
- Reopening upstream stages without orchestrator authorization.
- Requiring global Git `HEAD` agreement or stopping unrelated ready tasks and units.
- Declaring whole-unit completion, requester approval, publication, or deployment merely because one task integrates.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Checked combined candidate | Identify the current unit checkpoint, validated task output, and resulting candidate covered by required checks. |
| Accepted unit checkpoint | Identify the material accepted as the unit's integrated state. |
| Integration evidence | Record check results, inputs, candidate identity, acceptance, and task completion through CLI-owned operations. |
| Optional supporting detail | Explain useful integration findings under `details/task-integration/`, with relevant references and task scope. |

The draft proposes no required Integration Markdown document. Do not duplicate task definitions or store execution state in authored files.

Optional supporting Markdown uses the shared [metadata contract](../metadata.md) and `supporting-document` type. Check logs and generated views follow their own contracts.

## Integration procedure

Task Integration follows successful Task coding. Use the agreed [prepare, check, and accept procedure](README.md#integration-order-and-locking).

Acquire the unit integration lock before reading the current integrated checkpoint and preparing the combined candidate. Keep the task admission baseline unchanged; record current integration inputs separately.

Run typechecking, the project build, and the full application test suite against the combined candidate while holding the lock. Accept only the checked candidate after all required checks succeed.

Record the candidate, integration inputs, required results, and accepted checkpoint through CLI-owned operations. Verify that the accepted material matches the checked candidate.

Release the lock when the operation ends, including before returning to coding. Other permitted coding, validation, and unit work can continue.

All changes to the unit's integrated state respect its lock. The lock covers candidate preparation, required checks, and acceptance. It does not serialize Generation, Validation, task admission, or integrations for other units.

A failed or interrupted required check prevents acceptance. An integration-only retry must check its actual combined candidate before acceptance. Prior Validation checks do not establish combined correctness.

A build proves typechecking only when it performs that check. Additional applicable obligations remain binding; project check configuration remains implementation work.

## Attempts, failures, and recovery

Use the task-scoped Integration attempt within the enclosing Execution attempt. Lock ownership does not add an attempt identity or run floor.

Integration-only retries, failed commands, pauses, and resumes retain the current attempt under the shared [attempt rules](../runtime.md#stage-attempts).

If task output needs changes, report the finding for an authorized return to coding. Do not hide implementation changes inside an integration-only retry.

The orchestrator authorizes the return to Generation and following task stages under the shared [revision rules](../revision.md#authority-and-escalation). A task-local return does not itself restart the enclosing Execution attempt.

Apply Execution's [unit-wide shutdown and scoped-return rules](implementation-execution.md#attempts-failures-and-recovery). Ended attempts cannot accept candidates or complete tasks. Reopened stages require their own current-attempt evidence.

During interruption recovery, compare actual material and evidence with CLI progress. Preserve unfinished work and confirm earlier workers stopped before resuming an unended attempt.

Physical lock implementation, ownership records, and interrupted-lock recovery remain implementation work. Do not infer that a new session can take over an uncertain lock.

## Depth

Apply the shared [depth definition](../depth.md), including the unit default and any explicit override for this stage.

| Depth | Integration guidance |
| --- | --- |
| Minimal | Identify integration inputs, candidate, required results, acceptance, and task-completion references concisely. |
| Standard | Explain significant combination issues, check conditions, corrections, and acceptance evidence. |
| Comprehensive | Explain complex interactions, difficult integration failures, and verification limitations in linked supporting detail. |

Depth does not remove the lock, required checks, evidence, candidate matching, or task completion conditions.

## Agent roles

The assignment below remains proposed.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Task Integration owner | `kepler-orchestrator` | Ensure locked candidate preparation, checks, acceptance, evidence, and integration return handling. |

Scoped workers report findings and evidence. The orchestrator and authorized CLI operations control acceptance, completion, and revision decisions.

This task-scoped role is distinct from coordinating the complete unit. Sharing an agent profile does not combine their stage attempts.

## Supporting skills

[kepler-orchestrate](../skills.md#kepler-orchestrate) is the proposed entry skill. Its Integration procedure prepares, checks, accepts, self-reviews, and reports one task result.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Apply the [common skill rules](../skills.md#common-rules).

These responsibilities do not adopt existing skill implementations or settle inline, subagent, or swarm working discipline.

## Review and approval

### Self-review

Self-check input bindings, check coverage, acceptance, and retained evidence. Complete task implementation only after successful candidate acceptance and the task's other completion conditions.

Self-review belongs in the task-scoped `kepler-orchestrate` procedure. It adds no self-review stage or attempt identity.

### Additional review

Apply Execution's [additional-review rule](implementation-execution.md#additional-review). Requested additional review does not replace required checks, Code Validation, or whole-unit review.

### Requester intervention

Apply Execution's [requester-intervention rule](implementation-execution.md#requester-intervention). Ordinary integration failures follow agent-led correction paths. Requester decisions are needed only for hard blockers beyond agent authority.

Task acceptance through successful Validation and Integration requires no routine requester task approval. It grants no publication or deployment permission.

### Reopening questionnaire

1. Does the candidate combine the wrong inputs or omit required task output?
2. Do required checks fail, remain incomplete, or cover material other than the accepted candidate?
3. Does a correction require task implementation changes rather than an integration-only retry?

Report answers and the proposed boundary to the orchestrator under the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers do not authorize reopening.

## Completion conditions

The stage completes only after successful candidate acceptance and satisfaction of the task's other completion conditions.

The draft additionally requires:

- Applicable Generation and Validation evidence remains valid for the task output and relevant inputs.
- Required typechecking, build, and full-suite results cover the actual combined candidate under the unit lock.
- The accepted material matches the successful candidate, with actual integration inputs recorded separately from the admission baseline.
- Integration self-review and any requested additional review are complete, with no blocking findings unresolved.
- Current-attempt evidence identifies the task, candidate, inputs, conditions, required results, and acceptance.
- The handoff identifies the accepted unit checkpoint and established task completion.

Task completion permits dependent admission under the graph and admission rules. It does not establish completion of other tasks or the enclosing Execution stage.

### Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Integration check result | Combined candidate, current unit checkpoint, task output, and relevant conditions. | Typechecking, the project build, and the full application test suite succeed against the candidate under the unit lock. |
| Integration acceptance result | Checked candidate, accepted unit checkpoint, integration inputs, and required check records. | The accepted material matches the successful candidate. Integration self-review confirms bindings and task completion conditions. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row applies only when the requester asks for that review. It is not routine requester task approval.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Keep earlier task-stage records under their original bindings; new Integration evidence uses its applicable attempt.

Retain the checked candidate, accepted checkpoint, actual inputs, check output, and required provenance. A commit identifier alone does not establish successful checks or retain the referenced material.

## Handoff

**Return to:** [Implementation Execution coordination](implementation-execution.md#admission-and-coordination).

Supply the task identity, accepted unit checkpoint, integration inputs, originating Generation and Validation evidence, and new Integration evidence.

The unit coordinator can assess dependent readiness and continue the graph. Whole-unit review follows only after Execution completes its own integrated-result assessment.
