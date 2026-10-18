# Stage 4: Implementation Execution

[Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

The [phase contract](README.md#implementation-execution) defines the agreed execution structure, concurrency, attempts, check duties, integration procedure, and return paths. Requester intervention is limited to hard blockers under the rule below. This draft proposes additional inputs, responsibilities, role assignments, skills, evidence, and completion details. New proposals do not replace agreed rules.

[Code Generation](code-generation.md) and [Code Validation](code-validation.md) have dedicated task-stage contracts. Those contracts own their procedures, evidence, completion conditions, reopening questions, and handoffs.

Saving this draft does not approve its proposals, accept Planning, or authorize an executing Unit of Work.

## Goal

Implement the current task graph and produce a verified, integrated unit result. Preserve the functional design, quality requirements, selected technical solution, and requester authority.

Complete the required tasks through Code Generation, Code Validation, and Task Integration. Implementation Execution prepares the result for Unit of Work Review; it does not approve delivery.

## Inputs

- Current `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, and `tasks-dag.json`, including relevant supporting files.
- Applicable upstream completion records, decisions, constraints, and required approvals.
- The unit's current integrated checkpoint and retained implementation work, when available.
- Project standards, relevant source code, check commands, and available execution environments.
- Task prerequisites, required predecessor outputs, and coordination constraints.
- Existing attempt records and evidence when resuming interrupted work.

Use the [task graph format](task-graph.md) for authored task definitions. Read execution progress through the CLI, not task-graph status fields.

Existing application code and tests are not entry requirements. Greenfield tasks must establish required implementation and verification infrastructure before dependent checks need it.

## Entry conditions

The draft proposes starting when:

- Implementation Planning and earlier unit stages are complete under their applicable contracts for the current material.
- The current task graph, technical solution, verification obligations, and relevant inputs are available and consistent.
- Authority to execute the requested implementation work is established under applicable requester instructions and project rules.
- The unit's initial integration checkpoint is identified, or established from the current repository material before the first task admission.

Meeting these entry conditions does not mean the requester has accepted the stage contract. An empty application can supply the initial repository checkpoint; pre-existing implementation and passing application checks are not required.

Do not require every future task prerequisite to be available before starting independent ready work. Apply each prerequisite before its affected work or verification.

## Scope

### Included

- Admit ready tasks against fixed baselines and coordinate permitted concurrent work.
- Implement task outcomes, tests, configuration, and required documentation within the current contracts.
- Execute task validation, independent code feedback, and combined-candidate checks.
- Integrate successful candidates under the unit lock and establish task completion.
- Assess the complete integrated result and prepare a whole-unit review handoff.
- Preserve work, record scoped facts, and report findings that require requester decisions or upstream revision.

### Excluded

- Changing upstream requirements, task definitions, dependencies, or selected planning decisions without applicable revision authority.
- Treating positive task reviews as whole-unit acceptance.
- Publishing, merging into an external target, releasing, or deploying merely because task integration succeeds.
- Selecting inline work, subagents, or swarms through this contract.

[CN20](../authoring_progress.md#construction-decisions-still-pending) retains the working-discipline question. It must not remove agreed ready-task parallelism.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Task implementation material | Supply the task's implementation, tests, configuration, and required documentation at an identified checkpoint. |
| Integrated unit material | Supply accepted combined outputs and the unit checkpoint containing them. |
| Stage evidence and execution records | Bind checks, reviews, admissions, integration inputs, acceptance, and completion through CLI-owned operations. |
| Optional supporting detail | Explain useful implementation findings under `details/implementation-execution/`, referenced from the relevant owning artifact or evidence record. |

No separate required execution Markdown document is proposed. Do not duplicate task definitions or store changing completion information in authored documents.

Upstream artifacts retain their stage ownership. Report required changes through the [revision procedure](../revision.md#revision-procedure).

Apply shared metadata to optional supporting Markdown documents, using `supporting-document`. Evidence logs and generated application files follow their own contracts, not Markdown frontmatter rules.

## Execution procedure

### Admission and coordination

The orchestrator applies the agreed [admission rules](../runtime.md#task-admission-and-baselines). Record the current unit integration checkpoint containing required predecessor outputs; keep that admitted baseline fixed.

Supply each worker with its task identity, current definition, relevant contracts, baseline, attempt scope, and verification obligations. Include prerequisite conditions and coordination constraints.

Start independent ready task implementations concurrently. Shared-file or resource conflicts need scoped coordination; they do not establish an output dependency by themselves.

Do not require global coordinator `HEAD` agreement, shared admission commits, unrelated clean workspaces, or completed task batches. Later unit integration commits alone do not invalidate running tasks.

Workers report facts and findings within their scope. The orchestrator and authorized CLI operations own admissions, revision decisions, integration acceptance, and completion decisions.

### Code Generation

Execute the [Code Generation contract](code-generation.md) for the admitted task. That stage owns implementation, typechecking, modification-related tests, self-review, and its Validation handoff.

### Code Validation

Execute the [Code Validation contract](code-validation.md) against the generated task output. That stage owns typechecking, the build, the full suite, independent feedback, and its Integration handoff.

The orchestrator coordinates stage handoffs. Successful Validation makes the task eligible for Integration; it does not complete task implementation.

### Task Integration

Task Integration follows successful Task coding. Use the agreed [prepare, check, and accept procedure](README.md#integration-order-and-locking).

Acquire the unit integration lock before reading the current integrated checkpoint and preparing the combined candidate. Keep the task admission baseline unchanged; record current integration inputs separately.

Run typechecking, the project build, and the full application test suite against the combined candidate while holding the lock. Accept only the checked candidate after all required checks succeed.

Record the candidate, integration inputs, required results, and accepted checkpoint through CLI-owned operations. Verify that the accepted material matches the checked candidate.

Release the lock when the operation ends, including before returning to coding. Other permitted coding, validation, and unit work can continue.

If task output needs changes, report the finding for an authorized return to coding. Do not hide implementation changes inside an integration-only retry.

Self-check input bindings, check coverage, acceptance, and retained evidence. Complete task implementation only after successful candidate acceptance and the task's other completion conditions.

## Attempts, failures, and recovery

Follow the agreed [attempt scopes](README.md#attempts-and-completion) and [return paths](README.md#return-paths). Task coding and task implementation add no attempt identities or run floors.

| Situation | Required treatment |
| --- | --- |
| Local corrections within the current stage | Continue its current attempt and obtain evidence for the corrected material. |
| An authorized task-local return to coding | Execute Generation, Validation, and Integration again. The enclosing Implementation Execution attempt remains active. |
| An integration-only retry | Continue the current Integration attempt; failed commands alone do not create another attempt. |
| Missing permission, prerequisite, or environment | Preserve work and identify the affected scope. Do not claim successful required checks. Independent ready work continues. |
| Authorized unit-wide revision from Planning or earlier | Apply the agreed shutdown procedure. End affected execution attempts, retain history, and restart only after revised upstream completion. |
| Interrupted work | Compare actual work and evidence with CLI progress. Confirm previous workers stopped before resuming the same unended attempt. |

The [unit-wide revision rule](README.md#unit-wide-upstream-revision) prevents ended attempts from completing tasks or accepting candidates. Physical shutdown, detailed transitions, and lock recovery remain implementation work.

### Return after completed Execution

This proposed rule applies when the orchestrator selects Implementation Execution as the unit-stage revision boundary after its completion. Earlier upstream boundaries retain their own cascade rules.

1. **Reopen the unit stages.** Reopen Implementation Execution, Unit of Work Review, and Deliver. Start a new unit Execution attempt when execution resumes.
2. **Select affected task scopes.** Identify each task's earliest invalid stage and reopen it and every following task stage. Include dependent tasks when changed outputs invalidate their work or evidence. Start new attempts when those reopened task stages execute.
3. **Reassess retained task scopes.** Check each retained task definition, integrated output, relevant input, and evidence binding. Unaffected task-stage scopes remain complete under their original attempts. Their records remain linked to the original Execution attempt; do not reassign or relabel them. Record why their results remain applicable as inputs to the new unit assessment.
4. **Reestablish unit completion.** Execute every reopened task stage and obtain its required current-attempt evidence. Perform a new unit completion assessment, then execute Unit of Work Review and Deliver again under their applicable contracts.

Implementation corrections start at Generation. Invalid Validation proof starts at Validation. Integration-only invalidity starts at Integration. These are assessment examples; the orchestrator selects the earliest affected boundary from the actual finding.

Keep recorded admission baselines fixed. Identify current task material and changed relevant inputs separately. Apply the normal integration lock and candidate checks when accepting corrected task output.

Reassessment does not replace execution of a reopened stage or transfer old evidence into its new attempt. An old unit completion assessment cannot complete the new unit attempt, even when its checkpoint is unchanged.

This proposal does not reopen unrelated task scopes automatically. It does not permit retaining completion whose material, inputs, or evidence are invalid.

## Depth

Apply the shared [depth definition](../depth.md), including the unit default and explicit stage overrides.

| Depth | Implementation Execution guidance |
| --- | --- |
| Minimal | Supply concise task handoffs, necessary implementation rationale, check evidence, findings, and integrated-result references. |
| Standard | Explain significant implementation choices, interactions, corrections, and coordination. Link focused supporting detail. |
| Comprehensive | Analyze complex failures, boundary interactions, recovery concerns, and verification limitations in supporting detail. |

Depth does not remove tasks, checks, independent feedback, evidence, or authority requirements. It does not create automatic reviews or select worker topology.

## Agent roles

These assignments are proposals, not implemented agent profiles.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Implementation Execution owner | `kepler-orchestrator` | Coordinate admissions, workers, findings, execution records, completion, and the review handoff. |
| Task Integration owner | `kepler-orchestrator` | Ensure locked candidate preparation, checks, acceptance, evidence, and integration return handling. |

The dedicated [Generation](code-generation.md#agent-roles) and [Validation](code-validation.md#agent-roles) contracts define their proposed role assignments.

Role ownership does not require one worker to perform every operation. Scoped workers report results; the owner remains responsible for the stage contract.

The requester retains product and consequential trade-off authority. The orchestrator's revision authority remains governed by the shared safeguards.

## Supporting skills

The draft proposes these entry procedures:

| Stage | Entry skill | Responsibility |
| --- | --- | --- |
| Implementation Execution | [kepler-orchestrate](../skills.md#kepler-orchestrate) | Coordinate the unit graph, scoped handoffs, completion evidence, and review handoff. |
| Task Integration | [kepler-orchestrate](../skills.md#kepler-orchestrate) | Apply the task-scoped integration procedure separately from unit scheduling. |

The dedicated [Generation](code-generation.md#supporting-skills) and [Validation](code-validation.md#supporting-skills) contracts define their proposed entry skills.

Self-review belongs in each applicable entry procedure. These names do not adopt current skill implementations or legacy execution records.

Use [kepler-research](../skills.md#kepler-research) for uncertain facts. Use [kepler-grilling](../skills.md#kepler-grilling) for a requester decision needed to resolve a hard blocker. Supporting work cannot authorize revisions or edit journals directly.

## Review and approval

New review details are proposals. Required independent Code Validation feedback and the agreed check duties remain binding.

### Self-review

Generation and Validation own self-review under their dedicated contracts. Integration checks candidate bindings and acceptance. The unit owner checks coverage, integrated completion, and handoff completeness.

These checks belong in the entry skills. They do not create separate self-review stages or attempt identities.

### Additional review

The draft proposes additional external review only when the requester asks for it. This does not make Code Validation's independent feedback or Unit of Work Review optional.

### Requester intervention

Ask the requester for a decision only when a hard blocker prevents further authorized Execution work. First investigate the issue and use existing contracts, available information, and the orchestrator's authority to resolve it.

A hard blocker requires information, permission, or a consequential choice that agents cannot obtain or resolve within their authority. Agents handle ordinary implementation choices, code defects, failed checks, and review findings when agent-led correction paths can resolve them.

Report the blocked work, the established cause, attempted alternatives, and the exact requester input needed. Preserve affected work. Continue independent ready work while its inputs and contracts remain valid. A blocked task does not require the whole unit to stop.

Record the requester's decision and affected scope through CLI-owned operations. Resume affected work only after the blocker is resolved and any required revision or permission is established.

Tasks are accepted through Code Validation and Task Integration under their contracts, including required checks and evidence. The orchestrator records task completion through authorized CLI operations. Do not require routine requester task approval or a separate whole-Execution approval.

A requester decision does not turn failed checks into successful results or waive unresolved stage obligations. Upstream stages retain their own approval rules. Implementation authority does not authorize publication or deployment.

### Reopening questionnaires

Evaluate these stage-specific questions and report the proposed boundary to the orchestrator.

Use the dedicated [Generation](code-generation.md#reopening-questionnaire) and [Validation](code-validation.md#reopening-questionnaire) questionnaires for those stages.

#### Task Integration

1. Does the candidate combine the wrong inputs or omit required task output?
2. Do required checks fail, remain incomplete, or cover material other than the accepted candidate?
3. Does a correction require task implementation changes rather than an integration-only retry?

#### Implementation Execution

1. Does the integrated result omit required task output or leave an applicable unit obligation unfulfilled?
2. Does evidence fail to establish current required task completion or combined-result checks?
3. Does a finding invalidate scheduling assumptions, task contracts, or the selected solution?
4. Does the review handoff misidentify the integrated result, relevant inputs, or unresolved material concerns?

Apply the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Suspected upstream invalidity can move the boundary earlier. Answers do not authorize reopening or exempt downstream stages from a cascade.

A task-local return during active execution follows the agreed return paths. Findings after completed Execution follow the proposed [scoped-return rule](#return-after-completed-execution) after the orchestrator authorizes that unit-stage boundary.

## Completion conditions

The draft proposes these details for the agreed execution completion rule:

- Every task required by the current graph has satisfied its task contract and completed successful integration.
- Generation and Validation have their required checks, reviews, and applicable completion evidence.
- Each accepted candidate passed required combined-result checks under the unit lock.
- The final integrated checkpoint contains the required outputs, with their inclusion established through history or integration provenance.
- Required combined-result evidence applies to the final integrated material and relevant inputs.
- No unresolved blocking finding or unauthorized consequential choice remains.
- No worker remains authorized to change the completed execution result under an unfinished task in this execution.
- Unit self-review and any requested additional review are complete, with blocking findings resolved.
- Any requester decisions needed to resolve hard blockers are recorded and their blocking effects are resolved.
- The handoff identifies the complete integrated result, upstream contracts, task provenance, and evidence for Unit of Work Review.

This does not require unrelated workspaces to be clean or independent units to stop. Whole-unit review and delivery remain separate stages.

### Evidence coverage

The dedicated [Generation](code-generation.md#evidence-coverage) and [Validation](code-validation.md#evidence-coverage) contracts own their named evidence and required results.

The rows below cover Integration and the enclosing Execution stage. Refer to originating task-stage records without rebinding their results as unit-attempt results.

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Integration check result | Combined candidate, current unit checkpoint, task output, and relevant conditions. | Typechecking, the project build, and the full application test suite succeed against the candidate under the unit lock. |
| Integration acceptance result | Checked candidate, accepted unit checkpoint, integration inputs, and required check records. | The accepted material matches the successful candidate. Integration self-review confirms bindings and task completion conditions. |
| Execution completion assessment | Final unit checkpoint, current task graph, upstream obligations, current or retained task-stage evidence, and integration provenance. | Required tasks and integrated checks are complete. Reopened task stages have current-attempt evidence; retained scopes have valid original bindings. Unit self-review confirms coverage and handoff accuracy. |
| Requested additional review result | Material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |
| Requester blocker decision | Blocking issue, affected work, relevant contracts, and required requester input. | Record the requester's actual decision and its scope. Resume affected work only when the blocker is resolved. |

The requester-decision row applies only when a hard blocker needs requester intervention. It is not a routine task-approval record.

Apply the shared [evidence bindings](../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Preserve each check's task or unit scope, attempt, checkpoint, relevant inputs, conditions, result, and supporting output.

The completion assessment is new unit-scoped work. It consumes task evidence without transferring earlier attempts' completion or replacing mandatory task-stage checks.

Retain the final integrated checkpoint and necessary task checkpoints, candidate material, logs, and external evidence. A commit identifier or mutable external link alone does not retain them.

Record results through CLI-owned operations. Exact payloads, commands, status transitions, and lock mechanisms remain implementation work. This draft does not implement those operations.

## Handoff

**Next stage:** [Unit of Work Review](unit-of-work-review.md).

Identify the unit directory, current upstream artifacts, final integrated checkpoint, complete task set, and originating evidence records.

Supply coverage information, integration provenance, relevant environments, resolved findings, and any nonblocking limitations. Explain how the result meets task obligations without claiming whole-unit acceptance.

Unit of Work Review evaluates the complete outcome. Successful task completion does not authorize delivery or waive that review.
