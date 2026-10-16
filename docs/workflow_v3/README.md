# Kepler workflow reference: version 3

## Purpose

This folder is the canonical source for the version 3 Kepler workflow. Derive skills, CLI features, templates, tests, and user documentation from this specification.

The specification is under development. A draft contract records a proposal for discussion. Permission to save a draft does not mean approval of its contents.

[Authoring progress](authoring_progress.md) tracks the next decisions, shared open questions, and deferred work.

The [version 2 reference](../workflow_v2/README.md) remains a separate document set. Its contracts do not automatically apply to version 3.

## Phase organization

| Phase | Responsibility | Reference status |
| --- | --- | --- |
| Initialization | Prepare the project, its standards, and its workspace. | Phase contract not yet defined. |
| Inception | Investigate the intended outcome and define one or more Units of Work. | Phase contract not yet defined. |
| Construction | Design, plan, implement, validate, review, and deliver one Unit of Work. | See [Construction](phase_construction/README.md). |

Project preparation belongs to Initialization, not Construction. A clear request can enter Construction without Inception.

Intent documents belong to Inception. Their structure and the terms for their organization remain outside the current design scope.

## Shared concepts

A **Unit of Work** replaces the previous **change** concept. Construction operates on one Unit of Work. A Unit of Work can contain several implementation tasks.

A **stage** defines a workflow responsibility. A skill supplies a procedure that can support that responsibility. Stage boundaries do not depend on skill names or packaging.

## Document scopes

| Scope | Proposed project path | Responsibility |
| --- | --- | --- |
| Application reference | `.kepler/reference/` | Supply shared application context across Units of Work. This scope has a role similar to the AWS AI-DLC CodeKB. |
| Unit of Work documents | `.kepler/units-of-work/<unit-id>/` | Describe the purpose, requirements, design, decisions, and evidence for one Unit of Work. |

Paths are relative to the project repository root. `<unit-id>` identifies one Unit of Work and remains stable across stages and retries. Its format requires a separate decision.

Required Unit of Work documents live directly under `.kepler/units-of-work/<unit-id>/`. Additional detail lives in linked files under `details/`. Stage-specific detail uses a stage subdirectory, such as `details/functional-design/`.

The [Functional Design artifact draft](phase_construction/functional-design.md#artifacts) requires `unit-of-work.md` and `design.md` at the Unit of Work root. The draft defines the required sections of both documents for Functional Design. Non-functional Requirements uses a separate required `quality.md` at the same root. Other artifact contracts for later stages remain undecided.

These paths do not migrate existing artifacts or change current CLI path rules.

Application reference authority, internal file structure, and update rules require further decisions. The distinction between observed facts and proposed behavior must remain explicit.

## Depth

[Depth](depth.md) defines the shared Minimal, Standard, and Comprehensive levels. Depth controls the detail of analysis and documentation. It does not remove required information or weaken verification.

Stages apply this shared definition to their work. Depth does not prescribe a file count or page length.

## Writing convention

Use ASD-STE100 Simplified Technical English for text added or changed in this reference. Keep commands, paths, schema fields, and stored values in their exact spelling.

The [ASD-STE100 site](https://www.asd-ste100.org/) provides the standard. This reference does not claim certified language validation.
