# Workflow version 3: authoring progress

[Workflow phase index](README.md) | [Functional Design draft](phase_construction/functional-design.md)

## Purpose

Track the next authoring decisions and the decisions deferred to later work. This file records specification work, not the execution state of a Unit of Work.

The Functional Design contract remains a draft. A saved draft is not approval of all its contents.

## Agreed decisions

- Functional Design requires `unit-of-work.md` and `design.md` at `.kepler/units-of-work/<unit-id>/`.
- `unit-of-work.md` supplies the definition shared by all stages. Its required sections are Purpose, Scope, and Context. See the [section contract](phase_construction/functional-design.md#unit-of-work-definition).
- Functional Design requires Domain behavior, Domain model, Boundaries and interactions, and Design decisions and open questions in `design.md`. See the [section contract](phase_construction/functional-design.md#functional-design).
- Non-functional Requirements replaces Non-functional Design & Requirements. It requires `.kepler/units-of-work/<unit-id>/quality.md`.
- Applicable non-functional requirements include performance, availability, security, accessibility, compatibility, operability, and observability.
- Implementation Planning selects the technical solution before it divides the work into tasks. See the [stage boundaries](phase_construction/README.md#agreed-boundaries).
- `kepler-architect` is the Functional Design owner and uses `kepler-design`. No other agent roles are defined for this stage.
- Supporting skills adapt structured questioning, domain modeling, and research from `kepler-grilling`, `kepler-wayfinder-domain-modeling`, and `kepler-wayfinder-research`. Their paths and artifact contracts must follow version 3. See [supporting skills](phase_construction/functional-design.md#supporting-skills).
- Self-review is implemented within `kepler-design` and performed by `kepler-architect`. It is not a separate supporting skill. External review occurs only when the requester asks for it.
- Functional Design requires explicit requester approval, recorded through the `kepler` CLI in JSON execution state and audit history. Exact fields and formats remain in SH06. See [review and approval](phase_construction/functional-design.md#review-and-approval).
- [CLI infrastructure](runtime.md) separates mostly immutable artifact identity frontmatter from dynamic JSON execution state and audit records. Agents and skills operate on execution state through the CLI, not direct file edits.
- This persistence decision supersedes earlier choices to store approvals and changing depth selections in artifact metadata. Approval authority, depth selection rules, and revision semantics remain unchanged.
- The shared [Artifact metadata contract](metadata.md) defines `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels` as common frontmatter fields. `unit_id` is required for unit-owned artifacts and omitted from project-scoped artifacts. Stage-specific fields remain deferred.
- [Field validation](metadata.md#field-validation) permits only shared fields and extensions defined by the artifact's agreed contract. Unknown fields are errors. Preserve invalid content for correction; do not silently ignore or delete fields. Requester-defined label values remain open under the labels contract.
- [Value validation](metadata.md#value-validation) requires present, non-null required fields, correct types, non-empty strings, both author identity components, and integer schema version `3`. Omit unused optional fields; a present `labels` field must be a non-empty valid string list. Validation is read-only: do not convert types or fill missing values. Creation operations can populate fields explicitly.
- Optional [labels](metadata.md#labels) are shared by all artifact types. The vocabulary is open: Kepler can define canonical labels, and the requester can add other labels. Omit the field when empty and do not use labels for execution state. The canonical `walking-skeleton` label on `unit-of-work.md` records the unit's classification without a separate `unit_kind` field.
- [Label validation](metadata.md#label-syntax-and-validation) uses Kubernetes label-key syntax on the existing list of strings: a 1-to-63-character name with optional DNS prefix, no whitespace, case-sensitive matching, and no duplicate strings. This replaces the proposal to permit spaces in requester-defined labels.
- Accepted [artifact types](metadata.md#accepted-type-values) are `unit-of-work`, `functional-design`, `non-functional-requirements`, and `project-reference`. Supporting document types are deferred in DF06; the proposed generic `supporting-detail` value was not accepted.
- Artifact `id` values are CLI-generated UUIDv4 values with cross-project uniqueness. Store the full lowercase hexadecimal value in `8-4-4-4-12` hyphenated form, without prefixes or braces. Do not shorten IDs. They remain stable across content revisions, renames, and moves. Document purpose stays in `type`, not the ID.
- [Unit IDs](unit-of-work.md#identity-and-directory) use `YYYY-MM-DD-<slug>`, with the machine-local date when the CLI creates the unit. They are unique within the project and are the exact directory names. Keep them unchanged across revisions and retries. The CLI must detect duplicate IDs without overwriting an existing unit.
- [`schema_version`](metadata.md#schema-version) is the integer `3`, aligned with Kepler versioning. Future version-change and compatibility rules remain open.
- `author` identifies the original creator as one `Name <email>` string, using Git `user.name` and Git `user.email` at artifact creation. Preserve it during later edits, including edits by another person. Explicit correction of incorrect attribution is permitted. Record later contributions through Git history and audit records. The planned [current-author CLI command](runtime.md#current-author) returns the current project Git identity, not an existing artifact's stored creator. The command name, output format, and missing-value behavior remain open.
- Required documents have required sections. Additional detail lives in linked files under `details/`, not optional inline sections.
- Functional Design supporting files live under `details/functional-design/`.
- The shared [Depth definition](depth.md) uses Minimal, Standard, and Comprehensive levels. Set one unit default with explicit stage overrides. Use Standard when no other level is selected. The agent recommends adjustments; the requester decides.
- Depth controls analysis and documentation detail. It does not remove required information, weaken verification, or prescribe file counts or page lengths.
- The shared [Revision rules](revision.md) start at the earliest affected stage and reopen every downstream stage and its artifacts. Upstream stages remain complete while their contracts and outputs remain valid.
- Each stage contract defines a reopening questionnaire for the shared revision procedure. A questionnaire does not exempt downstream stages from the cascade. Functional Design defines its [questionnaire](phase_construction/functional-design.md#reopening-questionnaire).

## Next Functional Design decisions

All listed Functional Design decisions are agreed and recorded. Next, review the complete stage draft. The stage contract remains a draft until the requester accepts it as a whole. Shared decisions and later stage contracts remain open.

| ID | Decision | Questions to resolve | Status |
| --- | --- | --- | --- |
| FD01 | Required content | Agreed and recorded: [Unit of Work definition](phase_construction/functional-design.md#unit-of-work-definition) and [Functional Design contribution](phase_construction/functional-design.md#functional-design), including sufficient content and use of references. | Complete. |
| FD02 | Stage responsibilities and documents | Agreed and recorded: Non-functional Requirements uses `quality.md`; Implementation Planning selects the technical solution. See the [stage boundaries](phase_construction/README.md#agreed-boundaries). | Complete. |
| FD03 | Entry and completion conditions | Agreed and recorded: [entry conditions](phase_construction/functional-design.md#entry-conditions), [completion conditions](phase_construction/functional-design.md#completion-conditions), and [blocking rule](phase_construction/functional-design.md#blocking-rule). | Complete. |
| FD04 | Review and approval | Agreed and recorded: required self-review, requester-triggered external review, and explicit requester approval. The CLI records approval in JSON execution state and audit history. See [review and approval](phase_construction/functional-design.md#review-and-approval). | Complete. |
| FD05 | Reopening rules | Agreed and recorded: the [reopening questionnaire](phase_construction/functional-design.md#reopening-questionnaire) supplies stage-specific rules to the shared revision procedure. Existing self-review and approval conditions apply again. | Complete. |
| FD06 | Agents and skills | Agreed and recorded: [kepler-architect](phase_construction/functional-design.md#agent-roles), `kepler-design`, and [supporting skill responsibilities and adaptations](phase_construction/functional-design.md#supporting-skills). Other agent roles are excluded. | Complete. |

## Filename convention

Use short filenames with full words, without abbreviations. The agreed `quality.md` replaces the proposed `requirements.md` name. Non-functional Requirements does not share `design.md` with Functional Design.

## Shared decisions still pending

These decisions affect several stages. Define them in shared contracts rather than only in Functional Design.

Complete the core definitions of Project references (DF01), mostly immutable artifact frontmatter (SH02), and CLI infrastructure contracts (SH06). The shared [Depth definition](depth.md) records agreed levels, limits, inheritance, selection authority and procedure, recording requirements, and changes during work. SH03 is complete; depth state schemas and operations remain in SH06.

The [Unit of Work draft](unit-of-work.md) records the agreed acceptance-cohesion boundary, requirement coverage, explicit dependencies, verifiable outcomes, deployment aspect, and decomposition procedure. Detailed scope and size criteria, the decomposition questionnaire, and deployment content and location remain open in SH05. These decisions must make "fit within one Unit of Work" clear at Functional Design entry.

The [walking skeleton kind](unit-of-work.md#walking-skeleton) is agreed and recorded. It uses normal stages, documents, and approval rules. Inception can produce it, greenfield work can use it as the first unit, or it can be proposed before a requester's original unit. Adding that preceding unit requires requester agreement and an explicit dependency. Its classification uses the canonical `walking-skeleton` label in the unit definition's frontmatter, under the shared [labels contract](metadata.md#labels).

Use "Decomposition procedure" instead of "Application mechanism" for this procedure. The [AWS AI-DLC Units Generation reference](https://github.com/awslabs/aidlc-workflows/blob/main/docs/reference/04-stages/inception.md#stage-27-units-generation) supplies research for the remaining decomposition decisions. Its conventions are not automatically part of Kepler.

| ID | Decision | Open scope |
| --- | --- | --- |
| SH02 | Artifact metadata | Agreed: [common fields](metadata.md#common-fields), [UUIDv4 format](metadata.md#identity-and-content-versions), [original creator attribution and author string](metadata.md#author-identity), [schema version `3`](metadata.md#schema-version), [initial types](metadata.md#accepted-type-values), and [open-vocabulary labels](metadata.md#labels), including walking skeleton classification and [Kubernetes-style label validation](metadata.md#label-syntax-and-validation). [Strict field validation](metadata.md#field-validation) and [read-only value validation](metadata.md#value-validation) are also agreed. Define future schema-version rules and remaining metadata change rules. Supporting document types are deferred in DF06. Stage-specific extensions remain deferred. Dynamic execution data belongs to SH06. |
| SH04 | Revision and recovery | The [shared cascade rule and questionnaire mechanism](revision.md) are recorded. Still define editorial corrections and recovery from interrupted work. Stage questionnaires belong to stage contracts. |
| SH05 | Unit of Work scope | The [accepted rules, walking skeleton kind, and decomposition procedure](unit-of-work.md) are recorded in a draft. Still define detailed scope and size criteria, the decomposition questionnaire, and deployment content and location. |
| SH06 | CLI infrastructure | The [persistence separation and audit ownership](runtime.md) are agreed. Define JSON state and event schemas, paths, CLI commands, attempt identities, approval binding, consistent writes, recovery, and revision output retention. |

## Completed shared decisions

| ID | Decision | Record |
| --- | --- | --- |
| SH01 | Unit of Work identity | Agreed and recorded: [format, local creation date, project uniqueness, stable identity, and exact directory name](unit-of-work.md#identity-and-directory). The [CLI detects duplicate IDs](runtime.md#unit-creation) without overwriting an existing unit. |
| SH03 | Depth | Agreed and recorded: [levels and limits](depth.md#levels), [selection rules](depth.md#selection-rules), and [selection procedure](depth.md#selection-procedure). JSON execution-state representation and operations remain in SH06. |

## Deferred decisions

| ID | Decision | Return to it when |
| --- | --- | --- |
| DF01 | Project references | Define their internal document structure, authority, and update rules when we design these shared references. |
| DF02 | Inception | Define intent documents, terminology, and the production of one or more Units of Work when we design Inception. Include the previous route concept and its relationship to Units of Work. |
| DF03 | Initialization | Define project preparation when we design the Initialization phase. |
| DF04 | Later construction stages | Define the remaining stage contracts, artifact sections, reopening questionnaires, agents, and skills after Functional Design. Include the location of the technical design record from Implementation Planning. Use the [stage outline](phase_construction/README.md#stage-outline). |
| DF05 | Migration procedure | Before migration support is implemented, define the procedure for moving from version 2 to version 3. Include moving old artifacts to `.kepler/deprecated/v2/`. |
| DF06 | Supporting document types | When their artifact contracts are designed, decide whether supporting documents use a generic type or types specific to their purpose or document. No proposed alternative is selected. |

## Record maintenance

Update this file when a decision changes. Mark a decision complete only after the requester agrees and the relevant specification records it. Link to that specification when a decision is complete.

Keep proposed choices distinct from agreed choices. Do not move a deferred decision into the current scope without an explicit decision.

Use ASD-STE100 Simplified Technical English. Do not run workflow-reference tests.
