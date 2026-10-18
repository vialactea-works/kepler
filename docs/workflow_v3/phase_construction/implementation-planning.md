# Stage 3: Implementation Planning

[Construction phase index](README.md) | [Workflow phase index](../README.md)

**Status:** Draft for discussion.

Technical solution selection, task decomposition, and the dependency graph are agreed responsibilities. The requester has specified `plan.md`, `tasks-dag.json`, rationale for every planning decision, and the verification duties below. A Kepler-specific JSON format and UUIDv4 task IDs are also agreed. Remaining artifact details, procedure, roles, review rules, evidence, and completion conditions are proposals.

Saving this draft does not approve its proposals or an executing Unit of Work. It does not authorize implementation.

## Goal

Select a technical solution that satisfies the unit's functional design and quality requirements. Divide the work into tasks with explicit outcomes, dependencies, and verification obligations.

Give Implementation Execution enough information to implement and verify the unit without guessing material requirements or technical decisions.

## Inputs

- The current Unit of Work definition in `unit-of-work.md`.
- Current `design.md` and `quality.md`, their relevant supporting files, and applicable stage completion records.
- Technical questions and constraints passed from the preceding stages.
- Requester instructions, relevant Project references, and project standards.
- Source code, tests, build configuration, and operational information, when available.
- Existing implementation plans and retained work when revising an earlier plan.

Distinguish observed implementation facts from proposed mechanisms and assumptions. Investigate uncertain library capabilities, integration contracts, and existing guarantees before relying on them.

Existing application code, tests, and completed Initialization or Inception contracts are not required. Plan the necessary foundation for greenfield work and walking skeletons.

## Entry conditions

The draft proposes starting when:

- Functional Design and Quality Requirements are complete under their applicable contracts for the current unit.
- Their current outputs and relevant supporting files are available.
- Consequential choices outside the stage owner's authority have an identified requester decision path.

Apply each upstream stage's own approval rules. This entry condition does not accept an unapproved stage specification.

A complete implementation plan, existing test infrastructure, and a selected technical solution are not entry requirements.

## Scope

### Included

- Select the implementation approach against the functional design, quality requirements, and binding constraints.
- Define relevant components, technical interfaces, data representations, and integration mechanisms.
- Record technical rationale for every planning decision. Explain viable alternatives, assumptions, and risks where relevant.
- Divide the work into cohesive, verifiable tasks.
- Identify required task inputs, outputs, acceptance conditions, dependencies, and coordination constraints.
- Account for applicable functional requirements, quality requirements, and known deployment constraints.
- Define how later stages will verify the tasks and complete integrated outcome.
- Report upstream conflicts and unresolved consequential choices to their decision owners.
- Hand off the plan and its evidence to Implementation Execution.

### Excluded

- Changing functional behavior, quality targets, or binding constraints without authorized upstream revision.
- Writing production implementation or executing the planned application checks.
- Dispatching task workers, selecting admission baselines, or accepting integration candidates.
- Recording task progress through Markdown checkboxes or frontmatter.
- Executing deployment or other delivery operations.

Plan necessary implementation and verification work without claiming that it has already succeeded.

## Artifacts

### Paths and organization

