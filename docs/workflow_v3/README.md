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

Each phase is a bounded context and owns its execution state model and projection schemas. Shared tracking mechanics do not impose a universal unit/task hierarchy.

Project preparation belongs to Initialization, not Construction. A clear request can enter Construction without Inception.

Construction executes task graphs through [Implementation Execution](phase_construction/README.md#implementation-execution), between Implementation Planning and Unit of Work Review. This unit-scoped stage contains parallel task implementation contexts. Each context contains the Task coding loop and Task Integration. These execution relationships are specific to Construction.

[Task Integration](phase_construction/README.md#integration-order-and-locking) prepares, checks, then accepts each candidate under a unit-scoped lock. The project build and full application test suite must succeed against the candidate before acceptance. This serializes integrations within that unit while preserving permitted coding, validation, and cross-unit parallelism.

During Construction's [unit-wide upstream revision](phase_construction/README.md#unit-wide-upstream-revision), the orchestrator stops new task admissions and active implementation work for that unit. Independent units continue while their inputs and contracts remain valid.

Intent documents belong to Inception. Their structure and the terms for their organization remain outside the current design scope.

## Shared concepts

A **Unit of Work** replaces the previous **change** concept. Construction operates on one Unit of Work. A Unit of Work can contain several implementation tasks. The shared [Unit of Work draft](unit-of-work.md) defines the acceptance boundary, decomposition procedure, and walking skeleton kind.

A **stage** defines a workflow responsibility. Its phase contract defines its execution scope. A skill supplies a procedure that can support that responsibility. Stage boundaries do not depend on skill names or packaging.

An **orchestrator agent** decides whether to start a revision and where it starts. Stage agents report findings and propose revision boundaries. See [Authority and escalation](revision.md#authority-and-escalation) for its revision authority and safeguards.

A **revision** returns work to the earliest affected stage and every downstream stage within the scope authorized by the orchestrator. [Revision](revision.md) defines the shared rules, artifact cascade, and execution procedure. Upstream stages remain complete while their contracts and outputs remain valid.

## Document scopes

| Scope | Proposed project path | Responsibility |
| --- | --- | --- |
| Project references | `.kepler/reference/` | Supply shared application context across Units of Work. This scope has a role similar to the AWS AI-DLC CodeKB. |
| Unit of Work documents | `.kepler/units-of-work/<unit-id>/` | Describe the purpose, requirements, design, decisions, and evidence for one Unit of Work. |

Paths are relative to the project repository root. `<unit-id>` uses `YYYY-MM-DD-<slug>`, with the machine-local date when the CLI creates the unit. It is unique within the project and is the exact directory name. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The complete ID remains stable across stages, revisions, and retries.

Required Unit of Work documents live directly under `.kepler/units-of-work/<unit-id>/`. Additional detail lives in linked files under `details/`. Stage-specific detail uses a stage subdirectory, such as `details/functional-design/`.

The [Functional Design artifact draft](phase_construction/functional-design.md#artifacts) requires `unit-of-work.md` and `design.md` at the Unit of Work root. The draft defines the required sections of both documents for Functional Design. Non-functional Requirements uses a separate required `quality.md` at the same root. Other artifact contracts for later stages remain undecided.

These paths do not migrate existing artifacts or change current CLI path rules.

The authority, internal file structure, and update rules for Project references require further decisions. The distinction between observed facts and proposed behavior must remain explicit.

## Artifact metadata

The shared [Artifact metadata contract](metadata.md) defines `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels` as common frontmatter fields. `unit_id` is required for unit-owned artifacts and omitted from project-scoped artifacts. Author identity uses Git `user.name` and Git `user.email`.

Optional [labels](metadata.md#labels) can classify any artifact. Canonical labels do not form a closed set; the requester can add labels. Omit the field when empty. Labels must not record execution state.

The metadata contract defines field and value validation, metadata changes, and schema-version rules. Supporting document types remain unresolved under [DF06](authoring_progress.md#stage-contract-decisions) and are required for the Construction MVP. Define any stage-specific fields with their artifact contracts.

## CLI infrastructure and persistence

[CLI infrastructure](runtime.md) separates mostly immutable artifact metadata from dynamic execution state. Artifact identity belongs in frontmatter. Execution state is derived from authoritative phase-owned JSON event journals under the shared [representation contract](runtime.md#execution-state-representation).

No independently authoritative state files are required. Materialized views are rebuildable, not sources of workflow truth.

Agents and skills use CLI-owned operations; they do not edit journals or projections directly. This decision does not change authored artifact content or implement new CLI commands.

The [evidence and checkpoint model](runtime.md#evidence-and-content-checkpoints) separates attempt identity from commit identity. Each attempt has a distinct identity. Construction limits each unit/task/stage scope to zero or one active attempt under the [attempt scope rules](runtime.md#attempt-identity-and-active-scope). Other phases define their own execution scopes. Material types are open-ended. Git checkpoints cover repository content; other material uses appropriate references. Records bind checks and approvals to the material covered and its relevant inputs.

The [run floor](runtime.md#run-floor) uses the applicable attempt identity, without a separate boundary inside the attempt.

The [parallel execution rules](runtime.md#parallel-execution) permit dependency-ready tasks and independent units to progress concurrently. Task admission captures the current unit integration commit containing all required predecessor outputs. The admitted task then keeps its recorded baseline. A moving global coordinator `HEAD` or unrelated commit does not automatically invalidate its work.

## Depth

[Depth](depth.md) defines the shared Minimal, Standard, and Comprehensive levels. Depth controls the detail of analysis and documentation. It does not remove required information or weaken verification.

Each Unit of Work has one default depth. Use Standard when the requester has not selected another level. Stages inherit the unit default unless an explicit stage override exists. The agent recommends adjustments; the requester decides whether to accept them.

Stages apply this shared definition to their work. Depth does not prescribe a file count or page length. Record depth selections as journal events through the CLI. Derive current settings from those events. Exact payloads, projection fields, and CLI operations remain part of the shared CLI infrastructure contract.

## Writing convention

Use ASD-STE100 Simplified Technical English for text added or changed in this reference. Keep commands, paths, schema fields, and stored values in their exact spelling.

The [ASD-STE100 site](https://www.asd-ste100.org/) provides the standard. This reference does not claim certified language validation.
