# Artifact metadata

[Workflow phase index](README.md)

## Purpose

Define the common frontmatter fields for Kepler Markdown artifacts. These fields apply to required documents, supporting documents, and Project references.

The common fields, validation rules, metadata change rules, and schema-version rules are agreed. Supporting Markdown documents use `supporting-document`. Define any stage-specific fields with their artifact contracts. This document does not implement schemas or change existing artifacts.

## Common fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes. | CLI-generated UUIDv4 with cross-project uniqueness, stored in full lowercase hyphenated form. Keep it across content revisions, renames, and moves. |
| `type` | Yes. | The artifact's purpose. It does not identify the current workflow stage. |
| `schema_version` | Yes. | Integer `3` for the current frontmatter contract, aligned with Kepler versioning. It is not the content revision. |
| `unit_id` | For unit-owned artifacts. | The owning Unit of Work's `YYYY-MM-DD-<slug>` ID, identical to its directory name. Omit this field from project-scoped artifacts. |
| `author` | Yes. | The original creator's Git identity as one `Name <email>` string. Preserve it during later edits. |
| `labels` | No. | Classification labels usable by any artifact. Canonical labels and requester-defined labels are allowed. Omit this field when empty. |

## Rules

### Schema version

Set `schema_version` to the Kepler major version. Use the integer `3` for Kepler 3.x. This value identifies the metadata contract, not an artifact's content revision.

