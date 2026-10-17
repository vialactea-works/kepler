# CLI infrastructure

[Workflow phase index](README.md)

## Purpose

Record decisions about the Kepler CLI, structured persistence, and audit system.

The persistence separation and stage-attempt rules are agreed. Exact schemas, paths, commands, and persistence mechanisms remain under design. This document does not implement CLI behavior or migrate existing data.

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

A stage attempt is one execution of one stage for one Unit of Work. It includes the stage's internal correction loops.

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

Attempt ID formats, run floor rules, and content-version checks require further decisions.

### Revision decisions

Follow the shared [Revision procedure](revision.md#revision-procedure). A stage's proposed boundary does not authorize reopening or a revision cascade.

Record the orchestrator's decision and reason through the CLI. Keep current execution state consistent with that decision. Retain the decision and reason in append-only JSON audit history. CLI-owned operations record the corresponding events; agents must not write them separately.

Exact state fields, event formats, and command names remain undecided.

### Audit ownership

Adopt an audit system in which CLI-owned operations record structured events. The operation that changes state also records the corresponding audit events. Do not require agents to create lifecycle events separately after a transition or write event records by hand.

The audit system retains earlier events when work is revised or approved again. Current state and historical events have different roles; the persistence contract must keep them consistent.

The CLI records the requester's approval. It does not replace the requester as the approval authority.

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

Relationship formats and approved-version references require separate decisions.

Audit events and content fingerprints do not preserve artifact contents by themselves. Retention of the outputs from each revision remains an explicit design decision.

## Decisions still required

- JSON state schemas, status transitions, attempt ID formats, and run floor rules.
- Audit event types, required fields, format, and storage layout.
- CLI commands and their validation and authority rules.
- Consistent state and audit writes, concurrent writers, and recovery after an interrupted operation.
- Approval evidence, approved-version binding, traceability relationships, and output retention per revision.
- Which records belong in version control and which are local to a checkout.

## Inspiration

The [AWS AI-DLC audit model](https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/docs/guide/10-state-and-audit.md) provides inspiration for command-owned events and retained history. Kepler uses structured JSON for execution state and audit records instead of adopting AWS's Markdown persistence.

The [AWS run floor implementation](https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/core/tools/aidlc-lib.ts#L36642-L36839) supplies research for the run floor decision. Its format and boundary rules are not yet part of the Kepler contract.
