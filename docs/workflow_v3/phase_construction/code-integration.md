# Activity: Code Integration

[Implementation Execution](implementation-execution.md) | [Activity](../activity.md) | [Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

This document defines the Code Integration Activity contract within Implementation Execution. The unit lock, check duties, acceptance boundary, attempt rules, and return paths are agreed. Role assignments and details about completion, evidence, and handoffs remain proposed.

Saving this draft does not accept its proposals or authorize an executing task.

## Goal

Integrate one validated task output into the unit's current state and supply evidence for task completion.

Accept only the combined candidate covered by successful required checks. Task acceptance does not establish requester approval, Implementation Execution completion, whole-unit review, or delivery authority.

## Inputs

- The current task identity, definition, required outputs, and relevant upstream contracts.
- The validated task output checkpoint and applicable Code Generation and Code Validation evidence.
- The task's fixed admission baseline and relevant input bindings.
- Access to the owning unit's integrated state and relevant integration history.
- Project check configuration, execution conditions, and required resource or permission information.
- The enclosing Execution attempt, the Code Integration occurrence and attempt, and retained work or findings when correcting or resuming.

Preserve each earlier result's originating material and attempt bindings. Read the current integrated checkpoint only after acquiring the unit lock.

## Entry conditions

Start Code Integration when:

- Applicable Code Validation completion and its task output are available and valid for the current task contract.
- The unit integration target, task output, fixed admission baseline, and relevant evidence are identified.
- Applicable execution authority and prerequisites for the integration work and checks are available.

Waiting for the unit lock remains within the Code Integration attempt. Lock availability does not control task admission.

A pre-existing application is not required. Earlier task Activities can establish the initial implementation and verification infrastructure.

## Scope

### Included

- Prepare the combined candidate from the current unit checkpoint and validated task output under the unit lock.
- Run required combined-candidate checks while holding that lock.
- Present the checked candidate for authorized acceptance and record integration provenance through CLI-owned operations.
- Self-check evidence bindings, candidate acceptance, and task completion conditions.
- Report findings and proposed correction boundaries to the orchestrator.

### Excluded

- Changing the fixed admission baseline to match a later integration checkpoint.
- Accepting failed, incomplete, unchecked, or materially different candidates.
- Replacing Code Validation or changing implementation during an integration-only retry.
- Reopening upstream work without orchestrator authorization.
- Requiring global Git `HEAD` agreement or stopping unrelated ready tasks and units.
- Declaring Implementation Execution completion, requester approval, publication, or deployment because one task integrates.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Checked combined candidate | Identify the current unit checkpoint, validated task output, and candidate covered by required checks. |
| Accepted unit checkpoint | Identify the material accepted as the unit's integrated state. |
| Code Integration evidence | Record check results, actual inputs, candidate identity, acceptance, and task-completion facts through CLI-owned operations. |
| Optional supporting detail | Explain useful integration findings under `details/code-integration/`, with relevant references and task scope. |

The draft proposes no required Integration Markdown document. Do not duplicate task definitions or store execution state in authored files.

Optional supporting Markdown uses the shared [metadata contract](../metadata.md) and `supporting-document` type. Check logs and generated views follow their own contracts.

## Integration procedure

Code Integration follows successful Code Validation. Use the agreed [prepare, check, and accept procedure](README.md#integration-order-and-locking).

1. **Acquire the lock.** Wait for the unit integration lock. Do not read the current integrated checkpoint before acquiring it. Waiting does not create another Activity attempt.
2. **Prepare the candidate.** Read the current integrated checkpoint after acquiring the lock. Combine it with the validated task output. Record these actual Integration inputs separately from the task's fixed admission baseline.
3. **Check the candidate.** Run typechecking, the project build, and the full application test suite against the combined candidate. All three must succeed. Bind results to the candidate, actual inputs, and relevant conditions.
4. **Accept the checked candidate.** Use authorized orchestrator and CLI operations to accept only the bytes covered by successful checks. If the candidate changes, check the changed candidate before acceptance. Do not accept failed or incomplete results.
5. **Release the lock.** Release it when the Integration operation ends, including before a return to Code Generation.

Hold the lock through reading the current checkpoint, preparation, checks, and acceptance. All changes to that unit's integrated state must respect the lock. Integration checks for the same unit are serialized; other task Activities and independent units retain their permitted parallelism.

Do not require global `HEAD` agreement, a shared admission commit, unrelated clean workspaces, or completed task batches. A later integration checkpoint does not change an admitted task's baseline.

A build proves typechecking only when it performs that check. Additional applicable project obligations remain binding. Project-specific check configuration remains MVP implementation work.

Successful Code Integration supplies an accepted checkpoint and evidence to unit coordination. The orchestrator can record task completion and release dependent tasks only when the predecessor's Code Integration and task contract succeed. Code Integration does not complete the enclosing Implementation Execution stage.

## Attempts, failures, and recovery

Use the Code Integration Activity attempt within the enclosing Implementation Execution attempt. Lock ownership adds no attempt identity or run floor.

Integration-only retries, failed commands, pauses, and resumes retain the current Code Integration attempt under the shared [attempt rules](../runtime.md#activity-attempts).

If task output needs changes, report the finding for an authorized return to Code Generation. Correct the code in Code Generation, then repeat Code Validation and Code Integration as required. Do not hide implementation changes inside an Integration-only retry.

The orchestrator authorizes returns under the shared [revision rules](../revision.md#authority-and-escalation). Apply Implementation Execution's [unit-wide shutdown and scoped-return rules](implementation-execution.md#attempts-failures-and-recovery). Ended attempts cannot accept candidates or complete tasks. Reopened Activities require their own current-attempt evidence.

During interruption recovery, compare actual material and evidence with CLI progress. Preserve unfinished work and confirm earlier workers stopped before resuming an unended attempt.

Physical lock implementation, ownership records, and interrupted-lock recovery remain implementation work. Do not infer that a new session can take over an uncertain lock.

## Depth

Apply the shared [depth definition](../depth.md). Code Integration inherits the Implementation Execution depth, including any explicit stage override. Do not set an Activity-level depth.

| Depth | Integration guidance |
| --- | --- |
| Minimal | Identify integration inputs, candidate, required results, acceptance, and task-completion references concisely. |
| Standard | Explain significant combination issues, check conditions, corrections, and acceptance evidence. |
| Comprehensive | Explain complex interactions, difficult integration failures, and verification limits in linked supporting detail. |

Depth does not remove the lock, required checks, evidence, candidate matching, or task completion conditions.

## Agent roles

The assignment below remains proposed.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Code Integration owner | `kepler-orchestrator` | Ensure locked candidate preparation, checks, authorized acceptance, evidence, and return handling. |

Workers report findings and evidence. Authorized orchestrator and CLI operations control acceptance, completion, and revision decisions.

The Activity role is distinct from coordinating the complete unit. Sharing an agent profile does not combine their attempts. Role profiles remain proposed.

## Supporting skills

[kepler-orchestrate](../skills.md#kepler-orchestrate) is the proposed entry skill. Its Code Integration procedure prepares, checks, presents, and records one task result.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Apply the [common skill rules](../skills.md#common-rules).

These responsibilities do not adopt existing skill implementations or add a worker-topology selector.

## Review and approval

### Self-review

Self-check input bindings, check coverage, authorized acceptance, and retained evidence. Complete the task only after successful candidate acceptance and satisfaction of the task's other completion conditions.

Self-review belongs in the proposed `kepler-orchestrate` procedure. It adds no Activity or attempt identity.

### Additional review

Apply Implementation Execution's [additional-review rule](implementation-execution.md#additional-review). Requested additional review does not replace required checks, Code Validation, or whole-unit review.

### Requester intervention

Apply Implementation Execution's [requester-intervention rule](implementation-execution.md#requester-intervention). Ordinary integration failures follow agent-led correction paths. Ask the requester only for hard blockers beyond agent authority.

Task acceptance through successful Code Validation and Code Integration requires no routine requester approval. It grants no publication or deployment permission.

### Reopening questionnaire

1. Does the candidate combine the wrong inputs or omit required task output?
2. Do required checks fail, remain incomplete, or cover material other than the accepted candidate?
3. Does a correction require task implementation changes rather than an Integration-only retry?

Report answers and the proposed boundary to the orchestrator under the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers do not authorize a return or stage revision.

## Completion conditions

Complete Code Integration only after authorized acceptance of the checked candidate and satisfaction of the task's other completion conditions.

The draft also requires:

- Applicable Code Generation and Code Validation evidence remains valid for the task output and relevant inputs.
- Required typechecking, build, and full-suite results cover the actual combined candidate under the unit lock.
- The accepted material matches the checked candidate. Record actual Integration inputs separately from the fixed admission baseline.
- Code Integration self-review and any requested additional review are complete, with no blocking findings unresolved.
- Current-attempt evidence identifies the task, candidate, inputs, conditions, required results, and acceptance.
- The handoff identifies the accepted unit checkpoint and established task completion.

Task completion permits dependent admission under the accepted graph and admission rules. It does not complete other tasks or the enclosing Implementation Execution stage.

### Evidence coverage

| Evidence | Material covered | Required result |
| --- | --- | --- |
| Integration check result | Combined candidate, current unit checkpoint, task output, and relevant conditions. | Typechecking, the project build, and the full application test suite succeed against the candidate under the unit lock. |
| Integration acceptance result | Checked candidate, accepted unit checkpoint, actual Integration inputs, and required check records. | The accepted material matches the successful candidate. Integration self-review confirms bindings and task completion conditions. |
| Requested additional review result | Task material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |

The additional-review row applies only when the requester asks for that review. It is not routine requester task approval.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Keep Integration evidence bound to its Activity attempt and material. Keep earlier Activity records under their original bindings; do not transfer them to another attempt.

Retain the checked candidate, accepted checkpoint, actual inputs, check output, and required provenance. A commit identifier alone does not establish successful checks or retain the referenced material.

## Handoff

**Return to:** [Implementation Execution coordination](implementation-execution.md#admission-and-coordination).

Supply the task identity, accepted checkpoint, actual Code Integration inputs, and originating Code Generation and Code Validation evidence. Include new Code Integration evidence.

The unit coordinator assesses dependent readiness and continues the graph. Whole-unit review follows only after Implementation Execution completes its own integrated-result assessment.
