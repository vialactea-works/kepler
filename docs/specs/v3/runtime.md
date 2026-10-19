# CLI infrastructure

[Workflow phase index](README.md)

## Purpose

Record decisions about the Kepler CLI, structured persistence, and audit system.

The persistence responsibilities, event envelope, event-derived execution state, attempt boundaries, evidence bindings, and parallel checkpoint rules are agreed. The [Mission contract](mission.md) sets accepted record and local-runtime paths. Phase-owned projections, commands, and write protocols stay under design. This document does not add CLI behavior or migrate existing data.

The [Construction runtime draft](phases/construction/runtime.md) proposes Construction-specific state names, lifecycle guards, and event payloads. It is not a stage and does not replace this shared contract. The accepted [Mission contract](mission.md) owns mission storage policy.

## Data responsibilities

| Data | Representation | Responsibility |
| --- | --- | --- |
| Artifact metadata | Frontmatter on Markdown artifacts. JSON artifact representation follows its own contract. | For Markdown, record identity, classification, ownership, schema version, and author under the shared [metadata contract](metadata.md). JSON metadata follows its own artifact contract. |
| Authored content | Markdown artifact bodies and authored JSON task graphs. | State purpose, scope, requirements, design, plans, and supporting evidence. |
| Execution state | Derived phase-owned views, queried through the `kepler` CLI. | Represent current progress, attempts, approvals, and changing settings from each phase's journals. |
| Audit history | Authoritative append-only structured JSON event journals, recorded through CLI-owned operations. | Keep lifecycle facts, decisions, settings, revisions, approvals, and evidence bindings necessary to derive execution state. |

## Record portability

