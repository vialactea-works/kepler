# Kepler workflow reference: version 3

## Purpose

This folder is the canonical source for the version 3 Kepler workflow. Derive skills, CLI features, templates, tests, and user documentation from this specification.

The specification is under development. A draft contract records a proposal for discussion. Permission to save a draft does not mean approval of its contents.

[Authoring progress](authoring_progress.md) tracks the next decisions, shared open questions, and deferred work.

[Skills](skills.md) defines version 3 skill names and responsibilities.

The version 2 reference remains a separate document set. Its contracts do not automatically apply to version 3.

## Phase organization

| Phase | Responsibility | Reference status |
| --- | --- | --- |
| Initialization | Prepare the project, its standards, and its workspace. | Phase contract not yet defined. |
| Inception | Investigate the intended outcome and define one or more Units of Work. | Phase contract not yet defined. |
| Construction | Design, plan, implement, validate, review, and deliver one Unit of Work. | See [Construction](phase_construction/README.md). |

Each phase is a bounded context and owns its execution state model and projection schemas. Shared tracking mechanics do not impose a universal unit/task hierarchy.

Project preparation belongs to Initialization, not Construction. A clear request can enter Construction without Inception.

Construction executes task graphs through [Implementation Execution](phase_construction/README.md#implementation-execution), between Implementation Planning and Unit of Work Review. This unit-scoped stage contains task scopes that can run in parallel when dependencies permit. Each task follows the fixed [Activity](activity.md) sequence: Code Generation, Code Validation, then Code Integration. Dedicated [Code Generation](phase_construction/code-generation.md), [Code Validation](phase_construction/code-validation.md), and [Code Integration](phase_construction/code-integration.md) contracts define those Activities. These execution relationships apply only to Construction.

[Code Integration](phase_construction/code-integration.md#integration-procedure) prepares and checks each combined candidate under the unit lock. Authorized operations accept only the checked material. Typechecking, the project build, and the full application test suite must succeed before acceptance. This serializes integrations within that unit while preserving permitted work on other tasks and units.

During Construction's [unit-wide upstream revision](phase_construction/README.md#unit-wide-upstream-revision), the orchestrator stops new task admissions and active implementation work for that unit. Independent units continue while their inputs and contracts remain valid.

Intent documents belong to Inception. Their structure and the terms for their organization remain outside the current design scope.

## Shared concepts

A **Unit of Work** replaces the previous **change** concept. Construction operates on one Unit of Work. A Unit of Work can contain several implementation tasks. The shared [Unit of Work draft](unit-of-work.md) defines the acceptance boundary, decomposition procedure, and walking skeleton kind.

A **stage** defines a workflow responsibility. Its phase contract defines its execution scope. A skill supplies a procedure that can support that responsibility. Stage boundaries do not depend on skill names or packaging.

An [Activity](activity.md) is a bounded execution responsibility within a stage. Its owning phase or stage defines its scope, outcomes, procedure, checks, evidence, completion, correction paths, and handoffs. Activities are not stages, agents, skills, planned tasks, or independent lifecycle milestones.

An **orchestrator agent** decides whether to start a revision and where it starts. Stage agents report findings and propose revision boundaries. See [Authority and escalation](revision.md#authority-and-escalation) for its revision authority and safeguards.

A **revision** returns work to the earliest affected stage and every downstream stage within the scope authorized by the orchestrator. [Revision](revision.md) defines the shared rules, artifact cascade, and execution procedure. Upstream stages remain complete while their contracts and outputs remain valid.

## Document scopes

| Scope | Proposed project path | Responsibility |
| --- | --- | --- |
| Project references | `.kepler/reference/` | Supply shared application context across Units of Work. This scope has a role similar to the AWS AI-DLC CodeKB. |
| Unit of Work documents | `.kepler/units-of-work/<unit-id>/` | Describe the purpose, requirements, design, decisions, and evidence for one Unit of Work. |

Paths are relative to the project repository root. `<unit-id>` uses `YYYY-MM-DD-<slug>`, with the machine-local date when the CLI creates the unit. It is unique within the project and is the exact directory name. Follow the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The complete ID remains stable across stages, revisions, and retries.

Required Unit of Work documents live directly under `.kepler/units-of-work/<unit-id>/`. Additional detail lives in linked files under `details/`. Stage-specific detail uses a stage subdirectory, such as `details/functional-design/`.

The accepted [Functional Design artifact contract](phase_construction/functional-design.md#artifacts) requires `unit-of-work.md` and `design.md` at the Unit of Work root. The contract defines the required sections of both documents for Functional Design. Quality Requirements uses a separate required `quality.md` at the same root. Its [accepted contract](phase_construction/quality-requirements.md) defines the stage and artifact requirements. Implementation Planning produces required `plan.md` and `tasks-dag.json` at the unit root. The [accepted task graph specification](phase_construction/task-graph.md) defines its task content, dependency and prerequisite rules, validation, and JSON Schema. Its [stage draft](phase_construction/implementation-planning.md) defines the agreed artifact split and proposes the remaining contract.

The [Execution draft](phase_construction/implementation-execution.md#artifacts-and-records) proposes implementation outputs and scoped CLI-owned evidence, without a required execution Markdown document. The [Review draft](phase_construction/unit-of-work-review.md#artifacts-and-records) proposes review records without a required review Markdown document. The [Deliver draft](phase_construction/deliver.md#artifacts) proposes required `delivery.md` for authored instructions. Operation results and changing execution state remain separate CLI-owned records. These artifact proposals do not mark the remaining stage contracts as accepted.

These paths do not migrate existing artifacts or change current CLI path rules.

The authority, internal file structure, and update rules for Project references require further decisions. The distinction between observed facts and proposed behavior must remain explicit.

## Artifact metadata

The shared [Artifact metadata contract](metadata.md) defines `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels` as common frontmatter fields. `unit_id` is required for unit-owned artifacts and omitted from project-scoped artifacts. Author identity uses Git `user.name` and Git `user.email`.

Optional [labels](metadata.md#labels) can classify any artifact. Canonical labels do not form a closed set; the requester can add labels. Omit the field when empty. Labels must not record execution state.

The metadata contract defines field and value validation, metadata changes, and schema-version rules. Optional supporting Markdown documents use the generic [`supporting-document` type](metadata.md#accepted-type-values). Define any stage-specific fields with their artifact contracts.

## CLI infrastructure and persistence

[CLI infrastructure](runtime.md) separates mostly immutable artifact metadata from dynamic execution state. Markdown artifact identity belongs in frontmatter. Execution state is derived from authoritative phase-owned JSON event journals under the shared [representation contract](runtime.md#execution-state-representation).

No independently authoritative state files are required. Materialized views are rebuildable, not sources of workflow truth.

Agents and skills use CLI-owned operations; they do not edit journals or projections directly. This decision does not change authored artifact content or implement new CLI commands.

The [evidence and checkpoint model](runtime.md#evidence-and-content-checkpoints) separates attempt identity from commit identity. Each attempt has a distinct identity. Construction limits each unit/stage and fixed Activity occurrence to zero or one active attempt under the [attempt scope rules](runtime.md#attempt-identity-and-active-scope). Activity attempts link to their occurrence and enclosing stage attempt. Other phases define their own execution scopes. Material types are open-ended. Git checkpoints cover repository content; other material uses appropriate references. Records bind checks and approvals to the material covered and its relevant inputs.

The [run floor](runtime.md#run-floor) uses the applicable attempt identity, without a separate boundary inside the attempt.

The [parallel execution rules](runtime.md#parallel-execution) permit dependency-ready tasks and independent units to progress concurrently. Task admission captures the current unit integration commit containing all required predecessor outputs. The admitted task then keeps its recorded baseline. A moving global coordinator `HEAD` or unrelated commit does not automatically invalidate its work.

## Depth

[Depth](depth.md) defines the shared Minimal, Standard, and Comprehensive levels. Depth controls the detail of analysis and documentation. It does not remove required information or weaken verification.

Each Unit of Work has one default depth. Use Standard when the requester has not selected another level. Stages inherit the unit default unless an explicit stage override exists. The agent recommends adjustments; the requester decides whether to accept them.

Stages apply this shared definition to their work. Activities inherit their owning stage's depth and do not have separate overrides. Depth does not prescribe a file count or page length. Record depth selections as journal events through the CLI. Derive current settings from those events. Exact payloads, projection fields, and CLI operations remain part of the shared CLI infrastructure contract.

## Writing convention

Use ASD-STE100 Simplified Technical English for text added or changed in this reference. Keep commands, paths, schema fields, and stored values in their exact spelling.

Keep links in this specification within `workflow_v3/`. Use the local skill reference instead of links to current skill implementations.

The ASD-STE100 site provides the standard: `https://www.asd-ste100.org/`. This reference does not claim certified language validation.
