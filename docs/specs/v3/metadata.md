# Artifact metadata

[Workflow phase index](README.md)

## Purpose

This document gives the common frontmatter fields for Kepler Markdown artifacts. These fields apply to required documents, supporting documents, and Project references.

The requester accepted the common fields, validation rules, metadata change rules, and schema-version rules. Use `supporting-document` for optional Markdown documents. Add stage-specific fields with their artifact contracts. This document does not add schemas or change existing artifacts.

## Common fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | Yes. | CLI-generated UUIDv4 with cross-project uniqueness, stored in full lowercase hyphenated form. Keep it across content revisions, renames, and moves. |
| `type` | Yes. | The artifact's purpose. It does not identify the current workflow stage. |
| `schema_version` | Yes. | Integer `3` for the current frontmatter contract, aligned with Kepler versioning. It is not the content revision. |
| `unit_id` | For unit-owned artifacts. | The owning Unit of Work's `YYYY-MM-DD-<slug>` ID, identical to its directory name. Omit this field from project-scoped artifacts. |
| `author` | Yes. | The original creator's Git identity as one `Name <email>` string. Keep it during later edits. |
| `labels` | No. | Use canonical labels or labels selected by the requester to classify artifacts. Omit this field when empty. |

## Rules

### Schema version

Set `schema_version` to the Kepler major version. Use the integer `3` for Kepler 3.x. This value identifies the metadata contract, not an artifact's content revision.

