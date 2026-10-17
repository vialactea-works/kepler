# Artifact metadata

[Workflow phase index](README.md)

## Purpose

Define the common frontmatter fields for Kepler Markdown artifacts. These fields apply to required documents, supporting documents, and Project references.

The common field set and CLI-generated UUIDv4 values for artifact identity are agreed. Remaining field formats and stage-specific fields require further decisions. This document does not implement schemas or change existing artifacts.

## Common fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes. | CLI-generated UUIDv4 with cross-project uniqueness, stored in full lowercase hyphenated form. Keep it across content revisions, renames, and moves. |
| `type` | Yes. | The artifact's purpose. It does not identify the current workflow stage. |
| `schema_version` | Yes. | Integer `3` for the current frontmatter contract, aligned with Kepler versioning. It is not the content revision. |
| `unit_id` | For unit-owned artifacts. | The owning Unit of Work's `YYYY-MM-DD-<slug>` ID, identical to its directory name. Omit this field from project-scoped artifacts. |
| `author` | Yes. | One string in `Name <email>` form, using Git `user.name` and Git `user.email`. |

## Rules

### Schema version

Set `schema_version` to the integer `3` to follow Kepler versioning. This value identifies the metadata contract, not an artifact's content revision.

### Identity and content versions

Generate artifact IDs through the `kepler` CLI as UUIDv4 values with cross-project uniqueness. Store the full value as lowercase hexadecimal in `8-4-4-4-12` form, with hyphens between groups. Do not use prefixes, braces, or shortened IDs.

Keep document purpose in `type`; do not encode it in the ID.

`id` identifies the artifact, not one version of its contents. Execution records must bind approvals to content versions separately.

### Classification and ownership

`type` describes the document. It is separate from the Unit of Work's kind, such as Walking skeleton.

`unit_id` records ownership. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The CLI uses the machine-local creation date and a descriptive slug. Unit IDs are unique within a project and remain unchanged across revisions. References to other units do not change ownership.

### Author identity

Store `author` as one string in `Name <email>` form. Use Git `user.name` for the name and Git `user.email` for the email.

Use the planned [current-author CLI command](runtime.md#current-author) to obtain these values. The CLI resolves the effective Git configuration for the current project.

#### Example

This frontmatter field is illustrative:

```yaml
author: "Example Author <author@example.com>"
```

### Extensions

Stage-specific contracts can add fields. They must not redefine the common fields. Define these extensions with the relevant artifact contracts later.

### Execution state

Keep execution state out of frontmatter. Progress, approvals, depth selections, attempts, and pause checkpoints belong in CLI-managed JSON. Content fingerprints and execution timestamps also belong in that persistence layer. See [CLI infrastructure](runtime.md).

## Decisions still required

- Allowed `type` values and fields specific to each artifact contract.
- Remaining field formats and value-validation rules.
- Future schema-version change and compatibility rules.
- Valid metadata changes, including changes to author identity and unit ownership.

The [authoring progress record](authoring_progress.md#shared-decisions-still-pending) tracks these decisions. The agreed common fields do not complete all of SH02.