[SH74](authoring_progress.md#completed-shared-decisions) states which records travel with the project. These rules keep the existing journal authority, evidence bindings, and concurrency contracts.

| Record | Portability rule |
| --- | --- |
| Authored project artifacts | Version with the project under their authored-content and metadata contracts. |
| Phase-owned append-only JSON journals | Version as portable workflow history under the [Mission contract](mission.md#durable-layout). Keep their event identities and original bindings. |
| Derived projections and caches | Keep local and disposable. Rebuild them from kept journals. |
| Live locks and process registries | Keep as unversioned runtime coordination data. Copying history must not restore ownership. |
| Evidence content | Version suitable files. Keep large or sensitive content externally with durable references and the material. |

### Current journals and Git snapshots

Working journals can contain uncommitted events. The CLI uses current durable history under the owning phase's validation rules.

A new commit is not necessary solely for an event append, worker dispatch, or session resume. Existing checkpoint requirements still apply to the material being checked or handed off. Do not add global `HEAD` agreement or shared admission commits.

A system may use separate worker or workspace journals. Keep event and journal identities, local event order, causal references, original attempts, and evidence bindings. Do not flatten or reorder history by timestamps. Git merge success alone does not validate workflow history.

Git can transfer a committed history snapshot made available to the receiver. It does not synchronize ongoing events or show live worker or lock ownership.

### Handoff and recovery

Same-checkout recovery can use current durable journals and unfinished work that the [recovery rule](#interrupted-work-recovery) says to keep.

Before a cross-checkout or cross-machine handoff completes, make the history relevant to the receiving scope available. Include necessary causal records, checkpoint material, and accessible evidence.

Missing necessary records, checkpoint objects, or evidence block only the affected handoff or work. Use existing recovery and revision rules to resolve missing material. Do not infer successful completion or recreate requester approval.

History transfer does not start workers, restore locks, or grant new consent. Before you resume this work, make sure that its assignment is current. Make sure that no earlier worker is active on the same work. A stale snapshot cannot show that no newer event or live lock exists.

### Evidence and privacy

Keep secrets out of versioned records. Journals record necessary workflow facts, not full session transcripts.

Keep necessary evidence content, not only its reference or fingerprint. Keep necessary Git checkpoint objects reachable through their references. Make necessary references and objects available to the receiver. Names and commit IDs alone do not keep material.

Version-control policy does not authorize publication or other delivery operations.

### Implementation boundary

The [Mission contract](mission.md#durable-layout) sets mission-history and local-runtime paths. SH43 still permits disposable projections, but selects no persisted views directory. Do not add a substitute cache tree. Journal collection, synchronization, locking, and checkpoint publication mechanics stay implementation choices. Retention periods and cleanup stay [deferred](authoring_progress.md#deferred-decisions).

## Rules

### Artifact metadata

Keep artifact metadata separate from execution state. Mostly immutable does not mean that every field can never change. Follow the shared [metadata change rules](metadata.md#metadata-changes).

For Markdown artifacts, use the shared [common fields](metadata.md#common-fields): `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels`. The metadata contract gives their meanings and states when they must be present. Apply its [field validation rules](metadata.md#field-validation). Validation is read-only: report invalid names or values and keep content for correction.

Do not convert value types or generate missing values during validation. Creation operations can populate fields explicitly. Stage-specific fields stay undecided.

For Markdown artifacts, apply the shared [schema-version rules](metadata.md#schema-version). Report unsupported schema versions and leave those artifacts unchanged. JSON artifact metadata and schema identification follow the JSON artifact's own contract. Do not migrate data automatically. The migration procedure stays deferred under DF05.

Do not store progress, completion flags, current attempts, approvals, pause checkpoints, or changing execution settings in authored artifacts. This includes Markdown frontmatter, Markdown status sections, and `tasks-dag.json`.

Construction records technical rationale in `plan.md` and the task graph in `tasks-dag.json`. Both are authored content. Task graphs use the [Kepler JSON format](phases/construction/task-graph.md), including its UUID identities and independent format version. Execution progress is derived from event journals, not Markdown checkboxes or task-graph status fields.

### Execution state

Agents and skills must use the `kepler` CLI to query execution state and record workflow events. They must not edit event journals or projections directly.

#### Execution-state representation

Workflow execution state is derived from phase-owned event journals. No independently authoritative state files are necessary. Each phase owns its state model and projection schemas. Materialized views are disposable.

The journals are the persisted source of workflow truth. This replaces the earlier state-plus-audit representation. State files cannot be a second authority.

Each phase is a bounded context. Shared tracking mechanics do not impose Construction's unit/task hierarchy or status vocabulary on other phases. Agent scopes follow the owning phase and stage contracts. Not all agents are task-scoped.

The CLI can calculate views directly or use rebuildable projections. Rebuilding a projection does not rerun work or record approvals. A projection does not replace kept evidence or checks against actual work.

One shared journal or a global total order is not necessary for this representation. The [event envelope](#event-envelope-choices) is agreed. Exact type definitions and the event catalog belong to implementation. Journal layout, collection, and write protocols stay separate decisions.

Record the unit effort default and explicit stage overrides as journal events through the CLI. The CLI calculates their current values from those events. Their selection and approval rules stay in the shared [Effort definition](effort.md).

Record requester approvals and their reviewed-material bindings as journal events through the CLI. Approval views are derived from those events. A frontmatter flag, an existing artifact, or a Git commit does not show approval or completion.

Markdown views can present execution state, but they stay derived views, not authoritative records. The authoring progress file tracks specification work, not Unit of Work execution.

### Stage attempts

A stage attempt is one execution of a stage within the scope that its phase contract sets. It includes the stage's internal correction loops.

Construction uses unit-scoped stage attempts. Implementation coordinates its Activity attempts under one unit-scoped attempt. Other phases set their own execution scopes.

- Create a stage attempt when the stage starts for the first time.
- Self-review and repeated edits after failed checks keep the same attempt while corrections stay within that stage.
- A stage report or revision recommendation does not create a new attempt.
- Create a new attempt when a stage executes again after reopening authorized by the orchestrator.
- Apply this rule to every stage in the authorized revision cascade when each stage executes again.
- Pauses, resumes, and new agent sessions keep the same attempt.
- A failed command alone does not create a new attempt.
- Link the stage's named evidence and required approvals to the stage attempt.
- Keep previous attempts as history. Their completion does not show completion of the current attempt.

Suspected upstream problems follow the shared [revision authority and escalation rules](revision.md#authority-and-escalation). Stage and Activity workers report findings and proposed boundaries. The orchestrator selects whether to authorize reopening and where to start.

#### Attempt identity and active scope

Give each stage and Activity attempt its own full lowercase hyphenated UUIDv4 value. Mint the value independently when execution starts. Give every new attempt a fresh value. Do not use counters or timestamp IDs. Do not add a task-attempt or separate run-floor identity, or an ID registry. Git checkpoint reuse does not change this rule.

For Construction, keep at most one active attempt for each fixed unit/stage scope. Apply the separate one-active-attempt limit to each fixed Activity occurrence under [Activity attempts](#activity-attempts). Different task and unit scopes can progress concurrently when dependency and stage-order constraints are satisfied.

For this limit, active means started and not ended. Paused attempts and attempts waiting for review or approval still occupy their scope. Resuming work keeps the existing attempt identity.

Keep each limit under concurrent start or resume requests. Two requests for the same scope must not create two active attempts. Coordination must not become a global Git gate for unrelated scopes.

It is not necessary for every task to execute every Activity. Phase and stage contracts set the applicable scopes.

Construction sets its [Implementation structure](phases/construction/README.md#implementation). Record the relationship between its unit-scoped stage attempt and each Activity attempt through the shared journal mechanics. Get relationship views from those events.

Task implementation and Task coding are execution contexts, not additional attempt identities. Do not infer Construction's Activity structure for other phases.

Status values and exact coordination and phase-specific binding details remain open.

### Activity attempts

An Activity attempt is one execution of an Activity occurrence within an enclosing stage attempt. Bind it to that occurrence and the enclosing attempt. The stage attempt supplies coordination context. It does not replace the Activity attempt.

Each Activity attempt has a distinct identity and its own run floor. Keep at most one active attempt for a fixed Activity occurrence. An authorized return creates a new attempt when the Activity executes again.

Failed commands, local corrections within the current Activity, waits, pauses, resumes, and new sessions do not create another attempt. An Integration-only retry stays within its current Code Integration attempt.

Keep Activity evidence under the Activity's own contract and attempt. Keep enclosing stage evidence under the stage contract and attempt. Shared scope and material bindings do not replace either contract.

When an upstream revision ends the enclosing stage attempt, end its affected Activity attempts. Do not move historical Activity evidence to a new stage attempt. Ended Activity results cannot complete or cancel newer work, even if candidate bytes and the enclosing stage attempt stay unchanged.

Use shared CLI-owned journals and operations for Activity attempts and evidence. Do not add a second lifecycle engine or a task-coding or protocol-run attempt identity. Phase-owned Activity event payloads, commands, and projections stay implementation choices under the unchanged [event envelope](#event-envelope-choices). Activity attempt IDs follow the shared rules above.

### Run floor

Use the applicable attempt identity as the run floor for its scope. The run floor is not a separate identifier.

Earlier-attempt evidence and approvals cannot show completion of the current attempt in that scope. Late results keep their original attempt binding. They must not change a newer attempt's progress or show its completion, even when the Git checkpoint matches.

Pauses, resumes, and internal correction loops keep the same run floor. Progress in other scopes does not change it. This contract does not set an additional verification-round boundary within an attempt.

Attempt binding and [evidence applicability](#evidence-applicability) are separate checks. A matching attempt identity does not show that evidence covers the necessary material and relevant inputs. Stage and Activity completion conditions and revision authority still apply.

### Interrupted-work recovery

Resume from CLI-recorded progress after making sure that the actual work and evidence match the recorded progress. Keep unfinished work and continue the same attempt if it has not ended. Make sure that no previous worker changes the same work. Repeat work only where results are missing or no longer valid. Resolve conflicting records before resuming the affected work.

Use the existing [revision procedure](revision.md#revision-procedure) when upstream contracts are invalid. Independent work can continue while its inputs and contracts stay valid.

This rule does not set lock recovery or repair rules for interrupted state writes.

### Revision decisions

Follow the shared [Revision procedure](revision.md#revision-procedure). A stage's proposed boundary does not authorize reopening or a revision cascade.

Record the orchestrator's decision and reason through the CLI. Include the selected execution scope and starting stage. Keep those facts in the phase's append-only event journals. Get current execution state from the recorded decision. CLI-owned operations record the events. Agents must not write them separately.

Give each authorized revision a fresh full lowercase hyphenated UUIDv4 as `revision_id` in phase-owned event data. Keep it distinct from the authorizing event ID and attempt IDs. Related ending and reopening facts reference this revision identity. Keep `caused_by` for direct event IDs. Keep the authorizing event ID and original revision identity when transferring history or retrying the same journal write. Do not add a revision registry, separate lifecycle engine, or second authoritative store.

Follow Construction's [unit-wide upstream revision rules](phases/construction/README.md#unit-wide-upstream-revision). Record the end of affected Implementation and Activity attempts through CLI-owned journal events. Calculate current attempt views from those events. Start new attempts only when their stage or Activity executes again.

Phase-owned projection fields and detailed revision arguments stay undecided. The [CLI command reference](cli.md#revision-operation) records the agreed `revise` placement. The implementation sets revision event types and payload schemas within the agreed [event envelope](#event-envelope-choices).

### Audit ownership

CLI-owned application operations validate workflow transitions and record the resulting structured events. Current execution state is derived from those events. Callers must not append duplicate lifecycle records after an operation or write event records by hand.

The journals keep earlier events when work is revised or approved again. Rebuildable views reflect recorded history. They do not become an independent workflow authority.

The CLI records the requester's approval. It does not replace the requester as the approval authority.

## Event envelope choices

These choices set the approved shared event envelope. All fields in the following table must be present.

| Field | Purpose |
| --- | --- |
| `id` | Stable event identity. |
| `phase` | Owning workflow phase. |
| `type` | The recorded fact, set by its owning phase. |
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

Use this information to investigate recorded events. Imported events keep their original producer values. The importing CLI must not replace those values with its own identity.

The field does not identify the requester, agent, model, or host. Record necessary actor identities in the phase-owned event data. Producer values do not show approval or authorize a transition.

### Causal references

Use `caused_by`, not `causes`, for direct causal event IDs. Use `[]` when no recorded causal predecessor exists. The references point from the current event to its causes. Each phase's implementation sets its event catalog and necessary causal references.

An event can have several direct causes. Referenced events can belong to other journals. Do not repeat indirect ancestors solely to reconstruct the causal chain.

A timestamp alone does not show causality. Causal references do not replace attempt or material bindings. They do not show that a transition was valid.

Workers can receive applicable event IDs with their assignments. Workers can do their work without a global-history inspection.

### Journal identity and order

Keep `journal_id` as the event's originating journal identity. Use stable event IDs to detect duplicates.

Event IDs support journal-write deduplication and debugging. They do not replace revision or evidence identities.

Do not persist a numeric `position` field or allocate a separate sequence counter. Local order is the order of events stored in each journal. Collection must keep the original journals or their relative event order. Do not flatten and reorder history by timestamp while discarding local journal order.

Use `caused_by` for explicit causal references across journals. Local order does not resolve conflicting control decisions. Apply the existing transition, attempt, evidence, and approval rules.

The protocols for safe appends, retries, interrupted writes, and collection stay undecided. This choice sets no physical storage layout or global total order.

The [audit list interface](cli.md#kepler-audit-list) returns compact query projections by default. Omitted fields are unrequested, not absent from the original event. Query projections do not change the stored event envelope, journal order, or causal references.

## Evidence and content checkpoints

### Concepts

| Concept | Meaning |
| --- | --- |
| Stage attempt | One execution of a stage, including its internal correction loops. |
| Activity attempt | One execution of an Activity occurrence within an enclosing stage attempt. |
| Git checkpoint | A commit that identifies a multi-file snapshot in one repository. |
| Evidence | A recorded check or review result concerning specified material and relevant conditions. |
| Approval | The requester's explicit acceptance of specified material. |
| Checkpoint set | Repository-qualified Git checkpoints that identify one multi-repository operation's material. |

Attempt identity is separate from commit identity. An attempt can reference several checkpoints. Different attempts can reference the same checkpoint.

A commit identifies content. It does not show that checks passed or that the requester approved the work.

### Material references

Material is anything relevant to a check, review, or approval. Its types are open-ended. The examples below do not restrict the allowed types.

Each Git checkpoint identifies material in one repository. A multi-repository operation uses a repository-qualified checkpoint set. An evidence record can reference other material alongside it. See [Mission](mission.md#multi-repository-checkpoints-and-integration) for distinct checkpoint roles.

| Example | Possible reference |
| --- | --- |
| Code, tests, configuration, or authored documents | Repository, checkpoint commit, and material covered. |
| MR or PR | Platform identifier, reviewed commit, and relevant review content. |
| CI pipeline | Pipeline, job, and execution identifiers, plus the content actually tested. |
| Container image | Image digest, with its tag as an additional label. |
| Local or external logs | Retrieval location and a copy that stays available, an object version, or a content digest. |

A mutable URL or tag alone is not sufficient to identify what you examined. Where necessary, keep the relevant content or reference an immutable version.

A [Git diff package](diff-package.md) is a derived inspection input. It does not itself show check success, approval, or workflow authority. It keeps original producer attempt and material bindings. A consuming check or review binds its result to its own current attempt. The package does not change lifecycle state.

### Evidence and approval bindings

Each evidence result uses the shared ten-field event envelope. Its phase-owned `data` includes:

- An independently generated `evidence_id`, a full lowercase hyphenated UUIDv4 distinct from the event envelope's `id` and attempt IDs. Give each new check or review result a fresh value. Matching material and outcomes do not justify ID reuse.
- The applicable stage, Activity, unit, task, and attempt bindings. Include only scopes that apply.
- One `inputs` array for checked material and other relevant inputs. Each entry has `reference` and `purpose`. References identify each repository and exact checkpoint commit, or other material as appropriate.
- The check or review performed, the actual executor, its result, retained output references, and relevant conditions.

The owning contracts set evidence scope. Cover relevant material, not only files changed by one worker. Keep workflow progress and audit history separate from checked material unless the check covers them. Record bindings through CLI-owned JSON journal events, not artifact frontmatter. Derive current binding views from recorded events.

Use the envelope's `event_version` to version phase-owned data. Do not add a redundant record-version field. This minimum does not define a closed generic schema, reference encoding, result taxonomy, host qualification, separate evidence file, or evidence registry. Detailed phase-owned payload types and event catalogs remain implementation work.

A retry of the same journal write keeps the existing evidence ID, event ID, and original bindings. This is not a general idempotency protocol or permission to reinterpret caller retries. Recording evidence does not execute a check, grant approval, or complete workflow work. A recorded failed check remains failed. Keep all named evidence duties and apply the existing applicability and retention rules.

The [evidence recording interface](cli.md#kepler-audit-record-evidence) uses one request `inputs` array for checked material and relevant inputs. Each entry has `reference` and `purpose`. This request uses the shared input shape without defining every phase-owned payload field.

An approval uses phase-owned event `data` to identify the requester, scope, attempt, reviewed `inputs`, and a reference to the explicit approval decision. Each input uses the same `reference` and `purpose` shape. Keep recorded approvals immutable. An approval for an earlier attempt cannot approve a later attempt. Git identity, a commit, the event producer, a successful journal write, or an artifact cannot substitute for requester consent.

For repository material, create the output commit before recording approval. Reference encodings remain under SH51. Actor proof and the public approval interface remain under SH55. This record format does not add an approval ID, registry, authentication engine, or transcript requirement.

### Repository checkpoint procedure

Use this procedure when evidence covers repository material.

1. **Record starting checkpoints.** Reuse an existing commit when it represents the required starting state. Use one checkpoint per repository in a multi-repository operation. Task baselines follow the admission rules below.
2. **Do the work.** Edit and run trial checks within the owning stage's or Activity's responsibilities. Internal correction loops do not make a commit necessary for each action.
3. **Prepare output checkpoints.** Create each checkpoint in its repository's workspace when ready. Include the repository material that the necessary checks will cover.
4. **Run final checks.** Run the necessary checks against the checkpoint set and record their results. Apply the shared attempt and revision rules when corrections are necessary.
5. **Get approval when necessary.** Bind approval to the reviewed material and checkpoint set. Complete the stage or Activity only after its completion conditions are satisfied.

The material that passed the checks must match the checkpoint. Relevant uncommitted or untracked inputs cannot be silently treated as committed content.

Reuse existing commits when appropriate. If the material is unchanged, starting and output references can identify the same commit. A new commit is not necessary solely for attempt identity, task admission, or progress recording.

### Evidence applicability

A different commit identifier does not automatically make evidence stale. An audit-only commit can leave all application code and configuration unchanged.

Within the applicable attempt, earlier evidence can stay usable after a check shows that its covered material and relevant inputs are unchanged. Keep the record's original checkpoint and context references. If those inputs changed, get evidence for the changed material.

After an authorized revision, identical content does not transfer previous completion into the new attempt. Execute the reopened stage or Activity and satisfy its conditions again.

A material mismatch does not authorize a revision cascade. Report suspected upstream problems under the shared [revision authority rules](revision.md#authority-and-escalation).

## Parallel execution

In Construction, dependency-ready tasks and independent units can run concurrently. Unit-scoped stages follow the selected workflow's order. Apply the fixed [Activity order](phases/construction/README.md#implementation) within each task, not across different tasks. Activity feedback routes do not add or change task dependency edges. Other phases set their own execution relationships.

Task starts and progress records must not depend on shared admission commits or a global coordinator `HEAD`. Do not make a clean unrelated workspace a condition for other work to continue.

Each task records its actual starting inputs. Do not compare them with a changing coordinator `HEAD`.

Workflow event writes and derived views must not prevent concurrent work. Keep event-update coordination short. Isolation is necessary for test resources when concurrent runs could interfere.

Construction's [integration lock](phases/construction/README.md#integration-order-and-locking) serializes Code Integration within each unit. Hold that lock through reading the current repository-qualified checkpoint set, candidate preparation, checks, and acceptance across required repositories. This lock covers long-running checks. It is not a global agent, task admission, or test gate.

Use the [Mission contract](mission.md#workspace-selection-and-preparation) for startup workspace choices and isolation requirements. Detailed allocation mechanisms, branch layouts, and shared test-resource isolation stay implementation choices under SH66, SH69, and SH70.

### Task admission and baselines

Admission is the start boundary for selecting a task's baseline.

1. **Readiness.** Make sure that the plan lets execution start. Make sure that all necessary predecessor outputs are in the unit's integrated state.
2. **Select the baseline.** Capture the current repository-qualified integration set for the unit at admission. It must include all necessary predecessor outputs. Record that set as the task's fixed baseline.
3. **Keep the recorded baseline.** Once admitted, the task keeps that baseline. Later commits alone do not invalidate it or force it to restart. Compare the evidence with its covered material and relevant inputs, then report whether it still applies.

Use Git history or recorded integration provenance to show that predecessor outputs are included. A later commit timestamp alone does not show inclusion.

Use each selected repository's integration target, not a global coordinator `HEAD`. Admission does not make another commit necessary. Do not return to an older predecessor set when newer integrated unit work exists at admission.

#### Example

This example is illustrative. `C1` and `C2` label repository-qualified checkpoint sets, not identifier formats.

1. Tasks 1 and 2 run in parallel.
2. Task 1 finishes and its output is integrated into `C1`.
3. Task 2 finishes and its output is integrated into `C2`, which also contains Task 1's output.
4. Task 3 depends only on Task 1 and is admitted after both integrations. It starts from `C2`, not `C1`.

### Integration and verification

Task outputs can have separate checkpoints. Results for those checkpoints do not show that their combined result works.

Construction's [Code Integration Activity](phases/construction/activities/code-integration.md#integration-procedure) follows prepare, check, then accept under the unit's integration lock. Read the current repository-qualified checkpoint set after acquiring the lock. Run the necessary checks on the combined candidate set before it becomes the unit's integrated state. Run typechecking, the project build, and the full application test suite against the candidate set while holding the lock. All three must succeed against the combined candidate set before authorized acceptance. Record each necessary repository result.

Record actual Integration inputs separately from the fixed admission baseline. Successful acceptance of every necessary repository result and the applicable completion conditions are necessary for task completion. Repository commits do not form an atomic cross-repository commit or authorize automatic rollback.

Code Validation runs typechecking, the project build, and the full application test suite, and owns independent non-author feedback. The [Construction contract](phases/construction/README.md#agreed-boundaries) gives these duties. Integration checks do not replace them. A build result counts as typechecking only when its command also runs the necessary typechecking. Separate decisions are necessary for additional integration checks and project-specific check configuration.

A conflict can block the affected integration. Unrelated ready tasks and units continue. Report suspected upstream problems to the orchestrator. Integration does not authorize a cascade.

## Stage and Activity evidence

Stage and Activity contracts give their named evidence, covered material, and necessary results. Shared bindings do not replace those definitions.

The accepted [Generation](phases/construction/activities/code-generation.md#evidence-coverage), [Validation](phases/construction/activities/code-validation.md#evidence-coverage), and [Integration](phases/construction/activities/code-integration.md#evidence-coverage) Activity contracts give Activity evidence. The accepted [Implementation contract](phases/construction/implementation.md#evidence-coverage) gives stage-level completion evidence. The accepted [Review contract](phases/construction/unit-of-work-review.md#evidence-coverage) gives whole-unit assessment evidence. The accepted [Deliver contract](phases/construction/deliver.md#evidence-coverage) gives preparation, authority, operation, verification, and handoff evidence.

Each stage and Activity owns its named evidence, covered material, and necessary results under [SH52](authoring_progress.md#completed-shared-decisions). Referencing earlier evidence keeps its originating attempt and material bindings. It does not transfer stage or Activity completion.

## CLI responsibilities

Expose operations to read progress, change execution state, and record evidence, interactions, and approvals. Also expose operations to manage pause and resume checkpoints and apply the shared [Revision procedure](revision.md#revision-procedure).

Keep phase transition rules and event recording in their owning application operations. The CLI invokes those operations. JSON journals keep the resulting facts. Get current state and query views from the journals. Skills must not add separate event or state writers.

The [CLI command reference](cli.md) records accepted command decisions and proposed operation contracts. It owns command organization and interface details. This infrastructure contract owns persistence and shared execution rules. Neither document sets CLI behavior.

For project-scoped operations, apply the accepted [project selection rules](cli.md#project-selection), including before unit creation. For mission operations, `--project` selects the record home. Apply the accepted [scope selectors](cli.md#scope-and-selectors) to unit, stage, task, Activity, and attempt selection. Resolve mission context only from unique recorded membership.

CLI results use the accepted [result envelope](cli.md#machine-readable-output). Errors use the accepted [failure result fields](cli.md#failure-and-recovery-rules). Apply the accepted [exit-code contract](cli.md#exit-codes), [output stream contract](cli.md#output-streams), and [MVP result formatting](cli.md#human-output). Success fields, error-code values, and `details` schemas stay under their own interface decisions.

Use [kepler audit record evidence](cli.md#kepler-audit-record-evidence) for the accepted evidence interface. Use the accepted [audit queries](cli.md#kepler-audit-list) for read-only history inspection. Use the accepted [shared lint interface](cli.md#kepler-lint) for shared metadata checks. Approval and interaction interfaces stay under SH55-SH56.

Use the accepted [Construction lint interface](cli.md#kepler-workflow-construction-lint) for task graphs and [UUID interface](cli.md#kepler-uuid) for identifier generation. Root metadata lint of explicit files does not require mission adoption. Apply the accepted [setup interface](cli.md#kepler-setup) and [native resource ownership](installation.md#agent-resource-ownership) without adding agent certification.

### Current author

Give a CLI command that returns the current author as Git `user.name` and Git `user.email`. Resolve both values from the effective Git configuration for the current project. Repository-specific identity settings must apply.

Skills use this command to obtain the original creator's identity when creating an artifact. Store the frontmatter `author` value as one `Name <email>` string under the shared [author identity rules](metadata.md#author-identity).

The command returns the current Git identity, not the stored creator of an existing artifact. Do not use its result to replace `author` during later edits. Change `author` only to correct incorrect attribution explicitly. Record later contributions through Git history and audit records.

Apply the accepted [missing-identity policy](metadata.md#missing-identity) under SH61. A missing or blank name or email makes lookup fail with a nonzero result identifying each missing key. Make sure that both identity values are present before writing an artifact with an `author` field. Do not write incomplete author metadata or record successful creation or completion after this failure.

Do not prompt inside the CLI, change Git configuration automatically, or invent a fallback identity. The calling agent explains the problem and retries after the appropriate identity is configured. Keep existing authors and continue unaffected work.

The [CLI command reference](cli.md#kepler-git-author) proposes `kepler git author`. Structured output is the default. The command name, success fields, and command-specific error codes stay implementation choices under [SH60](authoring_progress.md#mvp-implementation-choices).

### Unit creation

Create unit IDs in the format `YYYY-MM-DD-<slug>` under the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). Use the machine's local timezone to set the date when the CLI creates the unit.

Use the exact unit ID as the directory name under its mission. Detect duplicate IDs across the record-home project, including known unbound units. Do not overwrite an existing unit or regenerate its ID during revision or resume. See the [Mission layout](mission.md#durable-layout).

The [unit creation command draft](cli.md#kepler-workflow-construction-unit-create) records the selected command placement. Full syntax and mission selection remain open under SH59. Do not infer mission input from an earlier proposal.

Mission creation records the selected workflow in its owning phase journal. Construction unit creation records the matching `standard` binding in the Construction journal. Later operations and resume use that binding, and `unit show` exposes it. Do not add workflow or mission fields to frontmatter or the authored task graph.

## Traceability and revision outputs

Execution records must refer to the artifacts and units they concern. The CLI generates artifact IDs as UUIDv4 values with cross-project uniqueness and stores them in full lowercase hyphenated form. Follow the shared [artifact identity rules](metadata.md#identity-and-content-versions).

Use the shared [evidence and approval bindings](#evidence-and-approval-bindings) for checkpoint and material references. Phase-specific relationship details and payload types remain implementation work under these shared record requirements.

### Checkpoint retention

Keep each necessary checkpoint commit reachable through a retained reference in its repository. A commit identifier stored in JSON alone does not keep the commit.

Git keeps committed repository material while the necessary objects stay available. External environments, ignored outputs, and separate evidence logs must have their own retention rules.

Audit events and content fingerprints do not keep artifact contents by themselves. Apply the accepted [record-portability policy](#record-portability) to journals, local runtime data, and evidence content. Retention periods and cleanup are deferred. Checkpoint-reference publication and external evidence storage remain implementation choices.

An interrupted attempt may have no output checkpoint. Its record must not claim a completed snapshot. Follow the shared [interrupted-work recovery rule](#interrupted-work-recovery).

## Decisions still required

- Phase-owned state models, projection schemas, and status transitions.
- Journal write, collection, and projection mechanisms within the accepted [Mission contract](mission.md#durable-layout).
- Other CLI command contracts, selectors, command-specific response schemas, and validation and authority rules.
- Consistent event writes, journal reconciliation, admission coordination, concurrent writers, and recovery after an interrupted operation.
- Integration lock implementation, ownership records, coordination across workspaces, and interrupted-lock recovery.
- External reference encodings under SH51 and detailed phase-owned evidence and approval payload types beyond the shared record requirements. Stage and Activity evidence coverage is accepted under [SH52](authoring_progress.md#completed-shared-decisions).
- Traceability relationship formats, checkpoint reference names and publication, external evidence-store locations, retention periods, and cleanup rules.
- Detailed workspace allocation, branch layouts, and shared test-resource isolation within the accepted [Mission contract](mission.md).
- Journal collection, transfer, and publication mechanics under the accepted [record-portability policy](#record-portability) and [Mission contract](mission.md).

## Inspiration

The AWS AI-DLC audit model gives an example for command-owned events and kept history. AWS also keeps `aidlc-state.md`. Kepler derives phase-owned execution state from JSON event journals instead of adopting that state-plus-audit representation.

Source: `https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/docs/guide/10-state-and-audit.md`.

The AWS run floor implementation supplied research for this decision. Kepler uses attempt identity instead of adopting its floor format or boundary rules.

Source: `https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/core/tools/aidlc-lib.ts#L36642-L36839`.
