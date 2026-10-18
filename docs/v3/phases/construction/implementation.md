# Implementation

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Draft for discussion.

The [phase contract](README.md#implementation) defines the agreed execution structure, concurrency, attempts, check duties, integration procedure, and return paths. Requester intervention is limited to hard blockers under the rule below. This draft proposes additional inputs, responsibilities, role assignments, skills, evidence, and completion details. New proposals do not replace agreed rules.

[Code Generation](activities/code-generation.md), [Code Validation](activities/code-validation.md), and [Code Integration](activities/code-integration.md) have dedicated Activity contracts. Those contracts define their procedures, evidence, completion conditions, reopening questions, and handoffs. Their Activity classification, fixed execution model, and existing check duties are agreed. Their remaining detailed proposals stay open.

Saving this draft does not approve its proposals, accept Planning, or authorize an executing Unit of Work.

## Goal

Implement the current task graph and produce a verified, integrated unit result. Preserve the functional design, quality requirements, selected technical solution, and requester authority.

Complete the required tasks through Code Generation, Code Validation, and Code Integration Activities. Implementation prepares the result for Unit of Work Review; it does not approve delivery.

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
- Publishing, merging into an external target, releasing, or deploying merely because Code Integration succeeds.
- Selecting a worker topology other than the agreed orchestrator-controlled subagent model, or allowing workers to select their own topology.

[CN22](../../authoring_progress.md#completed-construction-decisions) preserves the MVP execution model. It does not constrain other phases or remove ready-task parallelism. [CN20](../../authoring_progress.md#deferred-decisions) tracks coordination protocol definitions beyond the MVP.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Task implementation material | Supply the task's implementation, tests, configuration, and required documentation at an identified checkpoint. |
| Integrated unit material | Supply accepted combined outputs and the unit checkpoint containing them. |
| Stage and Activity evidence | Bind unit and Activity checks, reviews, admissions, integration inputs, acceptance, and completion through CLI-owned operations. |
| Optional supporting detail | Explain useful implementation findings under `details/implementation/`, referenced from the relevant owning artifact or evidence record. |

No separate required execution Markdown document is proposed. Do not duplicate task definitions or store changing completion information in authored documents.

Upstream artifacts retain their stage ownership. Report required changes through the [revision procedure](../../revision.md#revision-procedure).

Apply shared metadata to optional supporting Markdown documents, using `supporting-document`. Evidence logs and generated application files follow their own contracts, not Markdown frontmatter rules.

## Implementation procedure

### Admission and coordination

The orchestrator applies the agreed [admission rules](../../runtime.md#task-admission-and-baselines). Record the current unit integration checkpoint containing required predecessor outputs; keep that admitted baseline fixed.

Supply each worker with its task identity, current definition, relevant contracts, baseline, attempt scope, and verification obligations. Include prerequisite conditions and coordination constraints.

Start independent ready task implementations concurrently. Shared-file or resource conflicts need scoped coordination; they do not establish an output dependency by themselves.

Do not require global coordinator `HEAD` agreement, shared admission commits, unrelated clean workspaces, or completed task batches. Later unit integration commits alone do not invalidate running tasks.

Workers report facts and findings within their scope. The orchestrator and authorized CLI operations control admissions, progress, revision decisions, candidate acceptance, and completion decisions.

For each admitted task, use this fixed Activity order:

### Code Generation

Execute the [Code Generation Activity contract](activities/code-generation.md) for the admitted task. It owns implementation, typechecking, modification-related tests, self-review, and its Validation handoff.

### Code Validation

Execute the [Code Validation Activity contract](activities/code-validation.md) against the generated task output. It owns typechecking, the build, the full suite, independent non-author feedback, and its Integration handoff.

Use a worker context separate from Code Generation for independent Validation. Workers report facts; they do not need to spawn reviewers or call one another. The orchestrator dispatches scoped workers and coordinates each Activity handoff. Successful Validation makes the task eligible for Integration; it does not complete the task.

### Code Integration

Execute the [Code Integration Activity contract](activities/code-integration.md) after successful Validation. It owns locked candidate preparation and combined checks. Authorized orchestrator and CLI operations control acceptance and record task completion.

Successful Integration returns the accepted checkpoint and evidence to unit coordination. Release dependent tasks only after successful predecessor Integration. Independent ready tasks and units continue. Activity handoffs do not add dependencies to the authored task graph. The enclosing Implementation stage still requires its own completion assessment.

## Attempts, failures, and recovery

Follow the agreed [attempt scopes](README.md#attempts-and-completion) and [return paths](README.md#return-paths). Task implementation and the Activity sequence add no task-coding or protocol-run attempt identity.

| Situation | Required treatment |
| --- | --- |
| Local corrections within the current Activity | Continue its current Activity attempt and obtain evidence for the corrected material. |
| An authorized task-local return for code changes | Execute Code Generation, Code Validation, and Code Integration again as required. The enclosing Implementation attempt remains active. |
| An Integration-only retry | Continue the current Code Integration attempt; failed commands alone do not create another attempt. |
| Missing permission, prerequisite, or environment | Preserve work and identify the affected scope. Do not claim successful required checks. Independent ready work continues. |
| Authorized unit-wide revision from Planning or earlier | Apply the agreed shutdown procedure. End affected execution attempts, retain history, and restart only after revised upstream completion. |
| Interrupted work | Compare actual work and evidence with CLI progress. Confirm previous workers stopped before resuming the same unended attempt. |

The [unit-wide revision rule](README.md#unit-wide-upstream-revision) prevents ended attempts from completing tasks or accepting candidates. Physical shutdown, detailed transitions, and lock recovery remain implementation work.

### Return after completed Implementation

This proposed rule applies when the orchestrator selects Implementation as the unit-stage revision boundary after its completion. Earlier upstream boundaries retain their own cascade rules.

1. **Reopen the unit stages.** Reopen Implementation, Unit of Work Review, and Deliver. Start a new unit Implementation attempt when execution resumes.
2. **Select affected task scopes.** Identify each task's earliest invalid Activity and reopen it and every following Activity. Include dependent tasks when changed outputs invalidate their work or evidence. Start new Activity attempts when those Activities execute.
3. **Reassess retained task scopes.** Check each retained task definition, integrated output, relevant input, and evidence binding. Unaffected Activity scopes remain complete under their original attempts. Their records remain linked to the original Implementation attempt; do not reassign or relabel them. Record why their results remain applicable as inputs to the new unit assessment.
4. **Reestablish unit completion.** Execute every reopened Activity and obtain its required current-attempt evidence. Perform a new unit completion assessment, then execute Unit of Work Review and Deliver again under their applicable contracts.

Implementation corrections start at Code Generation. Invalid Validation proof starts at Code Validation. Integration-only invalidity starts at Code Integration. These are assessment examples; the orchestrator selects the earliest affected boundary from the actual finding.

Keep recorded admission baselines fixed. Identify current task material and changed relevant inputs separately. Apply the normal integration lock and candidate checks when accepting corrected task output.

Reassessment does not replace execution of a reopened Activity or transfer old evidence into its new attempt. Do not reparent historical Activity evidence to a new Implementation attempt. An old unit completion assessment cannot complete the new unit attempt, even when its checkpoint is unchanged.

This proposal does not reopen unrelated task scopes automatically. It does not permit retaining completion whose material, inputs, or evidence are invalid.

## Effort

Apply the shared [effort definition](../../effort.md), including the unit default and any explicit Implementation override. Its Activities inherit that effort and have no separate overrides.

| Effort | Implementation guidance |
| --- | --- |
| Minimal | Supply concise task handoffs, necessary implementation rationale, check evidence, findings, and integrated-result references. |
| Standard | Explain significant implementation choices, interactions, corrections, and coordination. Link focused supporting detail. |
| Comprehensive | Analyze complex failures, boundary interactions, recovery concerns, and verification limitations in supporting detail. |

Effort does not remove tasks, checks, independent feedback, evidence, or authority requirements. It does not create automatic reviews or select worker topology.

## Agent roles

These assignments are proposals, not implemented agent profiles.

| Role | Proposed agent | Responsibility |
| --- | --- | --- |
| Implementation owner | `kepler-orchestrator` | Coordinate admissions, workers, findings, execution records, completion, and the review handoff. |

The dedicated [Generation](activities/code-generation.md#roles-and-skills), [Validation](activities/code-validation.md#roles-and-skills), and [Integration](activities/code-integration.md#roles-and-skills) Activity contracts define proposed role assignments.

The MVP uses one orchestrator-controlled subagent model for Implementation. The orchestrator dispatches scoped workers and coordinates Activity handoffs. Workers report facts; they do not need to spawn reviewers or call one another. Generation and independent non-author Validation use separate worker contexts. This model does not select role profiles or add a per-task topology selector. The MVP execution model does not constrain Design, Quality Requirements, Planning, or other phases.

The requester retains product and consequential trade-off authority. The orchestrator's revision authority remains governed by the shared safeguards.

## Supporting skills

The draft proposes these entry procedures:

| Stage | Entry skill | Responsibility |
| --- | --- | --- |
| Implementation | [kepler-orchestrate](../../skills.md#kepler-orchestrate) | Coordinate the unit graph, scoped handoffs, completion evidence, and review handoff. |

The dedicated [Generation](activities/code-generation.md#roles-and-skills), [Validation](activities/code-validation.md#roles-and-skills), and [Integration](activities/code-integration.md#roles-and-skills) Activity contracts define their proposed entry skills.

Self-review belongs in each applicable entry procedure. These names do not adopt current skill implementations or legacy execution records.

Use [kepler-research](../../skills.md#kepler-research) for uncertain facts. Use [kepler-grilling](../../skills.md#kepler-grilling) for a requester decision needed to resolve a hard blocker. Supporting work cannot authorize revisions or edit journals directly.

## Review and approval

New review details are proposals. Required independent Code Validation feedback and the agreed check duties remain binding.

### Self-review

Each Activity contract owns its self-review. The unit owner checks coverage, integrated completion, and handoff completeness.

These checks belong in the entry skills. They do not create separate self-review stages or attempt identities.

### Additional review

The draft proposes additional external review only when the requester asks for it. This does not make Code Validation's independent feedback or Unit of Work Review optional.

### Requester intervention

Ask the requester for a decision only when a hard blocker prevents further authorized Implementation work. First investigate the issue and use existing contracts, available information, and the orchestrator's authority to resolve it.

A hard blocker requires information, permission, or a consequential choice that agents cannot obtain or resolve within their authority. Agents handle ordinary implementation choices, code defects, failed checks, and review findings when agent-led correction paths can resolve them.

Report the blocked work, the established cause, attempted alternatives, and the exact requester input needed. Preserve affected work. Continue independent ready work while its inputs and contracts remain valid. A blocked task does not require the whole unit to stop.

Record the requester's decision and affected scope through CLI-owned operations. Resume affected work only after the blocker is resolved and any required revision or permission is established.

Task acceptance follows successful Code Validation and Code Integration under their contracts, including required checks and evidence. The orchestrator records task completion through authorized CLI operations. Do not require routine requester task approval or a separate whole-Implementation approval.

A requester decision does not turn failed checks into successful results or waive unresolved stage obligations. Upstream stages retain their own approval rules. Implementation authority does not authorize publication or deployment.

### Reopening questionnaires

Evaluate these stage-specific questions and report the proposed boundary to the orchestrator.

Use the dedicated [Generation](activities/code-generation.md#reopening-questionnaire), [Validation](activities/code-validation.md#reopening-questionnaire), and [Integration](activities/code-integration.md#reopening-questionnaire) questionnaires for those Activities.

#### Implementation

1. Does the integrated result omit required task output or leave an applicable unit obligation unfulfilled?
2. Does evidence fail to establish current required task completion or combined-result checks?
3. Does a finding invalidate scheduling assumptions, task contracts, or the selected solution?
4. Does the review handoff misidentify the integrated result, relevant inputs, or unresolved material concerns?

Apply the shared [questionnaire rules](../../revision.md#stage-reopening-questionnaires). Suspected upstream invalidity can move the boundary earlier. Answers do not authorize reopening or exempt downstream stages from a cascade.

A task-local return during active execution follows the agreed return paths. Findings after completed Implementation follow the proposed [scoped-return rule](#return-after-completed-implementation) after the orchestrator authorizes that unit-stage boundary.

## Completion conditions

The draft proposes these details for the agreed execution completion rule:

- Every task required by the current graph has satisfied its task contract and completed successful Code Integration.
- Code Generation, Code Validation, and Code Integration have their required checks, reviews, and applicable completion evidence.
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

The dedicated [Generation](activities/code-generation.md#evidence-coverage), [Validation](activities/code-validation.md#evidence-coverage), and [Integration](activities/code-integration.md#evidence-coverage) Activity contracts own their named evidence and required results.

The rows below cover the enclosing Implementation stage. Refer to originating Activity records without rebinding their results as unit-attempt results.

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Implementation completion assessment | Final unit checkpoint, current task graph, upstream obligations, current or retained Activity evidence, and integration provenance. | Required tasks and integrated checks are complete. Reopened Activities have current-attempt evidence; retained scopes have valid original bindings. Unit self-review confirms coverage and handoff accuracy. |
| Requested additional review result | Material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |
| Requester blocker decision | Blocking issue, affected work, relevant contracts, and required requester input. | Record the requester's actual decision and its scope. Resume affected work only when the blocker is resolved. |

The requester-decision row applies only when a hard blocker needs requester intervention. It is not a routine task-approval record.

Apply the shared [evidence bindings](../../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Preserve each check's task or unit scope, attempt, checkpoint, relevant inputs, conditions, result, and supporting output.

The completion assessment is new unit-scoped work. It consumes Activity evidence without transferring earlier attempts' completion or replacing mandatory Activity checks.

Retain the final integrated checkpoint and necessary task checkpoints, candidate material, logs, and external evidence. A commit identifier or mutable external link alone does not retain them.

Record results through CLI-owned operations. Exact payloads, commands, status transitions, and lock mechanisms remain implementation work. This draft does not implement those operations.

## Handoff

**Standard workflow next stage:** [Unit of Work Review](unit-of-work-review.md).

Identify the unit directory, current upstream artifacts, final integrated checkpoint, complete task set, and originating evidence records.

Supply coverage information, integration provenance, relevant environments, resolved findings, and any nonblocking limitations. Explain how the result meets task obligations without claiming whole-unit acceptance.

Unit of Work Review evaluates the complete outcome. Successful task completion does not authorize delivery or waive that review.