Use the existing `.kepler/units-of-work/<unit-id>/` directory and shared [unit identity rules](../unit-of-work.md#identity-and-directory).

| Artifact | Location | Responsibility |
| --- | --- | --- |
| Unit definition | Unit root: `unit-of-work.md`. | Supply purpose, scope, context, and known deployment constraints. |
| Functional design | Unit root: `design.md`. | Supply domain behavior, models, and functional contracts. |
| Quality requirements | Unit root: `quality.md`. | Supply applicable targets, conditions, constraints, and acceptance conditions. |
| Implementation plan | Unit root: `plan.md`. | Record the technical solution, verification strategy, and technical rationale for every planning decision. |
| Task graph | Unit root: `tasks-dag.json`. | Represent the planned tasks and their dependencies as a graph. |
| Supporting planning files | `details/implementation-planning/` under the unit root. | Supply linked analysis and task detail when useful. |

Both planning outputs are required. This stage owns them and consumes upstream artifacts without taking ownership of those inputs.

The draft proposes that `tasks-dag.json` own task definitions, identities, and dependency edges. `plan.md` records the technical solution, rationale, and verification strategy. Reference tasks by identity without maintaining a second graph in Markdown.

Use the [Kepler task graph format](task-graph.md) under [DF12](../authoring_progress.md#implementation-planning-decisions). Do not adopt JGF. Task IDs use the agreed UUIDv4 format. The format reference defines the task-oriented JSON representation; it does not accept the remaining stage policies.

Keep one authoritative definition for each task and dependency. A diagram or generated view must not become a second authority. Keep references and explanations consistent across both artifacts. Link `tasks-dag.json` from `plan.md`.

Keep essential information in the required sections. Link useful supporting files from those sections and explain their purpose. Do not create empty files or unexplained links.

The requester selected these filenames under [DF04](../authoring_progress.md#implementation-planning-decisions) and the planning artifact contract. This specification does not change current CLI paths or migrate artifacts.

### Artifact metadata

Apply the shared [metadata contract](../metadata.md) to `plan.md` and supporting Markdown documents. Preserve stable artifact identity, unit ownership, original author, and schema version.

The draft proposes `type: implementation-plan` for `plan.md`. This value is not yet an accepted metadata type. Optional supporting Markdown documents keep `type: supporting-document`.

Identify `tasks-dag.json` in evidence by its unit-relative path and checkpoint. The [root object](task-graph.md#root-object) defines its artifact identity, unit ownership, and JSON format version. That version is independent of the Markdown schema version. Task IDs follow the separate [UUIDv4 rules](task-graph.md#task-identity).

No additional Markdown frontmatter fields are proposed. `tasks-dag.json` is authored planning content, not an event journal or execution-state projection. Do not store progress, attempts, approval flags, or changing execution state in either planning output.

### Required sections

The draft proposes four required sections in `plan.md`. A section can be short when a precise reference supplies unchanged information.

| Section | Required content |
| --- | --- |
| Technical solution | Describe the selected approach, affected components, interfaces, and relevant data or integration mechanisms. Explain each technical decision against functional and quality obligations. |
| Task graph context | Reference `tasks-dag.json` and explain decomposition and dependency decisions. Describe how the planned work covers the unit's obligations without duplicating task definitions or edges. |
| Verification strategy | Define checks for tasks and the complete unit, required environments, expected results, and missing verification infrastructure. Preserve the agreed later-stage check duties. |
| Decisions and open questions | Record rationale, material assumptions, risks, resolved trade-offs, and nonblocking matters passed to execution or later stages. Identify required requester decisions. |

Use domain terms and boundaries from the functional design. Reference upstream requirements instead of redefining them.

### Technical solution

Explain how the selected mechanisms satisfy the relevant functional contracts and quality conditions. Distinguish domain rules and application responsibilities from infrastructure and external interfaces.

Record the technical rationale for every planning decision in `plan.md`. A short explanation or precise reference to an existing rationale can be sufficient.

Reuse suitable existing project patterns. Introduce abstractions only for concrete needs. Do not require a new service, framework, or architecture diagram merely because this stage exists.

Compare materially viable alternatives when the choice affects constraints, risk, compatibility, or cost. Use common criteria tied to the unit's obligations. Record why the selected approach is suitable.

Identify relevant effects on existing data, consumers, configuration, operation, and deployment. Plan compatibility or migration work where required; do not assume permission for destructive changes.

Known deployment constraints remain binding. Deployment record content, location, and timing remain open under [SH77 through SH79](../authoring_progress.md#shared-decisions-still-pending).

### Task identities and definitions

The draft proposes unique task identities within the unit. Keep surviving identities when reordering tasks or revising their descriptions. Do not reuse a retired identity for unrelated work.

Preserve historical definitions and their execution bindings when tasks are replaced, split, or removed. Do not rewrite earlier evidence or present historical completion as current completion.

Task identities are separate from artifact UUIDs and stage-attempt identities. Use UUIDv4 task IDs under the [format contract](task-graph.md#task-identity). Task identity continuity does not preserve completion after an authorized revision cascade.

The draft places task definitions in `tasks-dag.json`. The [task object](task-graph.md#task-object) defines their JSON representation. The task-content and identity-lifecycle policies remain proposals. For each task, define:

- Its identity, goal, and bounded implementation outcome.
- Applicable requirements, quality constraints, and relevant technical decisions, using precise references where useful.
- Required inputs, predecessor outputs, and relevant external prerequisites.
- Expected outputs and observable acceptance conditions, including relevant failure and boundary cases.
- Necessary implementation guidance and affected areas, without prescribing irrelevant edits.
- Verification scope, expected results, and required environments or resources.
- Shared-file or resource conflicts and the coordination needed to prevent interference.

Keep each task cohesive and verifiable. Do not require every task to create a separate deployable feature or repeat the complete unit outcome.

Identify the relevant context in each task handoff. Workers must not reconstruct requirements from sibling tasks or conversation history.

### Dependencies and coverage

A dependency means that one task needs another task's integrated output to perform or verify its work. Identify that output and the reason it is required.

Do not derive dependencies from task numbering, document order, worker availability, or convenience. Shared-file overlap alone does not establish an output dependency. Record genuine coordination constraints separately.

The proposed graph must have unique task identities and resolve every dependency reference. Reject self-dependencies, cycles, missing predecessor references, and edges with no required output.

Resolve a cycle by correcting task boundaries or identifying a real shared prerequisite. Do not hide it behind an arbitrary execution order.

Account for every applicable functional requirement and quality obligation through planned work or a justified reference to unchanged behavior. Identify how task results establish the complete unit outcome.

Coverage includes necessary verification, integration, compatibility, and deployment preparation where applicable. A list of task titles does not establish coverage.

Graph structure does not establish runtime readiness. Implementation Execution applies the agreed [admission rules](../runtime.md#task-admission-and-baselines) to actual integrated outputs and valid inputs.

Independent ready tasks retain their agreed parallelism. The plan must not introduce global Git gates, shared admission commits, or batch-completion barriers.

### External prerequisites

For each material external prerequisite, state whether its absence blocks task work or required verification. For blocking prerequisites, state when they are needed and how availability will be established. When a task establishes a required condition, represent its output through a dependency instead of duplicating an external prerequisite.

Explain why each nonblocking prerequisite does not prevent the task's required work or verification. Execution checks each blocking condition before the affected work starts. Independent ready work can continue.

Planning need not establish future prerequisite availability before completing the plan. External prerequisites do not automatically become graph edges; task-output dependencies follow the graph contract.

### Verification strategy

Plan the lowest test level that proves each behavior. Use unit tests for isolated contracts, integration tests for real collaborations, and end-to-end tests for critical complete workflows.

Include relevant failures and boundary conditions. Define expected results and required fixtures, environments, and resource isolation. Identify any execution permissions required for planned checks. Planning does not grant those permissions.

Identify available project commands and their scope. For missing infrastructure, plan the work that establishes usable checks before dependent verification needs them. Do not invent successful results or waive required checks because infrastructure is absent.

Preserve the agreed [test and integration duties](README.md#agreed-boundaries):

- Code Generation runs typechecking and tests related to its modifications.
- Code Validation runs typechecking, the project build, and the full application test suite. It also owns independent code feedback.
- Task Integration runs typechecking, the project build, and the full application test suite against the combined candidate before acceptance.

Integration holds the unit lock through preparation, checks, and acceptance. These checks do not replace Code Validation. Other permitted work continues under the [integration rules](README.md#integration-order-and-locking).

Identify which commands perform each required check. A build that omits typechecking does not satisfy that separate duty.

Project check configuration remains implementation work under [DF14](../authoring_progress.md#mvp-implementation-choices). Preserve additional applicable project obligations without selecting the deferred general extra-check policy.

This stage defines verification work; later stages execute it. Planning completion does not establish that implementation checks have passed.

## Depth

Apply the shared [depth definition](../depth.md). Use the unit default unless an explicit stage override applies.

| Depth | Implementation Planning guidance |
| --- | --- |
| Minimal | State the solution, rationale for every planning decision, tasks, dependencies, coverage, and verification obligations concisely. Reference suitable existing patterns. |
| Standard | Explain significant alternatives, boundary interactions, compatibility concerns, task coordination, and verification setup. Link focused supporting analysis. |
| Comprehensive | Analyze complex alternatives, failure conditions, integration risks, migrations, and cross-boundary consequences. Keep detailed analysis linked to the plan. |

Depth does not remove required information, task coverage, verification duties, or requester authority. It does not impose task counts, document length, or automatic external review.

## Agent roles

The draft proposes this stage owner:

| Role | Agent | Responsibility |
| --- | --- | --- |
| Implementation planning owner | `kepler-architect` | Investigate implementation context, select the technical solution, define the task graph, and review the plan against upstream contracts. |

The owner needs architecture analysis, source investigation, task decomposition, test design, and technical writing capabilities.

The requester retains authority over scope, product obligations, consequential trade-offs, and required approvals. The [orchestrator](../revision.md#authority-and-escalation) controls revision authorization.

The role assignment does not select inline work, subagents, or swarms. [CN20](../authoring_progress.md#construction-decisions-still-pending) remains open. Execution scheduling belongs to the orchestrator under the Implementation Execution contract.

## Supporting skills

### Entry skill

The draft proposes [kepler-plan](../skills.md#kepler-plan) as the entry skill. It investigates context, develops the technical solution and task graph, performs self-review, and prepares the handoff.

This proposes version 3 responsibilities, not approval of the current skill implementation or its legacy artifact contracts.

### Supporting responsibilities

| Responsibility | Skill | Use in this stage |
| --- | --- | --- |
| Structured questioning | [kepler-grilling](../skills.md#kepler-grilling) | Resolve consequential trade-offs, assumptions, and planning ambiguity with the requester. |
| Research | [kepler-research](../skills.md#kepler-research) | Verify uncertain technical capabilities and integration assumptions through source code and primary references. |

Apply the [common skill rules](../skills.md#common-rules). Supporting skills do not introduce agent roles, authorize revisions, or dispatch implementation workers.

## Review and approval

These stage-specific rules are proposals. They do not add approval gates to other stages.

### Self-review

Self-review belongs in `kepler-plan`, not a separate skill. Check technical consistency, requirement coverage, task definitions, dependencies, prerequisite conditions, verification feasibility, and unresolved consequential decisions.

### External review

The draft proposes external review only when the requester asks for it. Depth, risk, and complexity do not automatically create that gate. Self-review remains required.

### Requester decisions and approval

Resolve consequential trade-offs with the requester before completing the plan. The stage owner can select technical details within its authority that satisfy the agreed requirements and constraints.

Require separate whole-plan approval only when an applicable authority rule or requester instruction requires it. Obtain any required approval before handoff.

When approval is required, identify the selected solution, task plan, assumptions, or decisions that it covers. Record explicit approval through CLI-owned operations under the shared [approval bindings](../runtime.md#evidence-and-approval-bindings).

Saving or committing a plan, receiving positive review, or completing self-review does not grant requester approval. Completion makes the unit ready for Implementation Execution under that stage's contract. It does not dispatch workers or authorize delivery.

### Reopening questionnaire

Evaluate these questions against the current plan and its relevant inputs. Report findings and the proposed boundary under the shared [revision procedure](../revision.md#revision-procedure).

1. Does the finding require changing the selected technical solution, a technical contract, or a material implementation assumption?
2. Does it change task outcomes, required outputs, acceptance conditions, or coverage of an upstream obligation?
3. Does it change a dependency, external prerequisite, or coordination constraint on which the plan relies?
4. Does it invalidate the planned verification approach, environment, or ability to run required checks?
5. Does it expose an unresolved consequential decision or invalidate a stage completion condition?

Apply the shared [questionnaire rules](../revision.md#stage-reopening-questionnaires). Answers support the orchestrator's decision; they do not authorize reopening or exempt downstream stages from a cascade.

A planning-only change does not reopen valid upstream stages. Report invalid functional or quality inputs so the orchestrator can assess an earlier boundary.

An authorized unit-wide revision from Planning follows Construction's [shutdown and restart rules](README.md#unit-wide-upstream-revision). End affected execution attempts and preserve work and evidence as history; do not pause them for later continuation.

Satisfy Planning's applicable completion conditions again after reopening. Repeat required reviews and obtain any applicable requester approval for the revised material.

## Completion conditions

The draft proposes completion when:

- `plan.md` and `tasks-dag.json` exist at the unit root and satisfy their applicable content and metadata contracts.
- `plan.md` records the technical rationale for every planning decision.
- The artifacts are consistent, with valid task references and no conflicting task or dependency definitions.
- The technical solution is explicit and consistent with current functional and quality requirements and binding constraints.
- Each task has defined inputs, outputs, acceptance conditions, and verification obligations.
- Material external prerequisites have blocking scope, availability conditions, and timing, or an explicit nonblocking rationale.
- The graph has valid references, no cycles, and justified output dependencies.
- Applicable obligations have planned coverage or justified references to unchanged behavior.
- Verification is feasible, with missing infrastructure covered by planned work and necessary dependencies.
- No unresolved question leaves a consequential requirement, trade-off, or technical decision to an unauthorized worker.
- Supporting files exist, resolve from their owning sections, and remain consistent with the plan.
- Required validation and self-review succeed against the current material under the evidence requirements below.
- Any requested external review is complete and its blocking findings are resolved.
- Required requester decisions and any applicable approval are recorded against the reviewed material through CLI-owned operations.
- The handoff identifies the current plan, inputs, verification obligations, and coordination constraints.

Implementation, passing application checks, task admissions, and integrated task outputs are not completion requirements for Planning.

A question blocks completion when its answer changes the selected solution, task contract, dependency, verification obligation, or consequential trade-off. Local implementation detail can remain with the worker when its choices stay within explicit contracts and authority.

### Evidence coverage

This stage defines its proposed evidence coverage. Requester approval is a separate record and applies only when required under the proposed approval rule.

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Artifact validation result | Current `plan.md`, `tasks-dag.json`, and relevant linked supporting Markdown documents. | Required Markdown sections and metadata are valid. The graph conforms to the [JSON format](task-graph.md). Relevant local links and cross-artifact references resolve. |
| Task graph validation result | The complete planned task set and dependency structure in `tasks-dag.json`, including identities and required predecessor outputs. | Task UUIDs are valid and unique. Predecessors and required output names resolve. No self-dependencies, duplicate edges, or cycles exist. Required outputs and coordination constraints are explicit. |
| Planning self-review result | Both planning outputs and supporting detail against upstream artifacts, project constraints, and relevant context. | Every planning decision has rationale. Obligations are covered, choices are consistent, and verification is feasible. Prerequisite conditions are explicit. No blocking planning decisions or unsupported material assumptions remain. |
| Requested external review result | Material and scope identified in the request, when external review is requested. | The requested review is complete and its blocking findings are resolved. |
| Applicable requester approval record | The material and consequential decisions covered by a required approval or explicit plan-approval request. | The requester explicitly approves the identified material for the applicable attempt. No approval is inferred from artifact presence or review success. |

Keep results bound to their original scope, unit-scoped attempt, covered material, and relevant inputs under the shared [evidence rules](../runtime.md#evidence-and-approval-bindings).

Record results through CLI-owned operations and retain supporting output. Identify the checkpoint and reviewed versions of both planning artifacts, together with relevant inputs. Reassess evidence applicability when either artifact changes. Create the output checkpoint before recording any required approval. Apply the shared applicability and [retention rules](../runtime.md#checkpoint-retention).

Graph validation does not replace semantic review of dependencies, coverage, or the selected solution. The self-review result must cover those judgments.

No separate evidence document or application test run is required by this stage. Exact record formats, validation commands, and event types remain implementation work.

[SH52](../authoring_progress.md#shared-decisions-still-pending) tracks evidence decisions for the remaining stage contracts. This section defines Planning's coverage without settling later stages' obligations.

## Handoff

**Next stage:** [Implementation Execution](implementation-execution.md).

Identify the unit directory, `plan.md`, `tasks-dag.json`, current upstream artifacts, supporting files, and the material covered by completion evidence.

Supply the selected solution, task identities, dependencies, required outputs, task acceptance conditions, verification strategy, and coordination constraints. Include external prerequisites and their readiness conditions, nonblocking implementation questions, and any applicable requester approval.

Implementation Execution determines readiness from actual integrated outputs and records task baselines at admission. Planning does not preassign those future checkpoints or create execution attempts for each task.

Preserve agreed concurrent ready-task execution and per-unit integration locking. A completed plan does not establish completed tasks, approval of the integrated unit, or permission to deliver.
