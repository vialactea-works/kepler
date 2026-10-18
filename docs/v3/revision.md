# Revision

[Workflow phase index](README.md)

## Purpose

Define the shared revision rules for the stages of one Unit of Work. These rules apply across stages, not only to Functional Design.

Use the selected workflow's stage order and each owning phase's execution scopes. The [Standard workflow](workflows/standard/README.md#stages) selects the Construction MVP sequence. Construction defines its [task execution structure](phases/construction/README.md#implementation-execution).

Apply execution-state changes through the `kepler` CLI. Record reopening, attempts, completion, and approval facts in phase-owned JSON event journals under the shared [execution-state representation](runtime.md#execution-state-representation). Current execution state is derived from those events, not artifact frontmatter or Markdown status fields.

## Rules

### Authority and escalation

The orchestrator agent decides whether to start a revision cascade. It selects the starting stage and execution scope under the phase contract.

A stage or Activity worker reports the finding, supporting evidence, uncertainty, and proposed boundary. It must not authorize reopening or start a cascade on its own.

The orchestrator can clarify an existing decision, request investigation, or authorize reopening. Record its decision and reason through the shared [CLI infrastructure](runtime.md#revision-decisions).

#### Safeguards

- **Preserve product authority.** A clarification must explain an existing decision. It must not silently change approved behavior or scope. The requester retains authority over product behavior, scope, and material trade-offs. Changes to those decisions require requester approval.
- **Resolve confirmed invalidity.** Check whether the reported problem is real and which stage it affects. A confirmed invalid upstream contract requires revision. Cost alone does not justify continuing under that contract. Once reopening is authorized, apply the full cascade from the selected boundary.
- **Address evidence and disagreement.** A decision to continue must explain why the reported concern is resolved. The stage can report that the explanation did not resolve it. Use further investigation or a requester decision to resolve continued disagreement. Do not replace resolution with repeated instructions to continue.
- **Keep local corrections independent.** Stage agents can perform internal correction loops without orchestrator approval. Escalate suspected upstream problems, unresolved authority questions, and proposed reopening.

### Editorial corrections

An agent may correct editorial errors in prose without reopening stages or requesting new approval, provided meaning stays unchanged. Use existing history, approval bindings, and evidence rules. Refer uncertain changes to the orchestrator.

### Revision boundary

- After authorization, start at the earliest stage whose contract or output must change, or whose completion is invalid.
- Apply the execution scope selected by the orchestrator under the phase contract.
- Reopen that stage and every downstream stage within that scope. Their previous completion does not establish completion for the revised work.
- Execute the reopened stages again, in order. Do not skip a downstream stage because its outputs appear unaffected.
- Keep upstream stages complete while their contracts and outputs remain valid. Report new upstream findings to the orchestrator.

Upstream stages occur before the revision boundary. Downstream stages occur after it within the applicable scope. Effort does not change the revision boundary or remove the required cascade.

Construction's task-local [Activity return paths](phases/construction/README.md#return-paths) apply within an active Implementation Execution attempt. The orchestrator authorizes returns. They do not automatically restart that enclosing attempt. Independent task work continues while its inputs and contracts remain valid.

A unit-wide upstream revision still applies the full unit-stage cascade. Construction defines the [handling of running task work](phases/construction/README.md#unit-wide-upstream-revision) during that cascade. Detailed task-state transitions and shutdown coordination remain open.

### Artifacts and evidence

- Reconsider every artifact from the reopened stage and every downstream stage against the revised inputs.
- Update or regenerate an artifact when needed. Existing content can remain when it is still valid, but its stage must establish that validity again.
- Preserve previous decisions, artifacts, and approvals as history. Do not present historical completion or approval as evidence that the revised stage is complete.
- Satisfy each stage's completion conditions again. Its contract determines the required checks, review, and approval.
- Preserve unaffected upstream artifacts and approvals.

## Stage reopening questionnaires

Each stage contract must define a reopening questionnaire. Its questions identify possible changes to that stage's contract or outputs, or findings that could invalidate its completion. This questionnaire supplies stage-specific rules to the shared revision procedure. Do not define a separate revision procedure for each stage.

Stage agents can supply proposed answers and supporting evidence. The orchestrator evaluates the questionnaires in the applicable stage order to select the earliest affected stage. It resolves unclear answers through investigation or requester decisions before selecting the boundary.

- A Yes answer identifies a reason for the orchestrator to assess revision of that stage.
- All No answers identify no independent reason to reopen that stage for the finding.
- All No answers do not exempt a downstream stage from a cascade authorized at an upstream stage.

A questionnaire supports the orchestrator's boundary decision. It does not authorize reopening or replace stage completion, review, or approval conditions.

Activity questions support the orchestrator's return decision within the owning stage. They do not add workflow stages or change the stage revision cascade. Suspected upstream problems still follow the stage revision procedure.

## Revision procedure

1. **Report the finding.** The stage agent reports the evidence, uncertainty, and proposed revision boundary. Use the relevant reopening questionnaire to support the report.
2. **Assess the report.** The orchestrator checks the finding against existing decisions, artifacts, and questionnaires. Clarify the existing contract or request investigation when needed.
3. **Decide and record.** The orchestrator decides whether to continue, investigate, or authorize reopening from the earliest affected stage. Record its decision and reason through the CLI. If reopening is not authorized, resume stage work or investigate as directed. Proceed to step 4 only after authorization.
4. **Reopen the stages.** Apply the authorized boundary to that stage and every downstream stage within the selected execution scope. Their completion is no longer current. Preserve the previous work as history.
5. **Revise the current stage.** Start a new attempt when the stage executes again. Reconsider all its artifacts against its current inputs. Update or confirm each artifact.
6. **Complete the current stage.** Execute the stage and satisfy its completion conditions. Obtain and record approval when its contract requires it.
7. **Continue downstream.** Execute every following stage in the selected scope again, in order. Start a new attempt for each stage when it executes again. Reconsider its artifacts and satisfy its completion conditions.

Report a finding that could move the boundary upstream to the orchestrator. Obtain its authorization before changing the boundary.

## Construction examples

These examples are illustrative. The orchestrator authorizes the boundary from the actual finding.

| Change | Revision boundary | Required cascade |
| --- | --- | --- |
| Required domain behavior changes. | Functional Design. | Every subsequent stage through Deliver. |
| A quality requirement changes while functional behavior remains valid. | Quality Requirements. | Implementation Planning and every subsequent stage through Deliver. |
| The implementation approach changes while functional and quality requirements remain valid. | Implementation Planning. | Implementation Execution, Unit of Work Review, and Deliver. |
| During active Implementation Execution, Code Validation finds a task-local code defect. | Code Generation Activity for that task. | Code Validation and Code Integration for that task, as required. The enclosing Execution attempt remains active. |
| Code Integration requires changes to the task implementation during active Implementation Execution. | Code Generation Activity for that task. | Code Validation and Code Integration for that task, as required. Independent work continues while its contracts and inputs remain valid. |
| Code Integration needs an integration-only retry. | The current Code Integration Activity attempt. | Retry within that attempt. A failed command alone does not create another attempt. |

## Decisions still required

Follow the shared [evidence and checkpoint contract](runtime.md#evidence-and-content-checkpoints) for checkpoint and material references. The CLI infrastructure must still define attempt and revision ID formats, exact binding records, and JSON audit event schemas.

The [retention rules](runtime.md#checkpoint-retention) require keeping needed Git checkpoint objects reachable. Detailed retention remains open. An audit event or fingerprint alone does not preserve output contents.

The shared [interrupted-work recovery rule](runtime.md#interrupted-work-recovery) is agreed. Lock recovery and interrupted state-write recovery remain open. This document records revision authority, safeguards, editorial corrections, the shared cascade rule, and the questionnaire mechanism. It does not approve all earlier revision and recovery proposals.

This document defines revision authority. Construction defines the orchestrator's [task execution responsibilities](phases/construction/README.md#implementation-execution). Other responsibilities require their own contracts.
