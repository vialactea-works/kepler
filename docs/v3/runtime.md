# CLI infrastructure

[Workflow phase index](README.md)

## Purpose

Record decisions about the Kepler CLI, structured persistence, and audit system.

The persistence responsibilities, event envelope, event-derived execution state, attempt boundaries, evidence bindings, and parallel checkpoint rules are agreed. Phase-owned projections, paths, commands, and write protocols remain under design. This document does not implement CLI behavior or migrate existing data.

## Data responsibilities

| Data | Representation | Responsibility |
| --- | --- | --- |
| Artifact metadata | Frontmatter on Markdown artifacts; JSON artifact representation follows its own contract. | For Markdown, record identity, classification, ownership, schema version, and author under the shared [metadata contract](metadata.md). JSON metadata follows its own artifact contract. |
| Authored content | Markdown artifact bodies and authored JSON task graphs. | Define purpose, scope, requirements, design, plans, and supporting evidence. |
| Execution state | Derived phase-owned views, queried through the `kepler` CLI. | Represent current progress, attempts, approvals, and changing settings from each phase's journals. |
| Audit history | Authoritative append-only structured JSON event journals, recorded through CLI-owned operations. | Preserve lifecycle facts, decisions, settings, revisions, approvals, and evidence bindings needed to derive execution state. |

## Rules

### Artifact metadata

