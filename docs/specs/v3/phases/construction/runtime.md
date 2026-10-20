# Construction runtime draft

[Construction catalog](README.md) | [Shared runtime contract](../../runtime.md) | [CLI draft](../../cli.md) | [Authoring progress](../../authoring_progress.md)

**Status:** Draft for discussion. This document proposes Construction state, event, and operation details. The accepted [Mission contract](../../mission.md) owns mission and storage policy. No approval here shows implementation or release.

## Purpose and authority

Construction owns its state model and event catalog under the shared [execution-state rules](../../runtime.md#execution-state-representation). The shared runtime owns the event envelope, attempt boundaries and identities, revision identity, evidence and approval record requirements, portability, concurrency, and retention.

This is not a stage, implementation plan, task graph extension, or separate lifecycle engine. It adds no task attempt, protocol identity, agent role, or public audit kind. The accepted [Implementation](implementation.md), [Activities](activities/README.md), [Standard workflow](../../workflows/standard/README.md), and [task graph](task-graph.md) contracts are still binding.

SH54 accepts the normal-transition operations and selector rule in the [CLI reference](../../cli.md). SH58 accepts pause and resume safety. SH62 accepts simple phase-owned effort events and queries. These decisions do not accept this draft's state names, event names, detailed payload schemas, or extra transition guards.

Apply shared identity and record requirements for evidence and approvals. The [Mission contract](../../mission.md) owns mission and local-runtime paths. This draft adds no requester approval gate. DF14-DF17 accept the labeled rules below, but do not accept the remaining proposal vocabulary or payloads.

## Scope and identity

Keep authored identities separate from execution identities. Store execution facts through CLI-owned journals, not frontmatter, authored status sections, or `tasks-dag.json`. Mission-scoped payloads identify the mission and narrower unit or task scope without changing the ten-field envelope.

| Identity | Scope and meaning |
| --- | --- |
| `unit_id` | One Unit of Work, with its agreed stable identity and directory name. |
| `stage_attempt_id` | One execution of a stage within that unit. Implementation supplies the parent context for task Activities. |
| `task_id` | The authored task's UUIDv4 string. It is not an attempt. |
| Activity occurrence | One Activity definition for one task under one Implementation attempt. |
| `activity_attempt_id` | One execution of that occurrence, bound to its original parent and material. |
| `revision_id` | One authorized revision, under the shared [revision identity](../../runtime.md#revision-decisions). |
| `evidence_id` | One evidence result, separate from event `id`, under the shared [evidence rules](../../runtime.md#evidence-and-approval-bindings). |
| Definition version | Material references identifying the graph and task definition used. Do not add runtime fields to the authored graph. |

Use the shared [attempt identity rules](../../runtime.md#attempt-identity-and-active-scope) for stage and Activity attempt IDs. Admission captures a fixed baseline without creating a task attempt.

Apply the accepted [workflow binding](../../cli.md#workflow-binding). Mission creation records its selected workflow. Construction unit creation records the matching `standard` binding. Later operations and resume use that binding. The event names and payload schemas below remain proposals.

## Proposed derived states

The following vocabulary is a proposal for derived views. SH58 does not select these state names. Journals are authoritative. Projections are disposable.

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

## Accepted task transition rules

Derive these logical rules from existing task, Activity, Integration, evidence, and revision events. This table selects no public state strings, new event types, or event payloads.

| Boundary | Accepted rule |
| --- | --- |
| Admission | Require applicable inputs and satisfied prerequisites. Required predecessor outputs must be integrated. A readiness query does not dispatch work. |
| Activity execution | Use the fixed Code Generation, Code Validation, and Code Integration route. Bind each occurrence to its task and parent Implementation attempt. |
| Waiting or internal correction | Keep the relevant unended attempts. An authorized reexecution starts a new Activity attempt. An Integration-only retry keeps the current Integration attempt. |
| Acceptance | Accept only a current combined candidate that passed required checks under the unit lock. Check current authority and revision state at final acceptance. |
| Task completion | Require accepted Integration and all task conditions. Keep readiness, admission, Activity completion, Integration acceptance, and task completion distinct. Task completion does not complete Implementation or grant approval. |

Do not add a task-attempt identity or a generic status-setting command. Exact event names and the remaining proposed state vocabulary stay implementation details.

## Transition guards and results

These are logical operations, not additional public commands. The [CLI reference](../../cli.md) owns public grammar and the typed-write boundary. SH54 accepts its named normal transitions and existing authority, attempt, evidence, and completion rules. SH58 accepts pause and resume safety. Neither decision selects this draft's state names, event details, or extra transition guards.

| Scope and operation | Guard | Recorded result |
| --- | --- | --- |
| Stage start | Standard authorizes execution. Applicable inputs and authority hold. No attempt is active for the scope. | Start one stage attempt without dispatching an agent automatically. |
| Stage wait | Identify the condition and affected scope. | Record the wait while keeping the attempt. |
| Stage pause | Use exact scope and attempt selectors. Block new affected work. | Acknowledge pause only after workers stop and locks reconcile. Keep the attempt and reservation. |
| Stage resume | Verify the selected attempt's inputs and ownership. | Resume the same attempt without another identity. |
| Stage complete | Its current attempt satisfies the stage's applicable artifacts, evidence, approval, and handoff conditions. | Complete only that stage. |
| Stage reopen | The orchestrator authorizes the boundary and scope under the revision rules. | Invalidate affected completion and end affected attempts. Replacement attempts wait for execution. |
| Task ready | Determine readiness from graph dependencies, integrated predecessor outputs, and known prerequisite facts. | Report readiness and unknown conditions without admission or dispatch. |
| Task admit | Implementation authorizes execution. Required outputs are integrated and applicable prerequisites hold. | Record definition versions, fixed baseline, predecessor provenance, and prerequisite evidence. Create no task attempt or admission commit. |
| Activity start | The task is admitted. The parent authorizes work and the fixed route authorizes this Activity. | Start one distinct Activity attempt when no attempt is active for that occurrence. |
| Activity wait or pause | Use exact scope and attempt selectors. A pause blocks new affected work. | Acknowledge pause only after workers stop and locks reconcile. Keep the attempt and reservation. |
| Activity resume | Verify the selected attempt's inputs and ownership. | Resume the same attempt without another identity. |
| Activity complete | Its required current-attempt evidence and results hold. The parent still authorizes completion. | Complete only that Activity. Integration can complete only after the orchestrator authorizes acceptance of the candidate that passed the checks. |
| Task complete | Applicable Validation and Integration evidence show accepted material that passed the checks and all task conditions. | Record task completion without completing Implementation. |
| Task or Activity return | The orchestrator authorizes correction under the accepted route. | Keep history. Reopened Activities start new attempts only when they execute. |

A pause request and completed-pause acknowledgment are different facts. The request blocks new affected work. Acknowledge pause only after workers stop and locks reconcile. A timeout or absent session does not prove a stop. Unknown worker or lock effects prevent acknowledgment.

Unrelated work continues. Keep attempt IDs and reservations. SH58 does not add public cancellation commands or a worker shutdown framework.

Waiting does not imply that all workers stopped. A command failure, unavailable condition, or wait keeps the applicable unended attempt. Do not add public `wait`, cancel, abandon, or force commands.

## Record model and event catalog

Use the unchanged [ten-field envelope](../../runtime.md#event-envelope-choices). Its fields are `id`, `phase`, `type`, `envelope_version`, `event_version`, `journal_id`, `recorded_at`, `producer`, `caused_by`, and `data`.

The event names, derived states, operation details, and phase-specific payload schemas below are proposals. SH62 accepts phase-owned facts for the unit effort default and explicit stage overrides, with selection attribution where applicable. It also requires queries for the default, overrides, and effective stage levels. Resolve stage override, then unit default, then Standard; Activities inherit their stage. Keep effort out of frontmatter and separate authoritative state files.

SH62 does not select event names, detailed payloads, projection schemas, or one event per field. SH63 carries later structured effort selections in the recorded interaction; it adds no separate effort event.

Apply the shared identity and record requirements for evidence and approval. Under SH84, use existing artifact UUIDs and execution-scope IDs in phase-owned event data. Bind actual content versions or repository checkpoints where the owning contract requires them. Do not require artifact bindings on unrelated events. Keep SH51 reference strings opaque.

Do not infer identity or version from titles, paths, or arbitrary strings. Add no generic relationship graph, registry, edge catalog, or sidecar. Do not add a second `material` array or fields to the shared envelope, frontmatter, or task graph. Bind repository checkpoints to the owning phase's actual work, including workspace bindings, stage outputs, admissions, and Integration results.

| Payload key | Required meaning |
| --- | --- |
| `unit_id` | Required for these unit-scoped Construction facts. |
| `stage` | Required for a stage fact. |
| `stage_attempt_id` | Required for stage-attempt facts and task or Activity execution under Implementation. |
| `task_id` | Required for task and Activity facts. |
| `activity` | Required for Activity facts. Identify the definition within the task and parent context. |
| `activity_attempt_id` | Required for an Activity execution fact. Keep its original parent. |
| `revision_id` | Required for an authorized revision and its related end or reopen facts. |
| `evidence_id` | Required for each evidence result and distinct from event `id`. |
| `graph_ref`, `task_definition_ref` | Required for admission and task-readiness evidence. Identify the actual authored input versions. |
| `checkpoint`, `material_refs` | Identify each repository checkpoint in a covered set and relevant external material. References alone do not keep that material. |
| `reason` | Required for a wait, pause, ending, or authorized revision. |

Use the envelope's `caused_by` for direct causal event IDs. Related revision facts use the shared `revision_id` as a domain identity, not a cause. Do not place another causal predecessor list in `data`.

Stage facts bind their stage and attempt. Task facts bind their task and Implementation attempt. Activity execution facts bind their task, occurrence, Activity attempt, and original enclosing Implementation attempt.

| Proposed event `type` | Required data and binding |
| --- | --- |
| `construction.unit-created` | Mission and unit identities, directory, creation inputs including initial effort, and matching `standard` workflow binding. This proposal requires no linked Effort event or event per field. |
| `construction.unit-baseline-selected` | Original unit Review baseline set, integration targets, and capture before first admission. Keep it across returns. Keep it distinct from the mission starting set. |
| `construction.stage-attempt-started`, `construction.stage-waiting`, `construction.stage-pause-requested`, `construction.stage-paused`, `construction.stage-resumed`, `construction.stage-attempt-completed` | Unit, stage, attempt, actual inputs, applicable reason, and evidence or approvals required by the transition. |
| `construction.stage-attempt-ended-by-revision`, `construction.stage-reopened` | `revision_id`, affected stage, and original attempt when one exists. Reopening alone creates no attempt. |
| `construction.task-admitted` | Unit, Implementation attempt, task, definition references, fixed repository-qualified baseline set, predecessor provenance, and prerequisite evidence. |
| `construction.task-scope-ended-by-revision`, `construction.task-scope-reopened` | Unit, parent attempt, task, `revision_id`, and affected Activity scopes. Keep original admission records. |
| `construction.task-completed` | Unit, parent attempt, task, accepted Integration record, and task conditions that hold. |
| `construction.activity-attempt-started`, `construction.activity-waiting`, `construction.activity-pause-requested`, `construction.activity-paused`, `construction.activity-resumed`, `construction.activity-attempt-completed` | Identify the full Activity execution scope. Include transition reasons, source references, and evidence required for completion. |
| `construction.activity-attempt-ended-by-revision`, `construction.activity-reopened` | Unit, task, Activity occurrence, original parent and attempt, `revision_id`, and affected scope. |
| `construction.evidence-recorded`, `construction.approval-recorded`, `construction.interaction-recorded` | Keep the existing public audit kinds. Apply shared evidence and approval requirements. Bind phase-specific records to their scope, material, inputs, result, and actor or requester. A structured effort selection stays in the same interaction record under SH63. The owning phase validates scope, level, and requester authority. Do not infer selections from text or add a separate effort event. |
| `construction.integration-prepared` | Identify the Integration scope, lock-captured unit checkpoint set, validated task output, other actual inputs, immutable candidate set, and source evidence. Record the fixed admission baseline separately. |
| `construction.integration-accepted` | Prepared candidate set, accepted repository results, actual inputs, successful check evidence, current Integration attempt, and applicable authority references. |
| `construction.revision-authorized` | `revision_id`, orchestrator decision, reason, unit-stage or task-Activity boundary, and supporting findings. |
| `construction.retained-scope-assessed` | Current Implementation attempt and inputs, original scope and attempt references, applicability result, and reason. Keep the original parent and material. |
| `construction.implementation-completion-assessed` | Current Implementation attempt, final repository-qualified checkpoint set, graph, required checks, Integration results, retained-scope assessments, and handoff assessment. |

These event names do not add public audit kinds. Typed lifecycle operations record their own facts without a second caller write. Apply the shared [evidence record minimum](../../runtime.md#evidence-and-approval-bindings) to phase-owned evidence data. It binds `evidence_id`, the actual executor, checked material and relevant inputs, the check or review, its result, retained output references, and conditions.

The CLI's `producer` identifies recording software, not the actual executor or proof of a check. Recording a result does not execute a check, grant approval, or complete work. A recorded failed check remains failed.

Mechanical validation can verify metadata, required sections, links, and graph structure. It cannot replace semantic review or evidence applicability assessment. Existing named stage and Activity evidence remains binding.

## Causality, replay, and reader compatibility

Reference only already recorded direct causes. Causal links complement guards. They cannot show current authority by themselves.

| Current fact | Direct recorded causes |
| --- | --- |
| Initial effort selection | Record initial values with unit creation under SH59. Later changes use the structured selection in the same interaction under SH63, not a linked effort event. |
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

At the first handoff step, apply the [Mission checkpoint preflight](../../mission.md#evidence-transfer-and-recovery). It checks only required commits and objects in their actual repositories. A missing or unreachable object fails the handoff. Do not claim handoff success or resume affected work without required material. Do not automatically publish, pin, create references, fetch, copy material, or make commits to repair failure. Keep the failure scoped and retain available work, history, and evidence.

Validate the records and causal material required by the receiving scope before treating transferred history as usable. Keep received bytes, journal identities, local order, causes, producer values, and original bindings after failed or interrupted imports. Report the failed or uncertain import. Do not claim a completed handoff.

Incomplete, unsupported, or conflicting imports cannot show authoritative current state for scopes they may affect. Block affected state-dependent work until reconciliation shows that the required history is complete. If isolation is unproven, block the larger affected scope. Previously validated history does not prove that missing new control facts cannot change that scope.

Apply the accepted [SH87 journal recovery rules](../../runtime.md#interrupted-event-write-recovery) and existing [coordination contract](../../runtime.md#short-scoped-coordination) to incomplete or conflicting imports. Exact collection and import mechanisms remain implementation work. This rule adds no import or handoff command, publication service, storage transaction, or live synchronization protocol.

## Revision and retained-scope rules

Keep the accepted return cases separate.

| Case | Required treatment |
| --- | --- |
| Planning or earlier revision | Apply the unit-stage cascade and end affected execution attempts. New execution uses revised definitions and new admissions under its new parent. Keep every original admission unchanged. |
| Return during active Implementation | Keep the parent attempt and fixed admission. Reopened Activities execute new attempts. Integration-only retries keep their current Integration attempt. |
| Return after completed Implementation | Start a new parent when execution resumes. Reopen the earliest invalid Activities and following work, including affected dependents. Compare retained-scope evidence with its original bindings. Record whether it still applies. |

A new parent can consume applicable results from an older parent. Retained-input assessments reference those original records. They do not reparent them. Reopened Activities still execute and record fresh evidence. Do a new unit completion assessment, followed by Review and Deliver under their contracts.

Never rewrite an admission baseline during correction. New admissions after an upstream revision are separate records, not edits to old baselines. Keep the original unit baseline used for whole-unit Review across these returns. Apply [IE22](../../authoring_progress.md#completed-implementation-decisions) without transferring prior completion to reopened scopes.

## Dependency invalidation

Use existing task-graph edges and evidence applicability to identify affected dependents. Do not infer dependencies from file conflicts or add a dependency engine.

When an input or predecessor output changes, reassess each dependent against its required inputs and actual material. Block affected work when a required prerequisite is invalid or unknown. Preserve valid work and each original evidence binding. Do not reparent evidence or rewrite admissions or fixed baselines.

The orchestrator authorizes corrections and revisions. Use existing Activity return routes for task-local corrections and the shared revision procedure for upstream changes. Do not start a revision cascade without orchestrator authorization. Unrelated commits alone do not invalidate task work.

An authorized unit-wide upstream revision executes its full required downstream cascade, even when outputs are unchanged. Under IE22, invalidate current completion only for affected work or evidence. Complete Review and Deliver again under their contracts. Keep parent-attempt and retained-scope cases distinct. Independent valid work continues.

## Revision shutdown coordination

Use recorded revision authority and existing short scoped coordination to block affected admissions immediately. Reject completion and Integration acceptance from affected old attempts. Do not wait for a long check to finish before establishing this barrier.

Then stop affected workers and reconcile actual effects and locks before replacement work starts. A timeout or missing session does not prove that a worker stopped. End affected attempts and preserve their history. Start new attempts only on reexecution after required upstream stages complete.

Unknown worker stopping, ownership, or effects block affected restart. Independent valid units continue.

Manual lock removal remains available under SH67 after workers stop and effects reconcile. Do not add automatic takeover, timeout success, kill frameworks, public cancellation or force commands, lock-management commands, or proof protocols.

## Inspection-source facts

Diff packages consume existing facts. They do not create lifecycle authority. Keep [SH101's exact signatures](../../cli.md#kepler-git-diff-package) unchanged.

| Inspection scope | Material producer and required bindings |
| --- | --- |
| Code Validation | Admission and Generation identify the fixed baseline, generated output, task definition, upstream versions, and original Generation attempt. No consuming Validation attempt is required to render the package. |
| Code Integration | The owning Integration operation records its lock-captured unit checkpoint set, validated output, source evidence, and immutable prepared candidate set. Neither another lock operation nor completed Integration is necessary for rendering. |
| Unit of Work Review | The original unit Review baseline set and selected Implementation completion assessment identify the complete range. The assessment identifies the final checkpoint set. A completed Review is not necessary for rendering. |

Package selectors name original producer contexts. Consuming Validation and Review record results under their own attempts. Applicability assessment is necessary before current use of historical inputs. Empty diffs stay valid inspection inputs. Neither a package nor its fingerprint keeps source objects by itself.

## Workspaces and check evidence

Isolate concurrent writers. During Implementation, the orchestrator dispatches workers and keeps Generation and non-author Validation contexts separate. This model does not select execution topology for other stages. The [Mission contract](../../mission.md#workspace-selection-and-preparation) sets startup bindings and isolation policy.

Apply the accepted [Implementation context rules](implementation.md#admission-and-coordination) under SH69. For shared check resources, use the existing task `verification.method` and apply the [SH70 parallel-execution rules](../../runtime.md#parallel-execution). Apply [DF14](../../authoring_progress.md#completed-construction-decisions) for explicit repository-qualified check commands. SH66 continues to set cross-workspace coordination.

Integration reads current unit material only after acquiring its unit lock. Keep that lock through preparation, typechecking, build, full-suite checks, and acceptance. Make sure that the current attempt, revision boundary, authority, actual inputs, and bytes still meet the required conditions before acceptance. Other permitted tasks and units continue.

Task `verification.method` owns planned procedures, setup, fixtures, versions, resources, and isolation. Actual evidence identifies check configuration, executor, commands, conditions, resource versions, results, and retained output. Under [DF14](../../authoring_progress.md#completed-construction-decisions), use repository-native scripts or task targets. Record explicit repository-qualified commands in the existing plan and task verification method. Keep applicable additional checks.

Do not add `verification.environment`, task `coordination`, or dependency-output fields to the graph. A build shows typechecking only when it does that check. Successful process exit alone does not show semantic acceptance or workflow completion.

## Journal, projection, and live coordination boundaries

The [Mission contract](../../mission.md#durable-layout) sets mission journal and local-runtime paths. SH43 still permits disposable projections. This contract selects no persisted views directory or substitute cache tree.

Supported concurrent workspaces must share effective live coordination for the scopes they can mutate. History transfer alone does not show ongoing synchronization or distributed lock ownership. Apply [record portability](../../runtime.md#record-portability) before cross-checkout or cross-machine handoff.

## Writes, partial effects, and safe resumption

Validate scope, authority, current attempts, inputs, and revision state before effects. Apply [SH87](../../runtime.md#interrupted-event-write-recovery) to retries. Keep the original event ID, domain IDs, producer, bindings, and causes. For revisions, retain the authorizing event ID and `revision_id`. This does not define general exactly-once effects or change how callers classify retries.

The shared [short scoped coordination contract](../../runtime.md#short-scoped-coordination) is accepted under SH46 and SH64-SH66. Apply its lock and ownership rules. Exact key encodings, owner-record fields, and finer release protocols remain implementation choices. Follow the accepted [SH87 journal recovery rules](../../runtime.md#interrupted-event-write-recovery). SH67 accepts manual unlock recovery. Do not promise general exactly-once effects.

Keep event-update coordination short and separate from the long unit Integration lock. Coordinate the final attempt guard with candidate acceptance and its recorded result. A concurrent revision must not let an ended worker accept a candidate. Do not hold project-wide coordination through checks.

After interruption, review actual journals, Git refs, candidate material, check output, live ownership, and retained evidence. Reconcile effects before retry. Record recovered facts with their original scope. Ended attempts cannot grant current acceptance or completion. Unknown effects are still unknown. Do not delete material needed to resolve them.

Under SH58, a pause request blocks new affected work before stopping completes. A completed-pause acknowledgment requires stopped workers and reconciled locks. A timeout, absent session, or unknown lock effect does not prove stopping. Resume verifies inputs and ownership while keeping the same attempt and reservations. Unrelated work continues.

## Draft boundaries

Accepted shared runtime, Construction, Standard, and [Mission](../../mission.md) contracts are authoritative. DF14-DF17 accept the rules labeled with those IDs in this draft. Other Construction state, event, and operation details remain proposals.

SH58 accepts pause safety. SH62 accepts minimum effort facts and queries. SH63 accepts structured later selections in existing interaction records. SH64-SH66 accept lock and cross-workspace coordination rules. SH67 accepts manual lock recovery.

DF14-DF17 do not accept the remaining proposed state vocabulary, event catalog, operation details, or payload schemas. This draft does not alter required checks, approval authority, metadata, authored graph fields, the envelope, or diff-package signatures.

Apply the accepted [project selection rules](../../cli.md#project-selection), [scope selectors](../../cli.md#scope-and-selectors), [result envelope](../../cli.md#machine-readable-output), [failure result fields](../../cli.md#failure-and-recovery-rules), [exit-code contract](../../cli.md#exit-codes), and [output stream contract](../../cli.md#output-streams). Apply the accepted [JSON-only result format](../../cli.md#human-output). Apply the accepted [evidence recording interface](../../cli.md#kepler-audit-record-evidence), [audit queries](../../cli.md#kepler-audit-list), and [shared lint interface](../../cli.md#kepler-lint).

Apply the accepted [Construction lint](../../cli.md#kepler-workflow-construction-lint), [UUID](../../cli.md#kepler-uuid), [setup](../../cli.md#kepler-setup), and [Standard binding](../../cli.md#workflow-binding) interfaces. Apply [resource ownership](../../installation.md#agent-resource-ownership) and [intended targets](../../installation.md#intended-targets), without agent certification claims. Other CLI and runtime details remain implementation choices under their owning decisions. No omnibus runtime approval gate or implementation roadmap is introduced.
