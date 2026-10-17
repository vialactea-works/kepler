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
| `labels` | No. | Classification labels usable by any artifact. Canonical labels and requester-defined labels are allowed. Omit this field when empty. |

## Rules

### Schema version

Set `schema_version` to the integer `3` to follow Kepler versioning. This value identifies the metadata contract, not an artifact's content revision.

### Identity and content versions

Generate artifact IDs through the `kepler` CLI as UUIDv4 values with cross-project uniqueness. Store the full value as lowercase hexadecimal in `8-4-4-4-12` form, with hyphens between groups. Do not use prefixes, braces, or shortened IDs.

Keep document purpose in `type`; do not encode it in the ID.

`id` identifies the artifact, not one version of its contents. Execution records must bind approvals to content versions separately.

### Classification and ownership

`type` describes the document. It is separate from the Unit of Work's kind, such as Walking skeleton. Use lowercase words separated by hyphens. A stage transition does not change the document's type.

#### Accepted type values

| Value | Applies to |
| --- | --- |
| `unit-of-work` | The Unit of Work definition in `unit-of-work.md`. |
| `functional-design` | Functional Design in `design.md`. |
| `non-functional-requirements` | Non-functional Requirements in `quality.md`. |
| `project-reference` | Shared Project reference documents. |

Types for supporting documents are deferred as [DF06](authoring_progress.md#deferred-decisions). No generic or purpose-specific type is selected by this deferral. Define additional values when their artifact contracts are agreed.

#### Unit ownership

`unit_id` records ownership. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The CLI uses the machine-local creation date and a descriptive slug. Unit IDs are unique within a project and remain unchanged across revisions. References to other units do not change ownership.

### Labels

Store `labels` as a list of strings. The field is shared metadata and can be used by any artifact. Omit the field when the list is empty.

Kepler can define canonical labels with documented meanings. The vocabulary is open: the requester can add other labels. A label does not need to be in the canonical list to be valid.

Do not use labels to record execution state, including progress, approval, or completion. That information belongs in CLI-managed JSON.

#### Canonical labels

| Label | Meaning |
| --- | --- |
| `walking-skeleton` | Identifies walking skeleton work under the shared [Unit of Work definition](unit-of-work.md#walking-skeleton). |

To classify a unit as a walking skeleton, record this label on its `unit-of-work.md`. The label can also be used on other artifacts to classify those artifacts. Those uses do not replace the classification in the unit definition. Do not require the label to be copied to every unit-owned artifact.

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

- Remaining field formats and value-validation rules.
- Future schema-version change and compatibility rules.
- Valid metadata changes, including changes to author identity and unit ownership.

The [authoring progress record](authoring_progress.md#shared-decisions-still-pending) tracks these decisions. The agreed common fields do not complete all of SH02.
