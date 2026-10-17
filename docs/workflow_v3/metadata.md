# Artifact metadata

[Workflow phase index](README.md)

## Purpose

Define the common frontmatter fields for Kepler Markdown artifacts. These fields apply to required documents, supporting documents, and Project references.

The common field set and CLI-generated UUIDs for artifact identity are agreed. Remaining field formats and stage-specific fields require further decisions. This document does not implement schemas or change existing artifacts.

## Common fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes. | CLI-generated UUID with cross-project uniqueness. Keep it across content revisions, renames, and moves. |
| `type` | Yes. | The artifact's purpose. It does not identify the current workflow stage. |
| `schema_version` | Yes. | Version of the frontmatter contract, not the content revision or Kepler release. |
| `unit_id` | For unit-owned artifacts. | The owning Unit of Work's `YYYY-MM-DD-<slug>` ID, identical to its directory name. Omit this field from project-scoped artifacts. |
| `author` | Yes. | Author identity, identified by both Git `user.name` and Git `user.email`. |

## Rules

### Identity and content versions

Generate artifact IDs through the `kepler` CLI as UUIDs with cross-project uniqueness. Keep document purpose in `type`; do not encode it in the ID.

`id` identifies the artifact, not one version of its contents. Execution records must bind approvals to content versions separately.

### Classification and ownership

`type` describes the document. It is separate from the Unit of Work's kind, such as Walking skeleton.

`unit_id` records ownership. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The CLI uses the machine-local creation date and a descriptive slug. Unit IDs are unique within a project and remain unchanged across revisions. References to other units do not change ownership.

### Author identity

Use the planned [current-author CLI command](runtime.md#current-author) to obtain the Git name and email for artifact frontmatter. The CLI resolves the effective Git configuration for the current project.

### Extensions

Stage-specific contracts can add fields. They must not redefine the common fields. Define these extensions with the relevant artifact contracts later.

### Execution state

Keep execution state out of frontmatter. Progress, approvals, depth selections, attempts, and pause checkpoints belong in CLI-managed JSON. Content fingerprints and execution timestamps also belong in that persistence layer. See [CLI infrastructure](runtime.md).

## Decisions still required

- UUID variant and text format for artifact IDs.
- Allowed `type` values and fields specific to each artifact contract.
- Exact field formats, including the representation of the author's name and email.
- Schema-version values and change rules.
- Valid metadata changes, including changes to author identity and unit ownership.

The [authoring progress record](authoring_progress.md#shared-decisions-still-pending) tracks these decisions. The agreed common fields do not complete all of SH02.
