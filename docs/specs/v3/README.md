# Kepler workflow reference: version 3

## Purpose

This folder is the canonical source for the version 3 Kepler workflow. Use this specification to make skills, CLI features, templates, tests, and user documentation.

This reference contains approved Construction MVP contracts and deferred design work. Each document states its status. An approved contract does not show implementation or release.

[Authoring progress](authoring_progress.md) lists the next decisions, shared open questions, and deferred work.

[Skills](skills.md) sets version 3 skill names and responsibilities.

[CLI commands and contracts](cli.md) defines the approved CLI interfaces under SH122. Details left unspecified remain implementation choices.

[Mission](mission.md) owns the accepted mission identity, record-home, workspace, storage, checkpoint, recovery, and pre-mission contracts.

[Git diff packages](diff-package.md) sets rules for generated inspection material in three existing Construction scopes. It is a Git capability, not a new workflow milestone.

The [Construction runtime contract](phases/construction/runtime.md) defines approved Construction state, event, and operation requirements under CN23. The accepted [Mission contract](mission.md) owns mission and storage policy. Neither document adds a stage.

The [installation contract](installation.md) is approved under SH124, including its installation-generation record. Earlier setup, intended-target, and resource-ownership decisions under SH114, SH116, and SH117 keep their scope. Specification approval does not show implemented or released v3 behavior.

The version 2 reference stays in a separate document set. Its contracts do not automatically apply to version 3.

## Phase organization

| Phase | Responsibility | Reference status |
| --- | --- | --- |
| Initialization | Prepare the project, its standards, and its workspace. | No phase contract is set yet. |
| Inception | Investigate the intended outcome and identify one or more Units of Work. | No phase contract is set yet. |
| Construction | Own stages for Functional Design, Quality Requirements, Implementation Planning, Implementation, Unit of Work Review, and Deliver. | See [Construction](phases/construction/README.md). |

Each phase is a bounded context and owns its execution state model and projection schemas. Shared tracking rules do not impose a universal unit/task hierarchy.

General project preparation belongs to Initialization, not Construction. Mission startup is separate and adds no stage. A clear request can enter Construction without Inception.