- Do not change the schema version for minor or patch releases.
- Artifacts that are valid must remain valid within the same major version.
- A change that makes existing valid artifacts invalid requires a new Kepler major version.
- The CLI must report unsupported schema versions. It must leave those artifacts unchanged.
- Do not migrate data automatically. The migration procedure remains deferred under [DF05](authoring_progress.md#deferred-decisions).

### Identity and content versions

Generate artifact IDs through the `kepler` CLI as UUIDv4 values with cross-project uniqueness. Store the full value as lowercase hexadecimal in `8-4-4-4-12` form, with hyphens between groups. Do not use prefixes, braces, or shortened IDs.

Keep document purpose in `type`; do not encode it in the ID.

`id` identifies the artifact, not one version of its contents. Execution records must bind approvals to content versions separately.

Task UUIDs identify tasks, not their containing artifact or execution attempt. The [task graph format](phases/construction/task-graph.md#task-identity) defines those identifiers separately.

### Classification and ownership

`type` describes the document. It is separate from the Unit of Work's kind, such as Walking skeleton. Use lowercase words separated by hyphens. A stage transition does not change the document's type.

#### Accepted type values

| Value | Applies to |
| --- | --- |
| `unit-of-work` | The Unit of Work definition in `unit-of-work.md`. |
| `functional-design` | Functional Design in `design.md`. |
| `non-functional-requirements` | Quality Requirements in `quality.md`. |
| `project-reference` | Shared Project reference documents. |
| `supporting-document` | Optional supporting Markdown documents, such as research notes or domain-model detail. |
| `implementation-plan` | The Implementation Planning artifact `plan.md`, accepted under [IP02](authoring_progress.md#implementation-planning-decisions). |
| `delivery-plan` | The Deliver artifact `delivery.md`, accepted under [DL03](authoring_progress.md#deliver-decisions). |

Use the generic `supporting-document` type under [DF06](authoring_progress.md#completed-shared-decisions). Describe each document's purpose in its content and in the link from its owning stage. Keep the existing required-document and Project reference types unchanged. Define additional values when their artifact contracts are agreed.

The accepted [Implementation Planning contract](phases/construction/implementation-planning.md#artifact-metadata) assigns `implementation-plan` to `plan.md`. The accepted [Deliver contract](phases/construction/deliver.md#required-delivery-instructions) assigns `delivery-plan` to `delivery.md`. These are artifact types, not new common fields.

#### Unit ownership

`unit_id` records ownership. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The CLI uses the machine-local creation date and a descriptive slug. Unit IDs are unique within a project and remain unchanged across revisions. References to other units do not change ownership.

### Labels

Store `labels` as a list of strings. The field is shared metadata and can be used by any artifact. Omit the field when the list is empty.

Kepler can define canonical labels with documented meanings. The vocabulary is open: the requester can add other labels. A label does not need to be in the canonical list to be valid.

Do not use labels to record execution state, including progress, approval, or completion. That information is derived from CLI-managed JSON event journals.

#### Label syntax and validation

Apply the Kubernetes label-key syntax to each string. Keep the list representation; this does not introduce Kubernetes key/value pairs.

- Each label has a required name and an optional prefix, in `prefix/name` form.
- The name must contain 1 to 63 ASCII characters. It must start and end with a letter or digit. Internal characters can be letters, digits, hyphens (`-`), underscores (`_`), or dots (`.`). Uppercase and lowercase letters are permitted.
- An optional prefix must be a DNS subdomain of at most 253 characters, followed by one slash (`/`). Its domain segments use lowercase letters, digits, and hyphens, separated by dots.
- Whitespace is not permitted, including leading, trailing, or internal spaces.
- Label matching is case-sensitive. Duplicate strings are invalid.
- Canonical labels use their documented spelling. Requester-defined labels must follow the same syntax, but do not need a canonical entry.

These are naming rules. Kubernetes resource and controller behavior is not part of this contract.

Syntax sources:

- Label keys: `https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/`.
- DNS subdomains: `https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-subdomain-names`.

##### Example

These labels are illustrative:

```yaml
labels:
  - "walking-skeleton"
  - "example.com/Customer-Experience"
```

#### Canonical labels

| Label | Meaning |
| --- | --- |
| `walking-skeleton` | Identifies walking skeleton work under the shared [Unit of Work definition](unit-of-work.md#walking-skeleton). |

To classify a unit as a walking skeleton, record this label on its `unit-of-work.md`. The label can also be used on other artifacts to classify those artifacts. Those uses do not replace the classification in the unit definition. Do not require the label to be copied to every unit-owned artifact.

### Author identity

`author` identifies the artifact's original creator. Store it as one string in `Name <email>` form. Use Git `user.name` for the name and Git `user.email` for the email.

When creating the artifact, use the planned [current-author CLI command](runtime.md#current-author) to obtain these values from the effective Git configuration for the current project.

Preserve `author` during subsequent edits, including edits by another person. A different Git profile must not replace the stored attribution automatically. Explicit correction of incorrect attribution is permitted.

Record later contributions through Git history and audit records.

#### Example

This frontmatter field is illustrative:

```yaml
author: "Example Author <author@example.com>"
```

### Metadata changes

| Field | Permitted change |
| --- | --- |
| `type` | Deliberate reclassification. The content must satisfy the new artifact contract. |
| `unit_id` | Deliberate ownership transfer. Update the owning-unit reference and artifact location together. |
| `labels` | Additions and removals under the agreed label rules and canonical meanings. |

For these changes, preserve the artifact's UUID and original author. Validate affected artifact and unit contracts. These permissions do not waive the shared [revision rules](revision.md) for completed work.

### Field validation

Allow the six shared fields and additional fields defined by the artifact's agreed contract. Report any other field as a validation error, including misspelled field names.

Preserve invalid content for correction. Do not silently ignore or delete unknown fields.

This restriction applies to field names. Requester-defined label values remain permitted under the shared [labels contract](#labels); the canonical label list is not a closed set.

#### Value validation

- Required shared fields must be present and non-null.
- `id`, `type`, `author`, and applicable `unit_id` values must be non-empty strings.
- `author` must contain both a non-empty name and a non-empty email in the agreed format.
- `schema_version` must be the integer `3`. The string `"3"` is invalid.
- Omit unused optional fields. Do not set them to `null`.
- If present, `labels` must be a non-empty list of strings that satisfy the shared label rules.

Validation is read-only. Report errors without converting value types, generating missing IDs, or filling missing attribution. Preserve invalid content for correction. Creation operations can populate fields explicitly; validation must not repair them automatically.

### Extensions

Stage-specific contracts can add fields. They must not redefine the common fields. Define these extensions with the relevant artifact contracts later.

### Execution state

Keep execution state out of frontmatter. Record progress, approvals, effort selections, attempts, and pause checkpoints as CLI-owned JSON journal events. Derive current views from those events. Content fingerprints and execution timestamps also belong in that event history. See the shared [execution-state representation](runtime.md#execution-state-representation).

## Remaining decisions

Define stage-specific fields with their artifact contracts. The migration procedure remains outside the MVP under [DF05](authoring_progress.md#deferred-decisions).

The [authoring progress record](authoring_progress.md#completed-shared-decisions) lists the completed metadata decisions separately.