Keep artifact metadata separate from execution state. Mostly immutable does not mean that every field can never change. Follow the shared [metadata change rules](metadata.md#metadata-changes).

For Markdown artifacts, use the shared [common fields](metadata.md#common-fields): `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels`. The metadata contract defines their meanings and when they are required. Apply its [field validation rules](metadata.md#field-validation). Validation is read-only: report invalid names or values and preserve content for correction. Do not convert value types or generate missing values during validation. Creation operations can populate fields explicitly. Stage-specific fields remain undecided.

For Markdown artifacts, apply the shared [schema-version rules](metadata.md#schema-version). Report unsupported schema versions and leave those artifacts unchanged. JSON artifact metadata and schema identification follow the JSON artifact's own contract. Do not migrate data automatically. The migration procedure remains deferred under DF05.

Do not store progress, completion flags, current attempts, approvals, pause checkpoints, or changing execution settings in authored artifacts. This includes Markdown frontmatter, Markdown status sections, and `tasks-dag.json`.

Construction records technical rationale in `plan.md` and the task graph in `tasks-dag.json`. Both are authored content. Task graphs use the [Kepler JSON format](phases/construction/task-graph.md), including its UUID identities and independent format version. Execution progress is derived from event journals, not Markdown checkboxes or task-graph status fields.

### Execution state

Agents and skills must use the `kepler` CLI to query execution state and record workflow events. They must not edit event journals or projections directly.

#### Execution-state representation

Workflow execution state is derived from phase-owned event journals. No independently authoritative state files are required. Each phase owns its state model and projection schemas. Materialized views are disposable.

The journals are the persisted source of workflow truth. This replaces the earlier state-plus-audit representation; state files cannot remain a second authority.

Each phase is a bounded context. Shared tracking mechanics do not impose Construction's unit/task hierarchy or status vocabulary on other phases. Agent scopes follow the owning phase and stage contracts; not all agents are task-scoped.

The CLI can calculate views directly or use rebuildable projections. Rebuilding a projection does not rerun work or create approvals. A projection does not replace retained evidence or checks against actual work.

This representation does not require one shared journal or a global total order. The [event envelope](#event-envelope-choices) is agreed. Exact type definitions and the event catalog belong to implementation. Journal layout, collection, and write protocols remain separate decisions.

Record the unit effort default and explicit stage overrides as journal events through the CLI. Derive their current values from those events. Their selection and approval rules remain in the shared [Effort definition](effort.md).

Record requester approvals and their reviewed-material bindings as journal events through the CLI. Approval views are derived from those events. A frontmatter flag, an existing artifact, or a Git commit does not establish approval or completion.

Markdown views can present execution state, but they remain derived views, not authoritative records. The authoring progress file tracks specification work, not Unit of Work execution.

### Stage attempts

A stage attempt is one execution of a stage within the scope defined by its phase contract. It includes the stage's internal correction loops.

Construction uses unit-scoped stage attempts. Implementation coordinates its Activity attempts under one unit-scoped attempt. Other phases define their own execution scopes.

- Create a stage attempt when the stage starts for the first time.
- Self-review and repeated edits after failed checks keep the same attempt while corrections remain within that stage.
- A stage report or revision recommendation does not create a new attempt.
- Create a new attempt when a stage executes again after reopening authorized by the orchestrator.
- Apply this rule to every stage in the authorized revision cascade when each stage executes again.
- Pauses, resumes, and new agent sessions keep the same attempt.
- A failed command alone does not create a new attempt.
- Link the stage's named evidence and any required approvals to the stage attempt.
- Keep previous attempts as history. Their completion does not establish completion of the current attempt.

Suspected upstream problems follow the shared [revision authority and escalation rules](revision.md#authority-and-escalation). Stage and Activity workers report findings and proposed boundaries. The orchestrator decides whether to authorize reopening and where to start.

#### Attempt identity and active scope

Give each attempt a distinct identity. A new attempt must not reuse a previous attempt's identity. Git checkpoint reuse does not change this rule.

For Construction, allow zero or one active attempt for each fixed unit/stage scope. Apply the separate one-active-attempt limit to each fixed Activity occurrence under [Activity attempts](#activity-attempts). Different task and unit scopes can progress concurrently when the accepted dependency graph and stage order permit it.

For this limit, active means started and not ended. Paused attempts and attempts waiting for review or approval still occupy their scope. Resuming work keeps the existing attempt identity.

Preserve each limit under concurrent start or resume requests. Two requests for the same scope must not create two active attempts. Coordination must not become a global Git gate for unrelated scopes.

This constraint does not require every task to execute every Activity. Phase and stage contracts define the applicable scopes.

Construction defines its [Implementation structure](phases/construction/README.md#implementation). Record the relationship between its unit-scoped stage attempt and each Activity attempt through the shared journal mechanics. Derive relationship views from those events.

Task implementation and Task coding are execution contexts, not additional attempt identities. Do not infer Construction's Activity structure for other phases.

Attempt ID formats, status values, and exact coordination and binding record formats require further decisions.

### Activity attempts

An Activity attempt is one execution of an Activity occurrence within an enclosing stage attempt. Bind it to that occurrence and the enclosing attempt. The stage attempt supplies coordination context; it does not replace the Activity attempt.

Each Activity attempt has a distinct identity and its own run floor. Allow at most one active attempt for a fixed Activity occurrence. An authorized return creates a new attempt when the Activity executes again.

Failed commands, local corrections within the current Activity, waits, pauses, resumes, and new sessions do not create another attempt. An Integration-only retry stays within its current Code Integration attempt.

Keep Activity evidence under the Activity's own contract and attempt. Keep enclosing stage evidence under the stage contract and attempt. Shared scope and material bindings do not replace either contract.

When an upstream revision ends the enclosing stage attempt, end its affected Activity attempts. Do not move historical Activity evidence to a new stage attempt. Ended Activity results cannot complete or cancel newer work, even if candidate bytes and the enclosing stage attempt remain unchanged.

Use shared CLI-owned journals and operations for Activity attempts and evidence. Do not add a second lifecycle engine or a task-coding or protocol-run attempt identity. Activity event payloads, ID formats, commands, and projections remain implementation choices under the unchanged [event envelope](#event-envelope-choices).

### Run floor

Use the applicable attempt identity as the run floor for its scope. The run floor is not a separate identifier.

Earlier-attempt evidence and approvals cannot establish completion of the current attempt in that scope. Late results retain their original attempt binding. They must not change a newer attempt's progress or establish its completion, even when the Git checkpoint matches.

Pauses, resumes, and internal correction loops retain the same run floor. Progress in other scopes does not change it. This contract does not define an additional verification-round boundary within an attempt.

Attempt binding and [evidence applicability](#evidence-applicability) are separate checks. A matching attempt identity does not establish that evidence covers the required material and relevant inputs. Stage and Activity completion conditions and revision authority still apply.

### Interrupted-work recovery

Resume from CLI-recorded progress after checking the actual work and evidence. Preserve unfinished work and continue the same attempt if it has not ended. Confirm that no previous worker is still changing the same work. Repeat work only where results are missing or no longer valid. Resolve conflicting records before resuming the affected work.

Use the existing [revision procedure](revision.md#revision-procedure) when upstream contracts are invalid. Independent work can continue while its inputs and contracts remain valid.

This rule does not define lock recovery or repair of interrupted state writes.

### Revision decisions

Follow the shared [Revision procedure](revision.md#revision-procedure). A stage's proposed boundary does not authorize reopening or a revision cascade.

Record the orchestrator's decision and reason through the CLI. Include the selected execution scope and starting stage. Retain those facts in the phase's append-only event journals. Derive current execution state from the recorded decision. CLI-owned operations record the events; agents must not write them separately.

Follow Construction's [unit-wide upstream revision rules](phases/construction/README.md#unit-wide-upstream-revision). Record the end of affected Implementation and Activity attempts through CLI-owned journal events. Derive current attempt views from those events. Start new attempts only when their stage or Activity executes again.

Phase-owned projection fields and detailed revision arguments remain undecided. The [CLI command reference](cli.md#revision-operation) records the agreed `revise` placement. The implementation defines revision event types and payload schemas within the agreed [event envelope](#event-envelope-choices).

### Audit ownership

CLI-owned application operations validate workflow transitions and record the resulting structured events. Current execution state is derived from those events. Callers must not append duplicate lifecycle records after an operation or write event records by hand.

The journals retain earlier events when work is revised or approved again. Rebuildable views reflect recorded history; they do not become an independent workflow authority.

The CLI records the requester's approval. It does not replace the requester as the approval authority.

## Event envelope choices

These choices define the approved shared event envelope. All fields in the following table are required.

| Field | Purpose |
| --- | --- |
| `id` | Stable event identity. |
| `phase` | Owning workflow phase. |
| `type` | The recorded fact, defined by its owning phase. |
| `envelope_version` | Version of the shared envelope. |
| `event_version` | Version of the phase-owned event payload. |
| `journal_id` | Originating journal identity. |
| `recorded_at` | Event recording time. |
| `producer` | Original recording software identity. |
| `caused_by` | Direct causal event references. Use `[]` when there are none. |
| `data` | Phase-owned event payload. |

Envelope and event versions are separate from artifact frontmatter versions. Exact type definitions and the event catalog are implementation work, not pending specification decisions.

### Recording timestamp

Use RFC3339 in UTC with a literal `Z` suffix for `recorded_at`. For example, `2026-10-18T14:30:00Z`. Do not use `+00:00` or another offset representation.

### Producer identity

Use `producer` to identify the software that originally recorded the event. The CLI supplies an object with these values:

| Field | Value |
| --- | --- |
| `name` | `kepler` |
| `version` | The actual version of the CLI that recorded the event. |

Use this information to investigate recorded events. Imported events retain their original producer values. The importing CLI must not replace those values with its own identity.

The field does not identify the requester, agent, model, or host. Record required actor identities in the phase-owned event data. Producer values do not prove approval or authorize a transition.

### Causal references

Use `caused_by`, not `causes`, for the required list of direct causal event IDs. Use `[]` when no recorded causal predecessor exists. The references point from the current event to its causes. Each phase's implementation defines its event catalog and required causal references.

An event can have several direct causes. Referenced events can belong to other journals. Do not repeat indirect ancestors solely to reconstruct the causal chain.

A timestamp alone does not establish causality. Causal references do not replace attempt or material bindings. They do not prove that a transition was valid.

Workers can receive applicable event IDs with their assignments. This does not require workers to inspect global history.

### Journal identity and order

Keep `journal_id` as the event's originating journal identity. Use stable event IDs to detect duplicates.

Do not persist a numeric `position` field or allocate a separate sequence counter. Local order is the order of events stored in each journal. Collection must preserve the original journals or their relative event order. Do not flatten and reorder history by timestamp while discarding local journal order.

Use `caused_by` for explicit causal references across journals. Local order does not resolve conflicting control decisions. Apply the existing transition, attempt, evidence, and approval rules.

The protocols for safe appends, retries, interrupted writes, and collection remain undecided. This choice does not establish a physical storage layout or a global total order.

## Evidence and content checkpoints

### Concepts

| Concept | Meaning |
| --- | --- |
| Stage attempt | One execution of a stage, including its internal correction loops. |
| Activity attempt | One execution of an Activity occurrence within an enclosing stage attempt. |
| Git checkpoint | A commit that identifies a multi-file repository snapshot. |
| Evidence | A recorded check or review result concerning specified material and relevant conditions. |
| Approval | The requester's explicit acceptance of specified material. |

Attempt identity is separate from commit identity. An attempt can reference several checkpoints. Different attempts can reference the same checkpoint.

A commit identifies content. It does not establish that checks passed or that the requester approved the work.

### Material references

Material is anything relevant to a check, review, or approval. Its types are open-ended. The examples below do not restrict the allowed types.

A Git checkpoint identifies repository material. An evidence record can reference other material alongside it.

| Example | Possible reference |
| --- | --- |
| Code, tests, configuration, or authored documents | Repository, checkpoint commit, and material covered. |
| MR or PR | Platform identifier, reviewed commit, and relevant review content. |
| CI pipeline | Pipeline, job, and execution identifiers, plus the content actually tested. |
| Container image | Image digest, with its tag as an additional label. |
| Local or external logs | Retrieval location and a retained copy, object version, or content digest. |

A mutable URL or tag alone may not identify what was examined. Where necessary, retain the relevant content or reference an immutable version.

### Evidence and approval bindings

Each evidence record identifies:

- Its owning phase and applicable stage, Activity, and attempt scope. In Construction, include the unit and task when applicable.
- The material checked and relevant inputs.
- The repository and checkpoint commit for repository material, with appropriate references for other material.
- The check or review performed, its result, and supporting output.
- Relevant external conditions, such as the database version.

An approval identifies the requester, applicable attempt, and material approved. Include the checkpoint and other material references that identify what the requester reviewed.

Applicable contracts determine the required scope. The material covered is not limited to files changed by one worker.

Workflow progress and audit records are separate from the material checked, unless a check explicitly covers them.

Record bindings through CLI-owned JSON journal events, not artifact frontmatter. Derive current binding views from the recorded events. For repository material, the output commit must exist before approval is recorded. Record approval afterwards, referencing that commit and the other reviewed material.

### Repository checkpoint procedure

Use this procedure when evidence covers repository material.

1. **Record the starting checkpoint.** Reuse an existing commit when it represents the required starting state. Task baselines follow the admission rules below.
2. **Perform the work.** Edit and perform trial checks within the owning stage's or Activity's responsibilities. Internal correction loops do not require a commit for each action.
3. **Prepare the output checkpoint.** Create a checkpoint in the work's own workspace when ready. Include the repository material that the required checks will cover.
4. **Check the checkpoint.** Run required final checks against that snapshot and record their results. Apply the shared attempt and revision rules when corrections are needed.
5. **Obtain required approval.** Bind approval to the reviewed material and checkpoint. Complete the stage or Activity only after its completion conditions are satisfied.

The checked material must match the checkpoint. Relevant uncommitted or untracked inputs cannot be silently treated as committed content.

Reuse existing commits when appropriate. If the material is unchanged, starting and output references can identify the same commit. No new commit is required solely for attempt identity, task admission, or progress recording.

### Evidence applicability

A different commit identifier does not automatically make evidence stale. An audit-only commit can leave all application code and configuration unchanged.

Within the applicable attempt, earlier evidence can remain usable after verifying that its covered material and relevant inputs remain unchanged. Retain the record's original checkpoint and context references. If those inputs changed, obtain evidence covering the changed material.

After an authorized revision, identical content does not transfer previous completion into the new attempt. Execute the reopened stage or Activity and satisfy its conditions again.

A material mismatch does not authorize a revision cascade. Report suspected upstream problems under the shared [revision authority rules](revision.md#authority-and-escalation).

## Parallel execution

In Construction, dependency-ready tasks and independent units can run concurrently. Unit-scoped stages follow the selected workflow's order. Apply the fixed [Activity order](phases/construction/README.md#implementation) within each task, not across different tasks. Activity feedback routes do not add or change task dependency edges. Other phases define their own execution relationships.

Starting tasks and recording progress must not depend on shared admission commits or a global coordinator `HEAD`. Independent work must not require unrelated workspaces to become clean or stop progressing.

Each task records its actual starting inputs. Running tasks do not need to match a changing coordinator `HEAD`.

Workflow event writes and derived views must support concurrent work. Keep event-update coordination short. Test resources need isolation where concurrent runs could interfere.

Construction's [integration lock](phases/construction/README.md#integration-order-and-locking) serializes Code Integration within each unit. Hold that lock through reading the current checkpoint, candidate preparation, checks, and acceptance. This lock can cover long-running checks; it is not a global agent, task admission, or test gate.

Separate unit integration workspaces and isolated workspaces for concurrent writers are one possible arrangement. Exact workspace and branch layouts remain undecided.

### Task admission and baselines

Admission is the start boundary for selecting a task's baseline.

1. **Check readiness.** Confirm that the plan permits execution and all required predecessor outputs are available in the unit's integrated state.
2. **Select the baseline.** Capture the current integration commit for that unit at admission. It must include all required predecessor outputs. Record that checkpoint as the task's starting baseline.
3. **Keep the recorded baseline.** Once admitted, the task keeps that baseline. Later commits alone do not invalidate it or force it to restart. Assess evidence applicability from its covered material and relevant inputs.

Use Git history or recorded integration provenance to establish inclusion of predecessor outputs. A later commit timestamp alone does not establish inclusion.

Use the unit's integration branch, not a global coordinator `HEAD`. Admission does not require creating another commit. Do not return to an older predecessor checkpoint when newer integrated unit work exists at admission.

#### Example

This example is illustrative. `C1` and `C2` are commit labels, not identifier formats.

1. Tasks 1 and 2 run in parallel.
2. Task 1 finishes and its output is integrated into `C1`.
3. Task 2 finishes and its output is integrated into `C2`, which also contains Task 1's output.
4. Task 3 depends only on Task 1 and is admitted after both integrations. It starts from `C2`, not `C1`.

### Integration and verification

Task outputs can have separate checkpoints. Results for those checkpoints do not establish that their combined result works.

Construction's [Code Integration Activity](phases/construction/activities/code-integration.md#integration-procedure) follows prepare, check, then accept under the unit's integration lock. Read the current checkpoint after acquiring the lock. Check the combined candidate before it becomes the unit's integrated state. Run typechecking, the project build, and the full application test suite against that candidate while holding the lock. All three must succeed before authorized acceptance. Record actual Integration inputs separately from the fixed admission baseline. Task completion requires successful acceptance and the applicable completion conditions.

Code Validation runs typechecking, the project build, and the full application test suite, and owns independent non-author feedback. The [Construction contract](phases/construction/README.md#agreed-boundaries) defines these duties. Integration checks do not replace them. A build result establishes typechecking only when the command also performs the required typechecking. Any additional integration checks and project-specific check configuration require separate decisions.

A conflict can block the affected integration. Unrelated ready tasks and units continue. Report suspected upstream problems to the orchestrator; Integration does not authorize a cascade.

## Stage and Activity evidence

Stage and Activity contracts define their named evidence, covered material, and required results. Shared bindings do not replace those definitions.

The accepted [Generation](phases/construction/activities/code-generation.md#evidence-coverage), [Validation](phases/construction/activities/code-validation.md#evidence-coverage), and [Integration](phases/construction/activities/code-integration.md#evidence-coverage) Activity contracts define Activity evidence. The accepted [Implementation contract](phases/construction/implementation.md#evidence-coverage) defines stage-level completion evidence. The accepted [Review contract](phases/construction/unit-of-work-review.md#evidence-coverage) defines whole-unit assessment evidence. The accepted [Deliver contract](phases/construction/deliver.md#evidence-coverage) defines preparation, authority, operation, verification, and handoff evidence.

Each stage and Activity owns its named evidence, covered material, and required results under [SH52](authoring_progress.md#completed-shared-decisions). Referencing earlier evidence preserves its originating attempt and material bindings; it does not transfer stage or Activity completion.

## CLI responsibilities

Expose operations to read progress, change execution state, and record interactions and approvals. Also expose operations to manage pause and resume checkpoints and apply the shared [Revision procedure](revision.md#revision-procedure).

Keep phase transition rules and event recording in their owning application operations. The CLI invokes those operations; JSON journals retain the resulting facts. Current state and query views are derived. Skills must not implement separate event or state writers.

The [CLI command reference](cli.md) records accepted command decisions and proposed operation contracts. It owns command organization and interface details. This infrastructure contract owns persistence and shared execution rules. Neither document implements CLI behavior.

### Current author

Provide a CLI command that returns the current author as Git `user.name` and Git `user.email`. Resolve both values from the effective Git configuration for the current project. Repository-specific identity settings must apply.

Skills use this command to obtain the original creator's identity when creating an artifact. Store the frontmatter `author` value as one `Name <email>` string under the shared [author identity rules](metadata.md#author-identity).

The command returns the current Git identity, not the stored creator of an existing artifact. Do not use its result to replace `author` during later edits. Explicit correction of incorrect attribution is permitted. Record later contributions through Git history and audit records.

The [CLI command reference](cli.md#kepler-git-author) proposes `kepler git author`. Structured output is the default. Its exact response schema and behavior when either identity value is missing remain open.

### Unit creation

Create unit IDs in the format `YYYY-MM-DD-<slug>` under the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). Use the machine's local timezone to determine the date when the CLI creates the unit.

Use the exact unit ID as the directory name. The CLI must detect duplicate IDs within the project and must not overwrite an existing unit. Do not regenerate an existing ID during revision or resume.

The [unit creation command draft](cli.md#kepler-workflow-construction-unit-create) records the selected command placement and proposes inputs, effects, output, and failure behavior. Its detailed contract remains a draft.

## Traceability and revision outputs

Execution records must refer to the artifacts and units they concern. The CLI generates artifact IDs as UUIDv4 values with cross-project uniqueness and stores them in full lowercase hyphenated form. Follow the shared [artifact identity rules](metadata.md#identity-and-content-versions).

Use the shared [evidence and approval bindings](#evidence-and-approval-bindings) for checkpoint and material references. Exact relationship and record formats require separate decisions.

### Checkpoint retention

Keep required checkpoint commits reachable through retained Git references. A commit identifier stored in JSON alone does not preserve the commit.

Git preserves committed repository material while the required objects remain available. External environments, ignored outputs, and separate evidence logs need their own retention rules.

Audit events and content fingerprints do not preserve artifact contents by themselves. Retention periods, publication, storage locations, and cleanup rules remain undecided.

An interrupted attempt may have no output checkpoint. Its record must not claim a completed snapshot. Follow the shared [interrupted-work recovery rule](#interrupted-work-recovery).

## Decisions still required

- Phase-owned state models, projection schemas, status transitions, and attempt ID formats.
- Journal and projection storage layout.
- Remaining CLI command contracts, selectors, response schemas, and validation and authority rules.
- Consistent event writes, journal reconciliation, admission coordination, concurrent writers, and recovery after an interrupted operation.
- Integration lock implementation, ownership records, coordination across workspaces, and interrupted-lock recovery.
- External reference formats and exact evidence and approval record formats. Stage and Activity evidence coverage is accepted under [SH52](authoring_progress.md#completed-shared-decisions).
- Traceability relationship formats, checkpoint reference names, retention periods, publication, storage locations, and cleanup rules.
- Workspace and branch layouts, and shared test resource isolation.
- Which journals, projections, and retained records belong in version control or remain local to a checkout.

## Inspiration

The AWS AI-DLC audit model provides inspiration for command-owned events and retained history. AWS also retains `aidlc-state.md`. Kepler derives phase-owned execution state from JSON event journals instead of adopting that state-plus-audit representation.

Source: `https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/docs/guide/10-state-and-audit.md`.

The AWS run floor implementation supplied research for this decision. Kepler uses attempt identity instead of adopting its floor format or boundary rules.

Source: `https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/core/tools/aidlc-lib.ts#L36642-L36839`.