The [Standard workflow](workflows/standard/README.md#stages) puts Implementation between Implementation Planning and Unit of Work Review. Construction sets that stage's [task execution rules](phases/construction/README.md#implementation). This unit-scoped stage contains task scopes that can run in parallel when their dependencies are satisfied. Each task follows the fixed [Activity](activity.md) sequence: Code Generation, Code Validation, then Code Integration. Dedicated [Code Generation](phases/construction/activities/code-generation.md), [Code Validation](phases/construction/activities/code-validation.md), and [Code Integration](phases/construction/activities/code-integration.md) contracts set those Activity rules. These execution relationships apply only to Construction.

[Code Integration](phases/construction/activities/code-integration.md#integration-procedure) prepares and checks each combined candidate under the unit lock. Authorized operations accept only the checked material. Typechecking, the project build, and the full application test suite must succeed before acceptance. This serializes integrations within that unit while work on other tasks and units can continue under their own contracts. The [shared runtime](runtime.md#short-scoped-coordination) sets lock and ownership rules. The [Mission contract](mission.md#local-storage-and-concurrency) sets local coordination domains.

During Construction's [unit-wide upstream revision](phases/construction/README.md#unit-wide-upstream-revision), the orchestrator stops new task admissions and active implementation work for that unit. Independent units continue while their inputs and contracts stay valid.

Intent documents belong to Inception. Their structure and organization terms are outside the current design scope.

## Workflows

[Standard](workflows/standard/README.md) selects the complete Construction stage sequence and its handoffs. Each stage keeps the contract set by its owning phase.

## Reference organization

| Area | Location | Responsibility |
| --- | --- | --- |
| Core concepts | This directory. | Give shared concepts, artifact rules, effort, revision, and tracking rules. |
| Phase contracts | `phases/<phase>/` | Set phase-owned stage contracts and execution scopes. |
| Construction Activities | [activities/](phases/construction/activities/README.md) within Construction. | Give compact contracts for Activities inside Implementation. |
| Workflow composition | [workflows/standard/](workflows/standard/README.md) | Select stages and set their order and routing. |

These locations organize the specification. The [Mission contract](mission.md#durable-layout) sets mission-owned unit paths. This organization does not implement a workflow engine.

## Shared concepts

A **workflow** selects a series of phase-owned stages. Its definition sets their order and routing. The selected stages keep their own contracts.

A **Unit of Work** replaces the previous **change** concept. Standard has one Unit of Work per mission. A Unit of Work can contain several implementation tasks. The shared [Unit of Work contract](unit-of-work.md), approved under SH123, sets its acceptance boundary, decomposition procedure, and walking skeleton kind.

A **stage** sets a phase-owned responsibility that workflows can use. Its phase contract sets its execution scope. A skill gives a procedure that can help with that responsibility. Stage boundaries do not depend on skill names or packaging.

An [Activity](activity.md) is a bounded execution responsibility within a stage. Its owning phase or stage sets its scope, outcomes, procedure, checks, evidence, completion, correction paths, and handoffs. Activities are not stages, agents, skills, planned tasks, or independent lifecycle milestones.

An **orchestrator agent** decides whether to start a revision and where it starts. Stage agents report findings and propose revision boundaries. See [Authority and escalation](revision.md#authority-and-escalation) for its revision authority and safeguards.

A **revision** returns work to the earliest affected stage and every downstream stage within the scope authorized by the orchestrator. [Revision](revision.md) sets the shared rules, artifact cascade, and execution procedure. Upstream stages stay complete while their contracts and outputs stay valid.

## Document scopes

| Scope | Project path | Responsibility |
| --- | --- | --- |
| Project references | `.kepler/reference/` | Supply shared application context across Units of Work. This scope has a role similar to the AWS AI-DLC CodeKB. |
| Mission-owned Unit of Work documents | `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/` | Describe the purpose, requirements, design, decisions, and evidence for one Unit of Work. |

Paths are relative to the selected record-home working-tree root. `<unit-id>` uses `YYYY-MM-DD-<slug>`, with the machine-local date when the CLI creates the unit. It is unique within the record-home project and is the exact directory name. Use the shared [unit identity and directory rules](unit-of-work.md#identity-and-directory). The complete ID stays stable across stages, revisions, and retries.

Required Unit of Work documents live directly under the mission-owned unit root. Additional detail lives in linked files under `details/`. Stage-specific detail uses a stage subdirectory, such as `details/functional-design/`.

For Functional Design, use `unit-of-work.md` and `design.md` at the Unit of Work root. Its [accepted artifact contract](phases/construction/functional-design.md#artifacts) gives the necessary sections. Quality Requirements uses a separate required `quality.md` at the same root. Its [accepted contract](phases/construction/quality-requirements.md) gives the stage and artifact requirements.

The accepted Implementation Planning contract has `plan.md` and `tasks-dag.json` as necessary outputs at the unit root. The [accepted task graph specification](phases/construction/task-graph.md) gives task content, dependency and prerequisite rules, validation, and JSON Schema. The Planning contract gives the artifact split and its other requirements.

The accepted [Implementation contract](phases/construction/implementation.md#artifacts-and-records) gives implementation outputs and scoped CLI-owned evidence, without a required execution Markdown document. The accepted [Review contract](phases/construction/unit-of-work-review.md#artifacts-and-records) gives review records without a required review Markdown document. The accepted [Deliver contract](phases/construction/deliver.md#artifacts) includes required unit-root `delivery.md` for authored instructions. Operation results and changing execution state stay separate CLI-owned records. These specifications do not show that version 3 is implemented.

These paths do not migrate existing data. Mission creation remains open. SH59 accepts the complete unit-creation interface in [the CLI reference](cli.md#kepler-workflow-construction-unit-create).

Further decisions are necessary for the authority, internal file structure, and update rules for Project references. Keep the distinction between observed facts and proposed behavior explicit.

## Artifact metadata

The shared [Artifact metadata contract](metadata.md) lists six common frontmatter fields: `id`, `type`, `schema_version`, `unit_id`, `author`, and `labels`. `unit_id` is required for unit-owned artifacts and omitted from project-scoped artifacts. Mission identity stays in phase-owned journal payloads, not frontmatter. Author identity uses Git `user.name` and Git `user.email`.

Optional [labels](metadata.md#labels) can classify each artifact. Canonical labels do not form a closed set. The requester can add labels. Omit the field when empty. Labels must not record execution state.

The metadata contract gives field and value validation, metadata changes, and schema-version rules. Optional supporting Markdown documents use the generic [`supporting-document` type](metadata.md#accepted-type-values). Record rules for stage-specific fields in their artifact contracts.

## CLI infrastructure and persistence

[CLI infrastructure](runtime.md) separates mostly immutable artifact metadata from dynamic execution state. Markdown artifact identity belongs in frontmatter. The CLI calculates execution state from authoritative phase-owned JSON event journals under the shared [representation contract](runtime.md#execution-state-representation).

Separate authoritative state files are not necessary. Materialized views are rebuildable, not sources of workflow truth.

The accepted [record-portability policy](runtime.md#record-portability) versions authored project artifacts and authoritative journals. Derived projections and live runtime coordination data stay unversioned. Git history does not replace current coordination. A commit is not necessary for an event, dispatch, or session resume.

Agents and skills use CLI-owned operations. They do not edit journals or projections directly. This decision does not change authored artifact content or add new CLI commands.

The [evidence and checkpoint model](runtime.md#evidence-and-content-checkpoints) keeps attempt identity separate from commit identity. Each attempt has a distinct identity. Construction limits each unit/stage and fixed Activity occurrence to zero or one active attempt under the [attempt scope rules](runtime.md#attempt-identity-and-active-scope). Activity attempts link to their occurrence and enclosing stage attempt. Other phases set their own execution scopes.

Material types are open-ended. Each Git checkpoint is a commit in one repository. Multi-repository operations use repository-qualified checkpoint sets. Records bind checks and approvals to the covered material and relevant inputs. See the [Mission contract](mission.md#multi-repository-checkpoints-and-integration) for distinct checkpoint roles.

The [run floor](runtime.md#run-floor) uses the applicable attempt identity, without a separate boundary inside the attempt.

The shared runtime defines stage and Activity attempt IDs, revision IDs, and evidence identity separately from event IDs. It also sets the required evidence and approval records. Material references use opaque caller-supplied strings under SH51; they have no required grammar and are not automatically resolved. Detailed phase-owned payloads remain implementation work.

Under the [parallel execution rules](runtime.md#parallel-execution), dependency-ready tasks and independent units can progress concurrently. Task admission records the current repository-qualified unit integration set with all required predecessor outputs. The admitted task keeps that fixed baseline. A moving global coordinator `HEAD` or unrelated commit does not automatically invalidate its work.

## Effort

[Effort](effort.md) sets the shared Minimal, Standard, and Comprehensive levels. The Standard Effort level is separate from the Standard workflow name. Effort controls the detail of analysis and documentation. It does not remove required information or weaken verification.

Each Unit of Work has one default effort. Use Standard when the requester has not selected another level. Stages inherit the unit default unless an explicit stage override exists. The agent recommends adjustments. The requester selects which adjustments to accept.

Stages apply this shared definition to their work. Activities inherit their owning stage's effort and have no separate overrides. Effort does not prescribe a file count or page length. SH62 accepts phase-owned facts and queries for defaults, overrides, and effective stage levels; exact names, fields, and projections remain implementation choices. Under SH63, the owning phase derives later effort selections from structured data in existing interaction records, not prose. Do not add a separate effort event or setter command.

## Writing convention

Use ASD-STE100 Simplified Technical English for text added or changed in this reference. Keep commands, paths, schema fields, and stored values in their exact spelling.

Keep links in this specification within `v3/`. Use the local skill reference instead of links to current skill implementations.

The ASD-STE100 standard is at `https://www.asd-ste100.org/`. This reference does not claim certified language validation.