- Do not change the schema version for minor or patch releases.
- Artifacts that are valid must stay valid within the same major version.
- A new Kepler major version is necessary when a change invalidates existing valid artifacts.
- The CLI must report unsupported schema versions. It must leave those artifacts unchanged.
- Do not migrate data automatically. The migration procedure stays deferred under [DF05](authoring_progress.md#deferred-decisions).

### Identity and content versions

Use the `kepler` CLI to create artifact IDs as UUIDv4 values with cross-project uniqueness. Store the full value as lowercase hexadecimal in `8-4-4-4-12` form, with hyphens between groups. Do not use prefixes, braces, or shortened IDs.

Keep document purpose in `type`. Do not encode it in the ID.

`id` identifies the artifact, not one version of its contents. Execution records must bind approvals to content versions separately.

Task UUIDs identify tasks, not their containing artifact or execution attempt. The [task graph format](phases/construction/task-graph.md#task-identity) sets those identifiers separately.

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

Use the generic `supporting-document` type under [DF06](authoring_progress.md#completed-shared-decisions). Describe each document's purpose in its content and in the link from its owning stage. Keep existing types for required unit documents and Project references unchanged. Add values when their artifact contracts are agreed.

The accepted [Implementation Planning contract](phases/construction/implementation-planning.md#artifact-metadata) assigns `implementation-plan` to `plan.md`. The accepted [Deliver contract](phases/construction/deliver.md#required-delivery-instructions) assigns `delivery-plan` to `delivery.md`. These are artifact types, not new common fields.

#### Unit ownership

`unit_id` records ownership. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The CLI uses the machine-local creation date and a descriptive slug. Unit IDs are unique within a record-home project and stay unchanged across revisions. References to other units do not change ownership.

### Labels

Store `labels` as a list of strings. Each artifact can use this shared metadata. Omit the field when the list is empty.

Kepler can set canonical labels with documented meanings. The requester has permission to add other labels. A canonical list entry is not necessary for a label to be valid.

Do not use labels to record execution state, including progress, approval, or completion. That information is derived from CLI-managed JSON event journals.

#### Label syntax and validation

Apply the Kubernetes label-key syntax to each string. Keep the list representation. This does not introduce Kubernetes key/value pairs.

- Each label has a required name and an optional prefix, in `prefix/name` form.
- The name must contain 1 to 63 ASCII characters. It must start and end with a letter or digit. Internal characters can be letters, digits, hyphens (`-`), underscores (`_`), or dots (`.`). Uppercase and lowercase letters are valid.
- An optional prefix must be a DNS subdomain of at most 253 characters, followed by one slash (`/`). Its domain segments use lowercase letters, digits, and hyphens, separated by dots.
- Do not use whitespace, including leading, trailing, or internal spaces.
- Label matching is case-sensitive. Duplicate strings are invalid.
- Canonical labels use their documented spelling. Labels selected by the requester must use the same syntax, but a canonical entry is not necessary.

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

To classify a unit as a walking skeleton, record this label on its `unit-of-work.md`. You may use the label on other artifacts to classify them. Those uses do not replace the classification in the unit definition. Do not copy the label to every unit-owned artifact.

### Author identity

`author` identifies the artifact's original creator. Store it as one string in `Name <email>` form. Use Git `user.name` for the name and Git `user.email` for the email.

When you create an artifact, use the accepted [current-author CLI command](runtime.md#current-author) to read these values. The command reads the selected project's effective Git configuration.

Keep `author` during subsequent edits, including edits by another person. A different Git profile must not replace the stored attribution automatically. Change `author` only to correct incorrect attribution explicitly.

Record later contributions through Git history and audit records.

#### Missing identity

Before creating an artifact that has an `author` field, resolve both effective project Git identity values.

Treat an absent, empty, or whitespace-only `user.name` or `user.email` as missing. If either value is missing, return a nonzero result and identify each missing key.

Create the artifact only when both identity values are present. Do not leave incomplete author metadata or record successful creation or completion for the affected operation.

Do not invent a fallback identity, prompt inside the CLI, or change Git configuration automatically.

The calling agent explains the problem and the necessary Git configuration. Retry the affected creation after the appropriate Git identity is configured.

Keep existing authors. Let unaffected work continue. Other operations keep their own identity and authority requirements.

[SH61](authoring_progress.md#completed-shared-decisions) records this policy. SH60 fixes the command and success fields; command-specific error-code values remain implementation choices. Existing identity-format and read-only validation rules stay unchanged.

#### Example

This frontmatter field is illustrative:

```yaml
author: "Example Author <author@example.com>"
```

### Metadata changes

| Field | Change permission |
| --- | --- |
| `type` | Deliberate reclassification. The content must satisfy the new artifact contract. |
| `unit_id` | Deliberate ownership transfer. Update the owning-unit reference and artifact location together. |
| `labels` | Additions and removals under the agreed label rules and canonical meanings. |

For these changes, keep the artifact's UUID and original author. Validate affected artifact and unit contracts. These permissions do not waive the shared [revision rules](revision.md) for completed work.

### Field validation

Accept the six shared fields and the additional fields set by the artifact's agreed contract. Report every other field as a validation error, including misspelled field names.

Keep invalid content for correction. Do not silently ignore or delete unknown fields.

This restriction applies to field names. The shared [labels contract](#labels) accepts values selected by the requester. The canonical label list is not closed.

#### Value validation

- Required shared fields must be present and non-null.
- `id`, `type`, `author`, and applicable `unit_id` values must be non-empty strings.
- `author` must contain both a non-empty name and a non-empty email in the agreed format.
- `schema_version` must be the integer `3`. The string `"3"` is invalid.
- Omit unused optional fields. Do not set them to `null`.
- If present, `labels` must be a non-empty list of strings that satisfy the shared label rules.

Validation is read-only. Report errors. Do not convert value types, generate missing IDs, or fill missing attribution. Keep invalid content for correction. Creation operations can populate fields explicitly. Validation must not fix them automatically.

The [shared lint interface](cli.md#kepler-lint) sets explicit file inputs and diagnostic results. It does not change these validation rules.

### Extensions

Stage-specific contracts can add fields. They must not redefine the common fields. Add these fields to the relevant artifact contracts later.

### Execution state

Keep execution state out of frontmatter. Record progress, approvals, effort selections, attempts, and pause checkpoints as CLI-owned JSON journal events. Derive current views from those events. Content fingerprints and execution timestamps also belong in that event history. See the shared [execution-state representation](runtime.md#execution-state-representation).

## Remaining decisions

Add stage-specific fields to their artifact contracts. This specification does not define a migration procedure. [DF05](authoring_progress.md#deferred-decisions) tracks that open question.

The [authoring progress record](authoring_progress.md#completed-shared-decisions) lists the completed metadata decisions separately.
