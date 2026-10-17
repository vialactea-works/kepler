# CLI infrastructure

[Workflow phase index](README.md)

## Purpose

Record decisions about the Kepler CLI, structured persistence, and audit system.

The persistence separation, attempt boundaries, evidence bindings, and parallel checkpoint rules are agreed. Exact schemas, paths, commands, and persistence mechanisms remain under design. This document does not implement CLI behavior or migrate existing data.

## Data responsibilities

| Data | Representation | Responsibility |
| --- | --- | --- |
| Artifact metadata | Frontmatter on the artifact. | Record identity, classification, unit ownership, schema version, and author identity through the shared [Artifact metadata contract](metadata.md). Additional fields require further decisions. |
| Authored content | Markdown artifact body. | Define purpose, scope, requirements, design, plans, and supporting evidence. |
| Execution state | Structured JSON, operated through the `kepler` CLI. | Track current workflow, unit, stage, and implementation progress; active attempts; pause and resume information; approvals; and changing execution settings. |
| Audit history | Append-only structured JSON events, recorded through CLI-owned operations. | Record transitions, decisions, approvals, revisions, and the evidence they refer to. |

## Rules

### Artifact metadata

Keep artifact metadata separate from execution state. Mostly immutable does not mean that every field can never change. Follow the shared [metadata change rules](metadata.md#metadata-changes).

Use the shared [common fields](metadata.md#common-fields): `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels`. The metadata contract defines their meanings and when they are required. Apply its [field validation rules](metadata.md#field-validation). Validation is read-only: report invalid names or values and preserve content for correction. Do not convert value types or generate missing values during validation. Creation operations can populate fields explicitly. Stage-specific fields remain undecided.

Apply the shared [schema-version rules](metadata.md#schema-version). Report unsupported schema versions and leave those artifacts unchanged. Do not migrate data automatically. The migration procedure remains deferred under DF05.

Do not store progress, completion flags, current attempts, approvals, pause checkpoints, or changing execution settings in artifact frontmatter or Markdown status sections.

Implementation plans can describe the work in Markdown. Their execution progress belongs in JSON state, not Markdown checkboxes.

### Execution state

Agents must use the `kepler` CLI to read and change execution state. They must not edit the JSON records directly. The same rule applies to skills.

Record the unit depth default and explicit stage depth overrides in execution state. Their selection and approval rules remain in the shared [Depth definition](depth.md).

Record requester approvals and their relationship to approved content in execution state and audit history. A frontmatter flag, an existing artifact, or a Git commit does not establish approval or completion.

Markdown views can present execution state, but they are derived views, not authoritative records. The authoring progress file tracks specification work, not Unit of Work execution.

### Stage attempts

A stage attempt is one execution of one stage for one Unit of Work. It includes the stage's internal correction loops. When stage execution applies to a task, include that task in the attempt's scope.

- Create an attempt when the stage starts for the first time.
- Self-review and repeated edits after failed tests keep the same attempt while corrections remain within that stage.
- A stage report or revision recommendation does not create a new attempt.
- Create a new attempt when a stage executes again after reopening authorized by the orchestrator.
- Apply this rule to every stage in the authorized revision cascade when each stage executes again.
- Pauses, resumes, and new agent sessions keep the same attempt.
- A failed command alone does not create a new attempt.
- Link required completion evidence and approvals to the attempt.
- Keep previous attempts as history. Their completion does not establish completion of the current attempt.

Suspected upstream problems follow the shared [revision authority and escalation rules](revision.md#authority-and-escalation). Stage agents report findings and proposed boundaries. The orchestrator decides whether to authorize reopening and where to start.

#### Attempt identity and active scope

Give each attempt a distinct identity. A new attempt must not reuse a previous attempt's identity. Git checkpoint reuse does not change this rule.

For a fixed unit, task, and stage, allow zero or one active attempt. Attempts in that scope are serial. Different task or unit scopes can progress concurrently when dependencies and stage order permit it.

For unit-wide work without a task, apply the same limit to the unit/stage scope. Do not combine different task scopes into one admission gate.

For this limit, active means started and not ended. Paused attempts and attempts waiting for review or approval still occupy their scope. Resuming work keeps the existing attempt identity.

Preserve the limit under concurrent start or resume requests. Two requests for the same scope must not create two active attempts. Coordination must not become a global Git gate for unrelated scopes.

This constraint does not require every task to execute every stage. Stage contracts must define applicable task scopes and their relationship to unit-wide stage work.

Attempt ID formats, status values, run floor rules, and exact coordination and binding record formats require further decisions.

### Revision decisions

Follow the shared [Revision procedure](revision.md#revision-procedure). A stage's proposed boundary does not authorize reopening or a revision cascade.

Record the orchestrator's decision and reason through the CLI. Keep current execution state consistent with that decision. Retain the decision and reason in append-only JSON audit history. CLI-owned operations record the corresponding events; agents must not write them separately.

Exact state fields, event formats, and command names remain undecided.

### Audit ownership

Adopt an audit system in which CLI-owned operations record structured events. The operation that changes state also records the corresponding audit events. Do not require agents to create lifecycle events separately after a transition or write event records by hand.

The audit system retains earlier events when work is revised or approved again. Current state and historical events have different roles; the persistence contract must keep them consistent.

The CLI records the requester's approval. It does not replace the requester as the approval authority.

## Evidence and content checkpoints

### Concepts

| Concept | Meaning |
| --- | --- |
| Attempt | One execution of a stage, including its internal correction loops. |
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

- Its unit, stage, and attempt for stage work, plus its task when applicable.
- The material checked and relevant inputs.
- The repository and checkpoint commit for repository material, with appropriate references for other material.
- The check or review performed, its result, and supporting output.
- Relevant external conditions, such as the database version.

An approval identifies the requester, applicable attempt, and material approved. Include the checkpoint and other material references that identify what the requester reviewed.

Applicable contracts determine the required scope. The material covered is not limited to files changed by one worker.

Workflow progress and audit records are separate from the material checked, unless a check explicitly covers them.

Record bindings through the CLI in JSON execution state and audit history, not artifact frontmatter. For repository material, the output commit must exist before approval is recorded. Record approval afterwards, referencing that commit and the other reviewed material.

### Repository checkpoint procedure

Use this procedure when evidence covers repository material.

1. **Record the starting checkpoint.** Reuse an existing commit when it represents the required starting state. Task baselines follow the admission rules below.
2. **Perform the work.** Edit and perform trial checks within the stage's responsibilities. Internal correction loops do not require a commit for each action.
3. **Prepare the output checkpoint.** Create a checkpoint in the work's own workspace when ready. Include the repository material that the required checks will cover.
4. **Check the checkpoint.** Run required final checks against that snapshot and record their results. Apply the shared attempt and revision rules when corrections are needed.
5. **Obtain required approval.** Bind approval to the reviewed material and checkpoint. Complete the stage only after its completion conditions are satisfied.

The checked material must match the checkpoint. Relevant uncommitted or untracked inputs cannot be silently treated as committed content.

Reuse existing commits when appropriate. If the material is unchanged, starting and output references can identify the same commit. No new commit is required solely for attempt identity, task admission, or progress recording.

### Evidence applicability

A different commit identifier does not automatically make evidence stale. An audit-only commit can leave all application code and configuration unchanged.

Within the applicable attempt, earlier evidence can remain usable after verifying that its covered material and relevant inputs remain unchanged. Retain the record's original checkpoint and context references. If those inputs changed, obtain evidence covering the changed material.

After an authorized revision, identical content does not transfer previous completion into the new attempt. Execute the stage and satisfy its conditions again.

A material mismatch does not authorize a revision cascade. Report suspected upstream problems under the shared [revision authority rules](revision.md#authority-and-escalation).

## Parallel execution

Dependency-ready tasks and independent units can run concurrently. Stages retain their required order within each unit.

Starting tasks and recording progress must not depend on shared admission commits or a global coordinator `HEAD`. Independent work must not require unrelated workspaces to become clean or stop progressing.

Each task records its actual starting inputs. Running tasks do not need to match a changing coordinator `HEAD`.

State and audit updates must support concurrent work. Any necessary coordination must cover short updates, not agent execution or test runs. Test resources need isolation where concurrent runs could interfere.

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

Run applicable checks against the integrated unit checkpoint. Code Validation evaluates the integrated application under the [stage boundaries](phase_construction/README.md#agreed-boundaries).

A conflict can block the affected integration. Unrelated ready tasks and units continue. Report suspected upstream problems to the orchestrator; integration does not authorize a cascade.

## CLI responsibilities

Expose operations for reading progress, changing execution state, recording interactions and approvals, managing pause and resume checkpoints, and applying the shared [Revision procedure](revision.md#revision-procedure).

Keep state-transition rules and audit recording in shared application operations. The CLI invokes those operations; JSON persistence stores their results. Skills must not implement separate state writers.

Command names and arguments are not defined here. This document does not add new commands.

### Current author

Provide a CLI command that returns the current author as Git `user.name` and Git `user.email`. Resolve both values from the effective Git configuration for the current project. Repository-specific identity settings must apply.

Skills use this command to obtain the original creator's identity when creating an artifact. Store the frontmatter `author` value as one `Name <email>` string under the shared [author identity rules](metadata.md#author-identity).

The command returns the current Git identity, not the stored creator of an existing artifact. Do not use its result to replace `author` during later edits. Explicit correction of incorrect attribution is permitted. Record later contributions through Git history and audit records.

The command name, output format, and behavior when either value is missing remain undecided.

### Unit creation

Create unit IDs in the format `YYYY-MM-DD-<slug>` under the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). Use the machine's local timezone to determine the date when the CLI creates the unit.

Use the exact unit ID as the directory name. The CLI must detect duplicate IDs within the project and must not overwrite an existing unit. Do not regenerate an existing ID during revision or resume.

## Traceability and revision outputs

Execution records must refer to the artifacts and units they concern. The CLI generates artifact IDs as UUIDv4 values with cross-project uniqueness and stores them in full lowercase hyphenated form. Follow the shared [artifact identity rules](metadata.md#identity-and-content-versions).

Use the shared [evidence and approval bindings](#evidence-and-approval-bindings) for checkpoint and material references. Exact relationship and record formats require separate decisions.

### Checkpoint retention

Keep required checkpoint commits reachable through retained Git references. A commit identifier stored in JSON alone does not preserve the commit.

Git preserves committed repository material while the required objects remain available. External environments, ignored outputs, and separate evidence logs need their own retention rules.

Audit events and content fingerprints do not preserve artifact contents by themselves. Retention periods, publication, storage locations, and cleanup rules remain undecided.

An interrupted attempt may have no output checkpoint. Its record must not claim a completed snapshot. Detailed recovery rules remain undecided.

## Decisions still required

- JSON state schemas, status transitions, attempt ID formats, and run floor rules.
- Audit event types, required fields, format, and storage layout.
- CLI commands and their validation and authority rules.
- Consistent state and audit writes, admission and integration coordination, concurrent writers, and recovery after an interrupted operation.
- Required material scopes for each check and stage, external reference formats, and exact evidence and approval record formats.
- Traceability relationship formats, checkpoint reference names, retention periods, publication, storage locations, and cleanup rules.
- Workspace and branch layouts, and shared test resource isolation.
- Which records belong in version control and which are local to a checkout.

## Inspiration

The [AWS AI-DLC audit model](https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/docs/guide/10-state-and-audit.md) provides inspiration for command-owned events and retained history. Kepler uses structured JSON for execution state and audit records instead of adopting AWS's Markdown persistence.

The [AWS run floor implementation](https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/core/tools/aidlc-lib.ts#L36642-L36839) supplies research for the run floor decision. Its format and boundary rules are not yet part of the Kepler contract.
