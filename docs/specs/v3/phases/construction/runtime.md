# Construction runtime draft

[Construction catalog](README.md) | [Shared runtime contract](../../runtime.md) | [CLI draft](../../cli.md) | [Authoring progress](../../authoring_progress.md)

**Status:** Draft for discussion. This document proposes Construction state and record details. It does not approve those choices or put them into effect.

## Purpose and authority

Construction owns its state model and event catalog under the shared [execution-state rules](../../runtime.md#execution-state-representation). The shared runtime owns the event envelope, portability, evidence bindings, attempt boundaries, concurrency, and retention.

This is not a stage, implementation plan, task graph extension, or separate lifecycle engine. It adds no task attempt, protocol identity, agent role, or public audit kind. The accepted [Implementation](implementation.md), [Activities](activities/README.md), [Standard workflow](../../workflows/standard/README.md), and [task graph](task-graph.md) contracts are still binding.

The proposed names, fields, states, and paths are implementation choices. Writing this draft does not settle those choices or create separate requester approval gates.

## Scope and identity

Keep authored identities separate from execution identities. Store execution facts through CLI-owned journals, not frontmatter, authored status sections, or `tasks-dag.json`.

| Identity | Scope and meaning |
| --- | --- |
| `unit_id` | One Unit of Work, with its agreed stable identity and directory name. |
| `stage_attempt_id` | One execution of a stage within that unit. Implementation supplies the parent context for task Activities. |
| `task_id` | The authored task's UUIDv4 string. It is not an attempt. |
| Activity occurrence | One Activity definition for one task under one Implementation attempt. |
| `activity_attempt_id` | One execution of that occurrence, bound to its original parent and material. |
| Definition version | Material references identifying the graph and task definition used. Do not add runtime fields to the authored graph. |

Attempt ID formats stay under SH47. Admission captures a fixed baseline without creating a task attempt.

## Proposed derived states

The following vocabulary is a proposal for derived views. Journals are authoritative. Projections are disposable.

| Scope | Proposed state | Meaning |
| --- | --- | --- |
| Stage or Activity | `not_started` | No attempt has started for the occurrence. |
| Stage or Activity | `running` | The current attempt is executing. |
| Stage or Activity | `pausing` | An authorized pause request prevents new affected work while existing effects are reconciled. |
| Stage or Activity | `paused` | Required stopping conditions hold. The attempt keeps its identity and active-scope reservation. |
| Stage or Activity | `waiting` | A named prerequisite, decision, resource, or lock prevents the next action. The attempt stays open. |
| Stage or Activity | `completed` | The current attempt satisfies its owning contract. |
| Stage or Activity | `reopened` | Revision invalidated current completion. A replacement attempt starts only when execution starts. |
| Stage or Activity | `ended_by_revision` | A historical attempt ended under authorized revision. Its records are historical. |
| Task | `blocked` | A required dependency or applicable prerequisite is unmet or unestablished. |
| Task | `ready` | Known conditions satisfy the readiness criteria for admission. Readiness does not itself authorize admission or prove external availability. |
| Task | `admitted` | An admission record binds the task to its Implementation context and fixed baseline. |
| Task | `generating`, `validating`, or `integrating` | The named Activity is executing. Derive this from its occurrence and attempt. |
| Task | `waiting` | Its next required action cannot proceed. Keep its admission and unended attempts. |
| Task | `complete` | Successful Integration acceptance and the task's other conditions hold. |
| Task | `reopened` | After an authorized correction, affected Activities must execute again. Never rewrite the recorded admission baseline. |

For active-scope limits, `running`, `pausing`, `paused`, and `waiting` are all unended attempts. Completion and revision ending release that attempt's active reservation. Reopening invalidates completion immediately but creates no replacement attempt before execution.

Readiness, admission, Activity completion, task completion, and unit-stage completion are distinct. None grants requester approval or delivery authority. Failed commands and local corrections alone do not create attempts.

## Transition guards and results

These are proposed logical operations, not additional public commands. The [CLI reference](../../cli.md) owns public grammar and the typed-write boundary.

| Scope and operation | Guard | Recorded result |
| --- | --- | --- |
| Stage start | Standard authorizes execution. Applicable inputs and authority hold. No attempt is active for the scope. | Start one stage attempt without dispatching an agent automatically. |
| Stage wait | Identify the condition and affected scope. | Record the wait while keeping the attempt. |
| Stage pause | Identify the attempt and pause scope. Fence new affected admissions and acceptance before acknowledging a completed pause. | Record the request, reconcile affected workers and locks, then record the paused result. Keep attempts. |
| Stage resume | Select the unended attempt. Make sure earlier workers have stopped and current inputs are valid. | Resume that attempt without another identity. |
| Stage complete | Its current attempt satisfies the stage's applicable artifacts, evidence, approval, and handoff conditions. | Complete only that stage. |
| Stage reopen | The orchestrator authorizes the boundary and scope under the revision rules. | Invalidate affected completion and end affected attempts. Replacement attempts wait for execution. |
| Task ready | Determine readiness from graph dependencies, integrated predecessor outputs, and known prerequisite facts. | Report readiness and unknown conditions without admission or dispatch. |
| Task admit | Implementation authorizes execution. Required outputs are integrated and applicable prerequisites hold. | Record definition versions, fixed baseline, predecessor provenance, and prerequisite evidence. Create no task attempt or admission commit. |
| Activity start | The task is admitted. The parent authorizes work and the fixed route authorizes this Activity. | Start one distinct Activity attempt when no attempt is active for that occurrence. |
| Activity wait or pause | Identify the affected attempt and unmet condition or pause request. | Keep the attempt. A requested pause uses the same request, stopping, and acknowledgment boundary as its parent. |
| Activity resume | Select the same unended attempt. Make sure prior workers have stopped and inputs are valid. | Resume without another attempt. |
| Activity complete | Its required current-attempt evidence and results hold. The parent still authorizes completion. | Complete only that Activity. Integration can complete only after the orchestrator authorizes acceptance of the candidate that passed the checks. |
| Task complete | Applicable Validation and Integration evidence show accepted material that passed the checks and all task conditions. | Record task completion without completing Implementation. |
| Task or Activity return | The orchestrator authorizes correction under the accepted route. | Keep history. Reopened Activities start new attempts only when they execute. |

Pause requests and paused acknowledgments are distinct proposed facts. A request blocks new affected work before worker stopping finishes. Unknown stopping effects prevent a successful paused acknowledgment. Independent unaffected scopes continue. These details are proposals under SH54 and SH58, not previously agreed cancellation semantics.

Waiting does not imply that all workers stopped. A command failure, unavailable condition, or wait keeps the applicable unended attempt. Do not add public `wait`, cancel, abandon, or force commands.

## Record model and event catalog

Use the unchanged [ten-field envelope](../../runtime.md#event-envelope-choices). Its fields are `id`, `phase`, `type`, `envelope_version`, `event_version`, `journal_id`, `recorded_at`, `producer`, `caused_by`, and `data`.

The following payload keys and version-one event names are proposals. Record only fields that identify the fact and its bindings.

| Payload key | Required meaning |
| --- | --- |
| `unit_id` | Required for these unit-scoped Construction facts. |
| `stage` | Required for a stage fact. |
| `stage_attempt_id` | Required for stage-attempt facts and task or Activity execution under Implementation. |
| `task_id` | Required for task and Activity facts. |
| `activity` | Required for Activity facts. Identify the definition within the task and parent context. |
| `activity_attempt_id` | Required for an Activity execution fact. Keep its original parent. |
| `graph_ref`, `task_definition_ref` | Required for admission and task-readiness evidence. Identify the actual authored input versions. |
| `checkpoint`, `material_refs` | Identify actual covered repository and external material. References alone do not keep that material. |
| `reason` | Required for a wait, pause, ending, or authorized revision. |

Use the envelope's `caused_by` for direct recorded causes. Do not place another causal predecessor list in `data`.

Stage facts bind their stage and attempt. Task facts bind their task and Implementation attempt. Activity execution facts bind their task, occurrence, Activity attempt, and original enclosing Implementation attempt.

| Proposed event `type` | Required data and binding |
| --- | --- |
| `construction.unit-created` | Unit identity, directory, and creation inputs. Record initial Effort through its linked selection fact. |
| `construction.unit-baseline-selected` | Unit, integration target, initial checkpoint, and capture before first admission. Keep this original unit baseline across returns. |
| `construction.unit-effort-selected` | Unit, selected level, prior value when changed, and requester decision reference. |
| `construction.stage-effort-selected` | Unit, stage, selected override, and requester decision reference. Activities inherit the stage's Effort. |
| `construction.stage-attempt-started`, `construction.stage-waiting`, `construction.stage-pause-requested`, `construction.stage-paused`, `construction.stage-resumed`, `construction.stage-attempt-completed` | Unit, stage, attempt, actual inputs, applicable reason, and evidence or approvals required by the transition. |
| `construction.stage-attempt-ended-by-revision`, `construction.stage-reopened` | Authorized revision, affected stage, and original attempt when one exists. Reopening alone creates no attempt. |
| `construction.task-admitted` | Unit, Implementation attempt, task, definition references, fixed baseline, predecessor provenance, and prerequisite evidence. |
| `construction.task-scope-ended-by-revision`, `construction.task-scope-reopened` | Unit, parent attempt, task, authorized revision, and affected Activity scopes. Keep original admission records. |
| `construction.task-completed` | Unit, parent attempt, task, accepted Integration record, and task conditions that hold. |
| `construction.activity-attempt-started`, `construction.activity-waiting`, `construction.activity-pause-requested`, `construction.activity-paused`, `construction.activity-resumed`, `construction.activity-attempt-completed` | Identify the full Activity execution scope. Include transition reasons, source references, and evidence required for completion. |
| `construction.activity-attempt-ended-by-revision`, `construction.activity-reopened` | Unit, task, Activity occurrence, original parent and attempt, revision, and affected scope. |
| `construction.evidence-recorded`, `construction.approval-recorded`, `construction.interaction-recorded` | Keep the existing public audit kinds. Bind phase-specific records to their scope, material, inputs, result, and actor or requester. |
| `construction.integration-prepared` | Identify the Integration scope, lock-captured unit checkpoint, validated task output, other actual inputs, immutable candidate, and source evidence. Record the fixed admission baseline separately. |
| `construction.integration-accepted` | Prepared candidate, accepted checkpoint, actual inputs, successful check evidence, current Integration attempt, and applicable authority references. |
| `construction.revision-authorized` | Orchestrator decision, reason, unit-stage or task-Activity boundary, and supporting findings. |
| `construction.retained-scope-assessed` | Current Implementation attempt and inputs, original scope and attempt references, applicability result, and reason. Keep the original parent and material. |
| `construction.implementation-completion-assessed` | Current Implementation attempt, final checkpoint, graph, required checks, Integration results, retained-scope assessments, and handoff assessment. |

These event names do not add public audit kinds. Typed lifecycle operations record their own facts without a second caller write. The CLI's `producer` identifies recording software, not proof that it executed a check. Evidence identifies the actual executor, covered material, relevant inputs, conditions, result, and retained output.

Mechanical validation can verify metadata, required sections, links, and graph structure. It cannot replace semantic review or evidence applicability assessment. Existing named stage and Activity evidence remains binding.

## Causality, replay, and reader compatibility

Reference only already recorded direct causes. Causal links complement guards. They cannot show current authority by themselves.

| Current fact | Direct recorded causes |
| --- | --- |
| Initial Effort selection | Unit creation and applicable requester decision. |
| Task admission | Current Implementation start, baseline selection, required predecessor acceptances, and prerequisite evidence. |
| Activity start | Its admission or applicable retained-input assessment, plus preceding completion or authorized return. |
| Stage or Activity completion | Its current attempt start and the required evidence and approval records. |
| Integration preparation | Integration attempt, source admission or retained assessment, validated output, and captured actual input records. |
| Integration acceptance | Preparation and successful check evidence, with applicable prior authority and control records. Never reference the acceptance itself. |
| Revision authorization | Recorded findings or interactions that form the basis for the orchestrator's decision. |
| Scope ending or reopening | Prior revision authorization and the affected existing scope or attempt records. |
| Retained-scope assessment | Current Implementation start and original results being assessed. |
| Unit completion assessment | Current Implementation start, accepted Integration records, and retained-scope assessments. |

Keep each journal's local order. Do not infer global order from timestamps. Stable event IDs detect duplicates. Equal IDs with contradictory content are conflicts, not duplicates. Do not persist numeric positions, allocate sequence counters, or relabel old records.

### Proposed projection derivation

1. Select the explicit project, unit, and requested scope.
2. Load relevant phase journals while keeping their local order.
3. Validate supported envelopes and event types before using their contents.
4. Detect duplicate identities and conflicting records.
5. Resolve causes and material required for the requested view.
6. Apply the owning guards, active-scope limits, revision rules, and evidence bindings.
7. Derive the requested state and supporting references without creating work or ownership.
8. Report unknown or conflicting history. Continue other scopes only when isolation is proved safe.

An unsupported envelope, event version, or required event type must not disappear from authoritative history. Keep its bytes and report the unsupported input. Block affected work when state is unknown. If scope isolation cannot be proved, block the larger affected scope. Do not coerce records or invent migration adapters.

Replay does not execute checks, recreate approval, dispatch workers, restore locks, or resume work. A projection cannot replace required evidence or accessible material.

### History collection and import

Validate the records and causal material required by the receiving scope before treating transferred history as usable. Keep received bytes, journal identities, local order, causes, producer values, and original bindings after failed or interrupted imports. Report the failed or uncertain import. Do not claim a completed handoff.

Incomplete, unsupported, or conflicting imports cannot show authoritative current state for scopes they may affect. Block affected state-dependent work until reconciliation shows that the required history is complete. If isolation is unproven, block the larger affected scope. Previously validated history does not prove that missing new control facts cannot change that scope.

Collection and interrupted-import mechanics are still under SH46 and SH87. This rule adds no import command, storage transaction, or live synchronization protocol.

## Revision and retained-scope rules

Keep the accepted return cases separate.

| Case | Required treatment |
| --- | --- |
| Planning or earlier revision | Apply the unit-stage cascade and end affected execution attempts. New execution uses revised definitions and new admissions under its new parent. Keep every original admission unchanged. |
| Return during active Implementation | Keep the parent attempt and fixed admission. Reopened Activities execute new attempts. Integration-only retries keep their current Integration attempt. |
| Return after completed Implementation | Start a new parent when execution resumes. Reopen the earliest invalid Activities and following work, including affected dependents. Compare retained-scope evidence with its original bindings. Record whether it still applies. |

A new parent can consume applicable results from an older parent. Retained-input assessments reference those original records. They do not reparent them. Reopened Activities still execute and record fresh evidence. Do a new unit completion assessment, followed by Review and Deliver under their contracts.

Never rewrite an admission baseline during correction. New admissions after an upstream revision are separate records, not edits to old baselines. Keep the original unit baseline used for whole-unit Review across these returns. Apply [IE22](../../authoring_progress.md#completed-implementation-decisions) without transferring prior completion to reopened scopes.

## Inspection-source facts

Diff packages consume existing facts. They do not create lifecycle authority. Keep [SH101's exact signatures](../../cli.md#kepler-git-diff-package) unchanged.

| Inspection scope | Material producer and required bindings |
| --- | --- |
| Code Validation | Admission and Generation identify the fixed baseline, generated output, task definition, upstream versions, and original Generation attempt. No consuming Validation attempt is required to render the package. |
| Code Integration | The owning Integration operation records its lock-captured unit checkpoint, validated output, source evidence, and immutable prepared candidate. Neither another lock operation nor completed Integration is necessary for rendering. |
| Unit of Work Review | Original unit baseline and the selected Implementation completion assessment identify the complete range. The assessment identifies the final checkpoint. A completed Review is not necessary for rendering. |

Package selectors name original producer contexts. Consuming Validation and Review record results under their own attempts. Applicability assessment is necessary before current use of historical inputs. Empty diffs stay valid inspection inputs. Neither a package nor its fingerprint keeps source objects by itself.

## Workspaces and check evidence

Isolate concurrent writers. During Implementation, the orchestrator dispatches workers and keeps Generation and non-author Validation contexts separate. This model does not select execution topology for other stages. Workspace and branch naming are SH68 and SH69 choices.

Integration reads current unit material only after acquiring its unit lock. Keep that lock through preparation, typechecking, build, full-suite checks, and acceptance. Make sure that the current attempt, revision boundary, authority, actual inputs, and bytes still meet the required conditions before acceptance. Other permitted tasks and units continue.

Task `verification.method` owns planned procedures, setup, fixtures, versions, resources, and isolation. Actual evidence identifies check configuration, executor, commands, conditions, resource versions, results, and retained output. Project-specific check configuration is still DF14. Keep applicable additional checks.

Do not add `verification.environment`, task `coordination`, or dependency-output fields to the graph. A build shows typechecking only when it does that check. Successful process exit alone does not show semantic acceptance or workflow completion.

## Journal, projection, and live coordination proposal

SH45 owns exact storage paths. This layout is a proposal:

| Data | Proposed location and rule |
| --- | --- |
| Versioned history | `.kepler/history/construction/<journal-id>.jsonl`. Keep each origin and local order. Separate writer journals are still permitted. |
| Disposable projections | `<git-common-directory>/kepler/construction/views/`. Rebuild from history without treating cached state as authority. |
| Local live coordination | `<git-common-directory>/kepler/construction/coordination/`. Keep process ownership and locks unversioned. |

Supported concurrent workspaces must share effective live coordination for the scopes they can mutate. History transfer alone does not show ongoing synchronization or distributed lock ownership. Apply [record portability](../../runtime.md#record-portability) before cross-checkout or cross-machine handoff.

## Writes, partial effects, and safe resumption

Validate scope, authority, current attempts, inputs, and revision state before effects. Durable appends and retries keep stable event identities. Exact mechanisms are still SH46, SH64-SH67, and SH87 choices. Do not promise general exactly-once execution.

Keep event-update coordination short and separate from the long unit Integration lock. Coordinate the final attempt guard with candidate acceptance and its recorded result. A concurrent revision must not let an ended worker accept a candidate. Do not hold project-wide coordination through checks.

After interruption, review actual journals, Git refs, candidate material, check output, live ownership, and retained evidence. Reconcile effects before retry. Record recovered facts with their original scope. Ended attempts cannot grant current acceptance or completion. Unknown effects are still unknown. Do not delete material needed to resolve them.

The proposed pause request fences new affected work before stopping completes. A successful paused acknowledgment is valid only when workers have stopped and locks are reconciled. Resume only after earlier workers have stopped and inputs are valid. Keep attempt identities. A timeout alone proves neither shutdown nor permission to take over a lock.

## Draft boundaries

Accepted shared runtime, Construction, and Standard contracts are authoritative. This draft proposes state, event, pause, and path details. It does not alter required checks, approval authority, metadata, authored graph fields, the envelope, or diff-package signatures.

Apply the accepted [project selection rules](../../cli.md#project-selection), [scope selectors](../../cli.md#scope-and-selectors), [result envelope](../../cli.md#machine-readable-output), [failure result fields](../../cli.md#failure-and-recovery-rules), [exit-code contract](../../cli.md#exit-codes), and [output stream contract](../../cli.md#output-streams). Apply [MVP result formatting](../../cli.md#human-output). Apply the accepted [evidence recording interface](../../cli.md#kepler-audit-record-evidence), [audit queries](../../cli.md#kepler-audit-list), and [shared lint interface](../../cli.md#kepler-lint). Other CLI details stay tracked under SH112-SH115 and SH117. Certified host and platform support is an open question under [SH116](../../authoring_progress.md#mvp-decisions). No omnibus runtime approval gate or implementation roadmap is introduced.
