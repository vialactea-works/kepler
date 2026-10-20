# Revision

[Workflow phase index](README.md)

## Purpose

This document gives shared revision rules for the stages of one Unit of Work. These rules apply across stages, not only to Functional Design.

Use the selected workflow's stage order and each owning phase's execution scopes. The [Standard workflow](workflows/standard/README.md#stages) selects the Construction MVP sequence. Construction sets its [task execution structure](phases/construction/README.md#implementation).

Apply execution-state changes through the `kepler` CLI. Record reopening, attempts, completion, and approval facts in phase-owned JSON event journals under the shared [execution-state representation](runtime.md#execution-state-representation). Get current execution state from those events, not artifact frontmatter or Markdown status fields.

## Rules

### Authority and escalation

The orchestrator agent selects whether to start a revision cascade. It selects the starting stage and execution scope under the phase contract.

A stage or Activity worker reports the finding, supporting evidence, uncertainty, and proposed boundary. It must not authorize reopening or start a cascade on its own.

The orchestrator can clarify an existing decision, request investigation, or authorize reopening. Record its decision and reason through the shared [CLI infrastructure](runtime.md#revision-decisions).

#### Safeguards

- **Keep product authority.** A clarification must explain an existing decision. It must not silently change approved behavior or scope. The requester keeps authority over product behavior, scope, and material trade-offs. The requester must approve changes to those decisions.
- **Resolve reported invalidity.** Compare the reported problem with relevant evidence and the current contract. Identify the affected stage. Reopen the affected stage when an upstream contract is invalid. Cost alone is not a valid reason to work under that contract. After the orchestrator authorizes reopening, apply the full cascade from the selected boundary.
- **Address evidence and disagreement.** A decision to continue must explain why the reported concern is resolved. The stage can report that the explanation does not answer the concern. Continue investigation or get a requester decision to settle continued disagreement. Do not replace resolution with repeated instructions to continue.
- **Keep local corrections independent.** Stage agents can correct errors within the current stage without orchestrator approval. Escalate suspected upstream problems, unresolved authority questions, and proposed reopening.

### Editorial corrections

An agent can correct editorial errors in prose without reopening stages or requesting new approval when meaning stays unchanged. Use existing history, approval bindings, and evidence rules. Refer uncertain changes to the orchestrator.

### Revision boundary

- After authorization, start at the earliest stage whose contract or output must change, or whose completion is invalid.
- Apply the execution scope selected by the orchestrator under the phase contract.
- Reopen that stage and every downstream stage within that scope. Their previous completion does not show completion for the revised work.
- Execute the reopened stages again, in order. Do not skip a downstream stage because its outputs appear unaffected.
- Keep upstream stages complete while their contracts and outputs stay valid. Report new upstream findings to the orchestrator.

Upstream stages occur before the revision boundary. Downstream stages occur after it within the applicable scope. Effort does not change the revision boundary or remove the necessary cascade.

Construction's task-local [Activity return paths](phases/construction/README.md#return-paths) apply within an active Implementation attempt. The orchestrator authorizes returns. They do not automatically restart that enclosing attempt. Independent task work continues while its inputs and contracts stay valid.

A unit-wide upstream revision still applies the full unit-stage cascade. Construction sets rules for active task work during that cascade. See [handling of active task work](phases/construction/README.md#unit-wide-upstream-revision). Detailed task-state transitions, dependency invalidation, and shutdown coordination stay release implementation work under DF15 through DF17, not new requester-approval decisions.

### Artifacts and evidence

- Compare every artifact from the reopened stage and every downstream stage with the revised inputs. If an artifact does not meet the revised contract, update it. If it meets the contract, make sure that it still applies.
- Update or regenerate an artifact when necessary. Existing content can stay when it is still valid, but its stage must show that it is valid again.
- Keep previous decisions, artifacts, and approvals as history. Do not present historical completion or approval as evidence that the revised stage is complete.
- Satisfy each stage's completion conditions again. Its contract sets the necessary checks, review, and approval.
- Keep unaffected upstream artifacts and approvals.

## Stage reopening questionnaires

Each stage contract must include a reopening questionnaire. Its questions identify possible changes to that stage's contract or outputs, or findings that could invalidate its completion. This questionnaire supplies stage-specific questions for the shared revision procedure. Do not write a separate revision procedure for each stage.

Stage agents can give proposed answers and supporting evidence. The orchestrator uses the questionnaires in stage order to select the earliest affected stage. It investigates unclear answers or gets requester decisions before it selects the boundary.

- A Yes answer gives the orchestrator a reason to examine the stage and decide whether it is a possible revision boundary.
- All No answers identify no independent reason to reopen that stage for the finding.
- All No answers do not exempt a downstream stage from a cascade authorized at an upstream stage.

A questionnaire helps the orchestrator select the boundary. It does not authorize reopening or replace stage completion, review, or approval conditions.

Activity questions help the orchestrator select a return within the owning stage. They do not add workflow stages or change the stage revision cascade. Suspected upstream problems still follow the stage revision procedure.

## Revision procedure

1. **Report the finding.** The stage agent reports the evidence, uncertainty, and proposed revision boundary. Use the relevant reopening questionnaire to help with the report.
2. **Compare the report.** The orchestrator compares the finding with existing decisions, artifacts, and questionnaires. Clarify the existing contract or request investigation when necessary.
3. **Decide and record.** The orchestrator selects whether to continue, investigate, or authorize reopening from the earliest affected stage. Record the decision and reason through the CLI, using the shared [revision identity](runtime.md#revision-decisions) for an authorization. If reopening is not authorized, resume stage work or investigate as directed. Proceed to step 4 only after authorization.
4. **Reopen the stages.** Apply the authorized boundary to that stage and every downstream stage within the selected execution scope. Their completion is no longer current. Keep the previous work as history.
5. **Revise the current stage.** Start a new attempt when the stage starts again. Compare all its artifacts with its current inputs. Update each artifact or make sure that it is valid.
6. **Complete the current stage.** Execute the stage work and satisfy its completion conditions. Get and record approval when its contract makes it necessary.
7. **Continue downstream.** Execute every following stage in the selected scope again, in order. Start a new attempt for each stage when it executes again. Compare each artifact with its current inputs. Update each artifact that does not meet the current contract. If an artifact meets the contract, make sure that it still applies. Satisfy the completion conditions.

Report a finding that could move the boundary upstream to the orchestrator. Obtain its authorization before changing the boundary.

## Construction examples

These examples are illustrative. The orchestrator authorizes the boundary from the actual finding.

| Change | Revision boundary | Required cascade |
| --- | --- | --- |
| Required domain behavior changes. | Functional Design. | Every subsequent stage through Deliver. |
| A quality requirement changes while functional behavior stays valid. | Quality Requirements. | Implementation Planning and every subsequent stage through Deliver. |
| The implementation approach changes while functional and quality requirements stay valid. | Implementation Planning. | Implementation, Unit of Work Review, and Deliver. |
| During active Implementation, Code Validation finds a task-local code defect. | Code Generation Activity for that task. | Code Validation and Code Integration for that task, when necessary. The enclosing Implementation attempt stays active. |
| Code Integration finds that the task implementation must change during active Implementation. | Code Generation Activity for that task. | Code Validation and Code Integration for that task, when necessary. Independent work continues while its contracts and inputs stay valid. |
| An integration-only retry is necessary. | The current Code Integration Activity attempt. | Retry within that attempt. A failed command alone does not create another attempt. |

## Decisions still required

Use the shared [evidence and checkpoint contract](runtime.md#evidence-and-content-checkpoints) for checkpoint and material references. The shared runtime sets attempt and revision identities and required evidence and approval records. SH51 accepts opaque caller-supplied material-reference strings. Bind actual repository checkpoints and evidence through recorded workspace and operation facts, not by parsing those strings. Phase-owned payload types and JSON event catalogs remain implementation work under their owning contracts.

Keep necessary Git checkpoint objects reachable under the [retention rules](runtime.md#checkpoint-retention). Detailed retention stays open. An audit event or fingerprint alone does not keep output contents.

Use the shared [interrupted-work recovery rule](runtime.md#interrupted-work-recovery). SH64-SH67 set the lock mechanism, owner-record facts, cross-workspace claims, and manual lock-artifact recovery. Recovery for interrupted state writes remains open under SH87. This document records revision authority, safeguards, editorial corrections, the shared cascade rule, and the questionnaire mechanism. It does not approve all earlier revision and recovery proposals.

This document records the shared revision authority. Construction sets the orchestrator's [task execution responsibilities](phases/construction/README.md#implementation). A separate contract is necessary for each other responsibility.
