# CLI infrastructure

[Workflow phase index](README.md)

## Purpose

Record decisions about the Kepler CLI, structured persistence, and audit system.

The separation below is agreed. Exact schemas, paths, commands, and persistence mechanisms remain under design. This document does not implement CLI behavior or migrate existing data.

## Data responsibilities

| Data | Representation | Responsibility |
| --- | --- | --- |
| Artifact metadata | Frontmatter on the artifact. | Record identity and other mostly immutable attributes, such as artifact classification and unit membership. Exact fields remain undecided. |
| Authored content | Markdown artifact body. | Define purpose, scope, requirements, design, plans, and supporting evidence. |
| Execution state | Structured JSON, operated through the `kepler` CLI. | Track current workflow, unit, stage, and implementation progress; active attempts; pause and resume information; approvals; and changing execution settings. |
| Audit history | Append-only structured JSON events, recorded through CLI-owned operations. | Record transitions, decisions, approvals, revisions, and the evidence they refer to. |

## Rules

### Artifact metadata

Keep artifact metadata separate from execution state. Mostly immutable does not mean that every field can never change; the metadata contract must define valid changes.

Do not store progress, completion flags, current attempts, approvals, pause checkpoints, or changing execution settings in artifact frontmatter or Markdown status sections.

Implementation plans can describe the work in Markdown. Their execution progress belongs in JSON state, not Markdown checkboxes.

### Execution state

Agents must use the `kepler` CLI to read and change execution state. They must not edit the JSON records directly. The same rule applies to skills.

Record the unit depth default and explicit stage depth overrides in execution state. Their selection and approval rules remain in the shared [Depth definition](depth.md).

Record requester approvals and their relationship to approved content in execution state and audit history. A frontmatter flag, an existing artifact, or a Git commit does not establish approval or completion.

Markdown views can present execution state, but they are derived views, not authoritative records. The authoring progress file tracks specification work, not Unit of Work execution.

### Audit ownership

Adopt an audit system in which CLI-owned operations record structured events. The operation that changes state also records the corresponding audit events. Do not require agents to create lifecycle events separately after a transition or write event records by hand.

The audit system retains earlier events when work is revised or approved again. Current state and historical events have different roles; the persistence contract must keep them consistent.

The CLI records the requester's approval. It does not replace the requester as the approval authority.

## CLI responsibilities

Expose operations for reading progress, changing execution state, recording interactions and approvals, managing pause and resume checkpoints, and applying the shared [Revision procedure](revision.md#revision-procedure).

Keep state-transition rules and audit recording in shared application operations. The CLI invokes those operations; JSON persistence stores their results. Skills must not implement separate state writers.

Command names and arguments are not defined here. This document does not add new commands.

## Traceability and revision outputs

Execution records must refer to the artifacts and units they concern. The identity, relationship, and approved-version reference formats require separate decisions.

Audit events and content fingerprints do not preserve artifact contents by themselves. Retention of the outputs from each revision remains an explicit design decision.

## Decisions still required

- Frontmatter identity fields, classifications, and valid changes.
- JSON state schemas, status transitions, and attempt identities.
- Audit event types, required fields, format, and storage layout.
- CLI commands and their validation and authority rules.
- Consistent state and audit writes, concurrent writers, and recovery after an interrupted operation.
- Approval evidence, approved-version binding, traceability relationships, and output retention per revision.
- Which records belong in version control and which are local to a checkout.

## Inspiration

The [AWS AI-DLC audit model](https://github.com/awslabs/aidlc-workflows/blob/d27f96b6ab26a0e4571a3e79422bea2c5136e9d5/docs/guide/10-state-and-audit.md) provides inspiration for command-owned events and retained history. Kepler uses structured JSON for execution state and audit records instead of adopting AWS's Markdown persistence.
