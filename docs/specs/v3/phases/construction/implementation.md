# Implementation

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Accepted by the requester under [IE21](../../authoring_progress.md#completed-implementation-decisions).

The [phase contract](README.md#implementation) and this specification state the accepted execution structure, concurrency, attempts, check duties, integration procedure, and return paths. They also state roles, skills, evidence, and completion conditions. Requester intervention is limited to hard blockers.

[Code Generation](activities/code-generation.md), [Code Validation](activities/code-validation.md), and [Code Integration](activities/code-integration.md) have separate accepted Activity contracts under [IE24](../../authoring_progress.md#completed-implementation-decisions), [IE25](../../authoring_progress.md#completed-implementation-decisions), and [IE27](../../authoring_progress.md#completed-implementation-decisions). Each approval covers its complete Activity contract.

These approvals concern specifications. They do not start an executing Unit of Work, make the assigned roles or skills active, or authorize delivery.

## Goal

Do the work in the current task graph and make an integrated unit result that passed the required checks. Keep the functional design, quality requirements, selected technical solution, and requester authority.

Complete the required tasks through Code Generation, Code Validation, and Code Integration Activities. Implementation prepares the result for Unit of Work Review. It does not approve delivery.

## Inputs

- Current `unit-of-work.md`, `design.md`, `quality.md`, `plan.md`, and `tasks-dag.json`, including relevant supporting files.
- Applicable upstream completion records, decisions, constraints, and required approvals.
- The unit's current repository-qualified integrated checkpoint set and retained implementation work, when available.
- Project standards, relevant source code, check commands, and available execution environments.
- Task prerequisites, required predecessor outputs, and coordination constraints.
- Existing attempt records and evidence when resuming interrupted work.

Use the [task graph format](task-graph.md) for authored task definitions. Read execution progress through the CLI, not task-graph status fields.

Existing application code and tests are not entry requirements. Greenfield tasks must set up required implementation and verification infrastructure before dependent checks start.

## Entry conditions

Start when:

- Implementation Planning and earlier unit stages are complete under their applicable contracts for the current material.
- The current task graph, technical solution, verification obligations, and relevant inputs are available and consistent.
- Applicable requester instructions and project rules give authority to execute the requested implementation work.
- The unit's original Review baseline set is identified before the first task admission. Keep it distinct from the mission starting set. If it is not recorded, capture the current repository-qualified integration set.

Meeting these entry conditions does not approve a particular Unit of Work. A greenfield repository can have no commit. Record that condition without inventing a checkpoint. Pre-existing implementation and passing application checks are not required.

Future task prerequisites do not all have to be available before independent ready work starts. Apply each prerequisite before its affected work or verification.

## Scope

### Included

- Admit ready tasks against fixed baselines and coordinate permitted concurrent work.
- Do each task's code, tests, configuration, and required documentation within the current contracts.
- Execute task validation, independent code feedback, and combined-candidate checks.
- Integrate successful candidates under the unit lock, then record task completion.
- Examine the complete integrated result, state whether it meets its obligations, and prepare a whole-unit review handoff.
- Keep work, record scoped facts, and report findings for which requester input or upstream revision is necessary.

### Excluded

- Changing upstream requirements, task definitions, dependencies, or selected planning decisions without applicable revision authority.
- Treating positive task reviews as whole-unit acceptance.
- Publishing, merging into an external target, releasing, or deploying merely because Code Integration succeeds.
- Selecting a worker topology other than the agreed orchestrator-controlled subagent model, or giving workers authority to select their own topology.

[CN22](../../authoring_progress.md#completed-construction-decisions) keeps the MVP execution model. It does not constrain other phases or remove ready-task parallelism. [CN20](../../authoring_progress.md#deferred-decisions) tracks coordination protocol definitions beyond the MVP.

## Artifacts and records

| Output | Responsibility |
| --- | --- |
| Task implementation material | Give the task's code, tests, configuration, and required documentation at identified repository checkpoints. |
| Integrated unit material | Give accepted combined outputs and the repository-qualified checkpoint set containing them. |
| Stage and Activity evidence | Bind unit and Activity checks, reviews, admissions, integration inputs, acceptance, and completion through CLI-owned operations. |
| Optional supporting detail | Explain useful implementation findings under `details/implementation/`, referenced from the relevant owning artifact or evidence record. |

No separate execution Markdown document is required. Do not duplicate task definitions or store changing completion information in authored documents.

Keep upstream artifacts under their stage owners. Report required changes through the [revision procedure](../../revision.md#revision-procedure).

Apply shared metadata to optional supporting Markdown documents, using `supporting-document`. Evidence logs and generated application files follow their own contracts, not Markdown frontmatter rules.

## Implementation procedure

### Admission and coordination

The orchestrator applies the agreed [admission rules](../../runtime.md#task-admission-and-baselines). Record the current repository-qualified unit integration set containing required predecessor outputs. Keep that admitted baseline set fixed.

Supply each worker with its task identity, current definition, relevant contracts, baseline, attempt scope, and verification obligations. Include prerequisite conditions and coordination constraints.

Start independent ready task implementations concurrently. Scoped coordination is necessary for shared-file or resource conflicts. They do not show an output dependency by themselves.

Global coordinator `HEAD` agreement, shared admission commits, unrelated clean workspaces, and completed task batches are not necessary. Later unit integration commits alone do not invalidate running tasks.

Workers report facts and findings within their scope. The orchestrator and authorized CLI operations control admissions, progress, revision decisions, candidate acceptance, and completion decisions.

For each admitted task, use this fixed Activity order:

### Code Generation

Execute the [Code Generation Activity contract](activities/code-generation.md) for the admitted task. It owns implementation, typechecking, modification-related tests, self-review, and its Validation handoff.

### Code Validation

Execute the [Code Validation Activity contract](activities/code-validation.md) against the generated task output. It owns typechecking, the build, the full suite, independent non-author feedback, and its Integration handoff.

Use a worker context separate from Code Generation for independent Validation. Workers report facts. They do not have to spawn reviewers or call one another. The orchestrator dispatches scoped workers and coordinates each Activity handoff. Successful Validation makes the task eligible for Integration. It does not complete the task.

### Code Integration

Execute the [Code Integration Activity contract](activities/code-integration.md) after successful Validation. It owns locked candidate preparation and combined checks. Authorized orchestrator and CLI operations control acceptance and record task completion.

Successful Integration returns the accepted repository-qualified checkpoint set and evidence to unit coordination. Release dependent tasks only after successful predecessor Integration. Independent ready tasks and units continue. Activity handoffs do not add dependencies to the authored task graph. The enclosing Implementation stage must have its own completion assessment.

## Attempts, failures, and recovery

Follow the agreed [attempt scopes](README.md#attempts-and-completion) and [return paths](README.md#return-paths). Task implementation and the Activity sequence add no task-coding or protocol-run attempt identity.

| Situation | Required treatment |
| --- | --- |
| Local corrections within the current Activity | Continue its current Activity attempt and obtain evidence for the corrected material. |
| An authorized task-local return for code changes | Execute Code Generation, Code Validation, and Code Integration again as required. The enclosing Implementation attempt remains active. |
| An Integration-only retry | Continue the current Code Integration attempt. Failed commands alone do not create another attempt. |
| Missing permission, prerequisite, or environment | Keep work and identify the affected scope. Do not claim successful required checks. Independent ready work continues. |
| Authorized unit-wide revision from Planning or earlier | Apply the agreed shutdown procedure. End affected execution attempts, keep history, and restart only after revised upstream completion. |
| Interrupted work | Compare actual work and evidence with CLI progress. Make sure previous workers have stopped before resuming the same unended attempt. |

The [unit-wide revision rule](README.md#unit-wide-upstream-revision) prevents ended attempts from completing tasks or accepting candidates. Physical worker shutdown and detailed transitions remain implementation work. Apply the shared [lock and ownership rules](../../runtime.md#short-scoped-coordination) and [Mission coordination paths](../../mission.md#local-storage-and-concurrency). Exact key encodings and record fields remain implementation choices under SH64-SH66. SH67 accepts manual unlock after workers stop and effects reconcile.

### Return after completed Implementation

This rule applies when the orchestrator selects Implementation as the unit-stage revision boundary after its completion. Earlier upstream boundaries keep their own cascade rules.

1. **Reopen the unit stages.** Reopen Implementation, Unit of Work Review, and Deliver. Start a new unit Implementation attempt when execution resumes.
2. **Select affected task scopes.** Identify each task's earliest invalid Activity and reopen it and every following Activity. Include dependent tasks when changed outputs invalidate their work or evidence. Start new Activity attempts when those Activities execute.
3. **Review retained task scopes.** Do a check of each retained task definition, integrated output, relevant input, and evidence binding. Unaffected Activity scopes stay complete under their original attempts. Their records stay linked to the original Implementation attempt. Do not reassign or relabel them. Record why their results are still applicable as inputs to the new unit assessment.
4. **Complete the unit again.** Execute every reopened Activity and obtain its required current-attempt evidence. Do a new unit completion assessment, then execute Unit of Work Review and Deliver again under their applicable contracts.

Implementation corrections start at Code Generation. Invalid Validation proof starts at Code Validation. Integration-only invalidity starts at Code Integration. These are assessment examples. The orchestrator selects the earliest affected boundary from the actual finding.

Keep recorded admission baselines fixed. Identify current task material and changed relevant inputs separately. Apply the normal integration lock and candidate checks when accepting corrected task output.

Reassessment does not replace execution of a reopened Activity or transfer old evidence into its new attempt. Do not reparent historical Activity evidence to a new Implementation attempt. An old unit completion assessment cannot complete the new unit attempt, even when its checkpoint is unchanged.

This rule does not reopen unrelated task scopes automatically. Do not treat earlier completion as valid when its material, inputs, or evidence are invalid.

## Effort

Apply the shared [effort definition](../../effort.md), including the unit default and any explicit Implementation override. Its Activities inherit that effort and have no separate overrides.

| Effort | Implementation guidance |
| --- | --- |
| Minimal | Supply concise task handoffs, necessary implementation rationale, check evidence, findings, and integrated-result references. |
| Standard | Explain important implementation choices, interactions, corrections, and coordination. Link focused supporting detail. |
| Comprehensive | Analyze complex failures, boundary interactions, recovery concerns, and verification limitations in supporting detail. |

Effort does not remove tasks, checks, independent feedback, evidence, or authority requirements. It does not create automatic reviews or select worker topology.

## Agent roles

These role assignments state accepted responsibilities. They do not create agent profiles or adopt existing profiles.

| Role | Agent | Responsibility |
| --- | --- | --- |
| Implementation owner | `kepler-orchestrator` | Coordinate admissions, workers, findings, execution records, completion, and the review handoff. |

The dedicated [Generation](activities/code-generation.md#roles-and-skills), [Validation](activities/code-validation.md#roles-and-skills), and [Integration](activities/code-integration.md#roles-and-skills) Activity contracts state their accepted role assignments.

The MVP uses one orchestrator-controlled subagent model for Implementation. The orchestrator dispatches scoped workers and coordinates Activity handoffs. Workers report facts. They do not have to spawn reviewers or call one another.

Generation and independent non-author Validation use separate worker contexts. This model does not select role profiles or add a per-task topology selector. The MVP execution model does not constrain Design, Quality Requirements, Planning, or other phases.

The requester keeps product and consequential trade-off authority. The shared safeguards govern the orchestrator's revision authority.

## Supporting skills

The accepted entry procedure is:

| Stage | Entry skill | Responsibility |
| --- | --- | --- |
| Implementation | [kepler-orchestrate](../../skills.md#kepler-orchestrate) | Coordinate the unit graph, scoped handoffs, completion evidence, and review handoff. |

The dedicated [Generation](activities/code-generation.md#roles-and-skills), [Validation](activities/code-validation.md#roles-and-skills), and [Integration](activities/code-integration.md#roles-and-skills) Activity contracts state their accepted entry skills.

Self-review belongs in each applicable entry procedure. These assignments do not put current skill implementations or legacy execution records into effect.

Use [kepler-research](../../skills.md#kepler-research) for uncertain facts. Use [kepler-grilling](../../skills.md#kepler-grilling) when a requester decision is necessary to resolve a hard blocker. Supporting work cannot authorize revisions or edit journals directly.

## Review and approval

These review rules are accepted. Required independent Code Validation feedback and the agreed check duties are still binding.

### Self-review

Each Activity contract owns its self-review. The unit owner checks coverage, integrated completion, and handoff completeness.

These checks belong in the entry skills. They do not create separate self-review stages or attempt identities.

### Additional review

Additional external review occurs only when the requester asks for it. This does not make Code Validation's independent feedback or Unit of Work Review optional.

### Requester intervention

Ask the requester for a decision only when a hard blocker prevents further authorized Implementation work. First investigate the issue and use existing contracts, available information, and the orchestrator's authority to resolve it.

A hard blocker exists when agents cannot obtain or resolve necessary information, permission, or a consequential choice within their authority. Agents handle ordinary implementation choices, code defects, failed checks, and review findings when agent-led correction paths can resolve them.

Report the blocked work, the identified cause, attempted alternatives, and the exact requester input needed. Keep affected work. Continue independent ready work while its inputs and contracts are valid. The whole unit does not have to stop because one task is blocked.

Record the requester's decision and affected scope through CLI-owned operations. Resume affected work only after the blocker is resolved and any required revision or permission is in place.

Task acceptance follows successful Code Validation and Code Integration under their contracts, including required checks and evidence. The orchestrator records task completion through authorized CLI operations. Routine requester task approval and separate whole-Implementation approval are not necessary.

A requester decision does not turn failed checks into successful results or waive unresolved stage obligations. Upstream stages keep their own approval rules. Implementation authority does not authorize publication or deployment.

### Reopening questionnaires

Evaluate these stage-specific questions and report the proposed boundary to the orchestrator.

Use the dedicated [Generation](activities/code-generation.md#reopening-questionnaire), [Validation](activities/code-validation.md#reopening-questionnaire), and [Integration](activities/code-integration.md#reopening-questionnaire) questionnaires for those Activities.

#### Implementation

1. Does the integrated result omit required task output or leave an applicable unit obligation unfulfilled?
2. Does evidence fail to show current required task completion or combined-result checks?
3. Does a finding invalidate scheduling assumptions, task contracts, or the selected solution?
4. Does the review handoff misidentify the integrated result, relevant inputs, or unresolved material concerns?

Apply the shared [questionnaire rules](../../revision.md#stage-reopening-questionnaires). Suspected upstream invalidity can move the boundary earlier. Answers do not authorize reopening or exempt downstream stages from a cascade.

A task-local return during active execution follows the agreed return paths. Findings after completed Implementation follow the accepted [scoped-return rule](#return-after-completed-implementation) after the orchestrator authorizes that unit-stage boundary.

## Completion conditions

Complete Implementation only when these conditions and its Activity contracts are satisfied:

- Every task required by the current graph has satisfied its task contract and completed successful Code Integration.
- Code Generation, Code Validation, and Code Integration have their required checks, reviews, and applicable completion evidence.
- Each accepted candidate passed required combined-result checks under the unit lock.
- The final integrated checkpoint set contains the required outputs, and history or integration provenance shows their inclusion in each repository.
- Required combined-result evidence applies to the final integrated material and relevant inputs.
- No blocking finding or unauthorized consequential choice is unresolved.
- No worker is authorized to change the completed execution result under an unfinished task in this execution.
- Unit self-review and any requested additional review are complete, with blocking findings resolved.
- Any requester decisions needed to resolve hard blockers are recorded and their blocking effects are resolved.
- The handoff identifies the complete integrated result, upstream contracts, task provenance, and evidence for Unit of Work Review.

Unrelated workspaces do not have to be clean, and independent units do not have to stop. Whole-unit review and delivery are separate stages.

### Evidence coverage

The accepted [Generation](activities/code-generation.md#evidence-coverage), [Validation](activities/code-validation.md#evidence-coverage), and [Integration](activities/code-integration.md#evidence-coverage) Activity contracts state their named evidence and required results.

The rows below cover the enclosing Implementation stage. Refer to originating Activity records without rebinding their results as unit-attempt results.

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Implementation completion assessment | Final repository-qualified unit checkpoint set, current task graph, upstream obligations, current or retained Activity evidence, and integration provenance. | Required tasks and integrated checks are complete. Reopened Activities have current-attempt evidence. Retained scopes have valid original bindings. Unit self-review states that coverage is complete and the handoff is accurate. |
| Requested additional review result | Material and scope identified by the request, when additional review is requested. | The requested review is complete and its blocking findings are resolved. |
| Requester blocker decision | Blocking issue, affected work, relevant contracts, and required requester input. | Record the requester's actual decision and its scope. Resume affected work only when the blocker is resolved. |

The requester-decision row applies only when requester intervention is necessary for a hard blocker. It is not a routine task-approval record.

Apply the shared [evidence bindings](../../runtime.md#evidence-and-approval-bindings), applicability rules, and retention rules. Keep each check's task or unit scope, attempt, repository-qualified checkpoint set, relevant inputs, conditions, result, and supporting output.

The completion assessment is new unit-scoped work. It consumes Activity evidence without transferring earlier attempts' completion or replacing mandatory Activity checks.

Keep the final integrated checkpoint set and necessary task checkpoint sets, candidate material, logs, and external evidence. A commit identifier or mutable external link alone does not keep them.

Record results through CLI-owned operations. Exact payloads, commands, and status transitions remain implementation work. Apply the accepted [lock and ownership rules](../../runtime.md#short-scoped-coordination) and [Mission coordination paths](../../mission.md#local-storage-and-concurrency). Exact key encodings, owner-record fields, and finer release protocols remain implementation choices under SH64-SH66. This specification does not include those operations.

## Handoff

**Standard workflow next stage:** [Unit of Work Review](unit-of-work-review.md).

Identify the unit directory, current upstream artifacts, final integrated checkpoint set, complete task set, and originating evidence records.

Supply coverage information, integration provenance, relevant environments, resolved findings, and any nonblocking limitations. Explain how the result meets task obligations without claiming whole-unit acceptance.

For optional whole-unit inspection, the [Review package](../../diff-package.md#unit-of-work-review) starts at the original unit Review baseline set captured before first task admission. It ends at the final checkpoint set identified by this Implementation attempt's completion assessment. Keep this baseline distinct from mission startup. Use the assessment and original checkpoint context in the Review handoff. Package availability does not add a Review completion condition.

Unit of Work Review evaluates the complete outcome. Successful task completion does not authorize delivery or waive that review.
