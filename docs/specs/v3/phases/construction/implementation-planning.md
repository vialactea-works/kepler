# Implementation Planning

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Accepted by the requester under [IP19](../../authoring_progress.md#implementation-planning-decisions).

The requester accepted this complete Implementation Planning contract. It states artifacts, task identity rules, procedures, roles, review rules, evidence, and completion conditions. The requester separately accepted the [task graph specification](task-graph.md) under IP26. These approvals concern specifications. They do not approve an executing Unit of Work or authorize implementation.

## Goal

Select a technical solution that satisfies the unit's functional design and quality requirements. Divide the work into tasks with explicit outcomes, dependencies, and verification obligations.

Give Implementation sufficient information to do the work for the unit and make sure that its result meets the requirements. State material requirements and technical decisions so workers do not have to guess.

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

Start when:

- Functional Design and Quality Requirements are complete under their applicable contracts for the current unit.
- Their current outputs and relevant supporting files are available.
- Consequential choices outside the stage owner's authority have an identified requester decision path.

Apply each upstream stage's own approval rules. This condition does not approve a Unit of Work.

A complete plan, existing test infrastructure, and a selected technical solution are not entry requirements.

## Scope

### Included

- Select the implementation approach against the functional design, quality requirements, and binding constraints.
- State relevant components, technical interfaces, data representations, and integration mechanisms.
- Record technical rationale for every planning decision. Explain viable alternatives, assumptions, and risks where relevant.
- Divide the work into cohesive, verifiable tasks.
- Identify required task inputs, outputs, acceptance conditions, dependencies, and coordination constraints.
- Account for applicable functional requirements, quality requirements, and known deployment constraints.
- State how later stages can make sure that the tasks and complete integrated outcome meet their requirements.
- Report upstream conflicts and unresolved consequential choices to their decision owners.
- Hand off the plan and its evidence to Implementation.

### Excluded

- Changing functional behavior, quality targets, or binding constraints without authorized upstream revision.
- Writing production implementation or executing the planned application checks.
- Dispatching task workers, selecting admission baselines, or accepting integration candidates.
- Recording task progress through Markdown checkboxes or frontmatter.
- Executing deployment or other delivery operations.

Plan necessary implementation and verification work without claiming that it has already succeeded.

## Artifacts

### Paths and organization

Use the mission-owned `.kepler/missions/<mission-id>/construction/units-of-work/<unit-id>/` directory and shared [unit identity rules](../../unit-of-work.md#identity-and-directory). Paths are relative to the selected record-home working-tree root.

| Artifact | Location | Responsibility |
| --- | --- | --- |
| Unit definition | Unit root: `unit-of-work.md`. | Supply purpose, scope, context, and known deployment constraints. |
| Functional design | Unit root: `design.md`. | Supply domain behavior, models, and functional contracts. |
| Quality requirements | Unit root: `quality.md`. | Supply applicable targets, conditions, constraints, and acceptance conditions. |
| Implementation plan | Unit root: `plan.md`. | Record the technical solution, verification strategy, and technical rationale for every planning decision. |
| Task graph | Unit root: `tasks-dag.json`. | Represent the planned tasks and their dependencies as a graph. |
| Supporting planning files | `details/implementation-planning/` under the unit root. | Supply linked analysis and task detail when useful. |

Both planning outputs are required. This stage owns them and consumes upstream artifacts without taking ownership of those inputs.

The accepted task graph specification assigns task definitions, identities, and dependency edges to `tasks-dag.json`. `plan.md` records the technical solution, rationale, and verification strategy. Reference tasks by identity without keeping a second graph in Markdown.

Use the [accepted task graph specification](task-graph.md) under [IP26](../../authoring_progress.md#implementation-planning-decisions). Do not adopt JGF. Task IDs use the agreed UUIDv4 format.

Resolve actual Markdown links and explicit file or path operands against the selected workspace. Check that each resolved path stays within its repository root. Under SH51, task-graph input references are opaque free-form strings. Do not parse or resolve them automatically. Planning assesses their meaning, coverage, and available material.

IP19 accepts this complete stage contract. IP26 separately accepts the graph format.

Keep one authoritative definition for each task and dependency. A diagram or generated view must not become a second authority. Keep references and explanations consistent across both artifacts. Link `tasks-dag.json` from `plan.md`.

Keep essential information in the required sections. Link useful supporting files from those sections and explain their purpose. Do not create empty files or unexplained links.

The requester selected these filenames under [DF04](../../authoring_progress.md#implementation-planning-decisions) and the planning artifact contract. The [Mission contract](../../mission.md#durable-layout) sets their mission-owned path. This specification does not migrate artifacts.

### Artifact metadata

Apply the shared [metadata contract](../../metadata.md) to `plan.md` and supporting Markdown documents. Keep stable artifact identity, unit ownership, original author, and schema version.

Use `type: implementation-plan` for `plan.md`. Optional supporting Markdown documents keep `type: supporting-document`.

Identify `tasks-dag.json` in evidence by its unit-relative path and checkpoint. The [root object](task-graph.md#root-object) states its artifact identity, unit ownership, and JSON format version. That version is independent of the Markdown schema version. Task IDs follow the separate [UUIDv4 rules](task-graph.md#task-identity).

No additional Markdown frontmatter fields are proposed. `tasks-dag.json` is authored planning content, not an event journal or execution-state projection. Do not store progress, attempts, approval flags, or changing execution state in either planning output.

### Required sections

Use these four required sections in `plan.md`. A section can be short when a precise reference supplies unchanged information.

| Section | Required content |
| --- | --- |
| Technical solution | Describe the selected approach, affected components, interfaces, and relevant data or integration mechanisms. Explain each technical decision against functional and quality obligations. |
| Task graph context | Reference `tasks-dag.json` and explain decomposition and dependency decisions. Describe how the planned work covers the unit's obligations without duplicating task definitions or edges. |
| Verification strategy | State checks for tasks and the complete unit, required environments, expected results, and missing verification infrastructure. Keep the agreed later-stage check duties. |
| Decisions and open questions | Record rationale, material assumptions, risks, resolved trade-offs, and nonblocking matters passed to execution or later stages. Identify required requester decisions. |

Use domain terms and boundaries from the functional design. Reference upstream requirements instead of redefining them.

### Technical solution

Explain how the selected mechanisms satisfy the relevant functional contracts and quality conditions. Distinguish domain rules and application responsibilities from infrastructure and external interfaces.

Record the technical rationale for every planning decision in `plan.md`. A short explanation or precise reference to an existing rationale can be sufficient.

Reuse suitable existing project patterns. Introduce abstractions only for concrete needs. This stage alone does not make a new service, framework, or architecture diagram necessary.

Compare materially viable alternatives when the choice affects constraints, risk, compatibility, or cost. Use common criteria tied to the unit's obligations. Record why the selected approach is suitable.

Identify relevant effects on existing data, consumers, configuration, operation, and deployment. Plan compatibility or migration work where required. Do not assume permission for destructive changes.

Known deployment constraints are binding. [SH77 through SH79](../../authoring_progress.md#completed-shared-decisions) state accepted deployment information, its location, and its timing.

### Task identities and definitions

Use unique task identities within the unit. Keep surviving identities when reordering tasks or revising their descriptions. Do not reuse a retired identity for unrelated work.

Keep historical definitions and their execution bindings when tasks are replaced, split, or removed. Do not rewrite earlier evidence or present historical completion as current completion.

Task identities are separate from artifact UUIDs and stage-attempt identities. Use UUIDv4 task IDs under the [format contract](task-graph.md#task-identity). Task identity continuity does not carry completion forward after an authorized revision cascade.

Task definitions belong in `tasks-dag.json`. The accepted [task object](task-graph.md#task-object) states their fields and meanings. Apply the accepted identity-lifecycle rules above. For each task, state:

- Its identity, goal, and bounded implementation outcome.
- Applicable requirements, quality constraints, and relevant technical decisions, using precise references where useful.
- Required inputs, predecessor outputs, and relevant external prerequisites.
- Expected outputs and observable acceptance conditions, including relevant failure and boundary cases.
- Necessary implementation guidance and affected areas, without prescribing irrelevant edits.
- Verification scope, expected results, and required environments or resources.
- Task-wide shared-file or resource access instructions in `guidance` to prevent interference.

Place check-specific setup and isolation in verification `method`. Record blocking external availability in `prerequisites`, with its affected work and timing.

Keep each task cohesive and verifiable. A separate deployable feature or the complete unit outcome is not necessary for every task.

Identify the relevant context in each task handoff. Workers must not reconstruct requirements from sibling tasks or conversation history.

### Dependencies and coverage

A dependency exists when a task cannot complete its work or meet requirements without another task's integrated work. Describe the required predecessor work and why it is necessary in the dependency's `reason`. A separate per-dependency output list is not necessary.

Do not derive dependencies from task numbering, document order, worker availability, or convenience. Shared-file overlap alone does not show an output dependency. Record [shared-file and resource instructions](task-graph.md#shared-file-and-resource-instructions) in their owning task fields, not as dependency edges.

The graph must have unique task identities and resolve every dependency reference. Reject self-dependencies, cycles, missing predecessor references, and edges without a justified required-work relationship.

Resolve a cycle by correcting task boundaries or identifying a real shared prerequisite. Do not hide it behind an arbitrary execution order.

Account for every applicable functional requirement and quality obligation through planned work or a justified reference to unchanged behavior. Identify how task results show the complete unit outcome.

Coverage includes necessary verification, integration, compatibility, and deployment preparation where applicable. A list of task titles does not show coverage.

Graph structure does not show runtime readiness. Implementation applies the agreed [admission rules](../../runtime.md#task-admission-and-baselines) to actual integrated outputs and valid inputs.

Keep the agreed parallel execution for independent ready tasks. The plan must not introduce global Git gates, shared admission commits, or batch-completion barriers.

### External prerequisites

These prerequisite rules are accepted under the [task graph specification](task-graph.md#prerequisite-object).

For each material external prerequisite, state whether its absence blocks task work or required verification. For blocking prerequisites, state when they are necessary and how to make sure they are available. When a task makes a required condition true, represent its output through a dependency instead of duplicating an external prerequisite.

Explain why each nonblocking prerequisite does not prevent the task's required work or verification. Implementation checks each blocking condition before the affected work starts. Independent ready work can continue.

Future prerequisite availability is not necessary before Planning completes the plan. External prerequisites do not automatically become graph edges. Task-output dependencies follow the graph contract.

### Verification strategy

Plan the lowest test level that proves each behavior. Use unit tests for isolated contracts, integration tests for real collaborations, and end-to-end tests for critical complete workflows.

Include relevant failures and boundary conditions. State expected results and required fixtures, environments, and resource isolation. Each graph verification object's `method` records its procedure and required setup, including applicable versions, resources, and isolation conditions. Identify any execution permissions required for planned checks. Planning does not grant those permissions.

Identify available project commands and their scope. For missing infrastructure, plan work that makes it available before dependent verification uses it. Do not invent successful results or waive required checks because infrastructure is absent.

Keep the agreed [Activity check duties](README.md#agreed-boundaries):

- Code Generation runs typechecking, tests related to its modifications, and author self-review.
- Code Validation runs typechecking, the project build, and the full application test suite. A non-author reviewer gives independent feedback without editing the candidate.
- Code Integration runs typechecking, the project build, and the full application test suite against the combined candidate before acceptance.

Integration holds the unit lock through preparation, checks, and acceptance. These checks do not replace Code Validation. Other permitted work continues under the [integration rules](README.md#integration-order-and-locking).

Identify which commands do each required check. A build that omits typechecking does not satisfy that separate duty.

Project check configuration is still implementation work under [DF14](../../authoring_progress.md#mvp-implementation-choices). Keep additional applicable project obligations without selecting the deferred general extra-check policy.

This stage states the verification work. Later stages execute it. Planning completion does not show that implementation checks have passed.

## Effort

Apply the shared [effort definition](../../effort.md). Use the unit default unless an explicit stage override applies.

| Effort | Implementation Planning guidance |
| --- | --- |
| Minimal | State the solution, rationale for every planning decision, tasks, dependencies, coverage, and verification obligations concisely. Reference suitable existing patterns. |
| Standard | Explain important alternatives, boundary interactions, compatibility concerns, task coordination, and verification setup. Link focused supporting analysis. |
| Comprehensive | Analyze complex alternatives, failure conditions, integration risks, migrations, and cross-boundary consequences. Keep detailed analysis linked to the plan. |

Effort does not remove required information, task coverage, verification duties, or requester authority. It does not impose task counts, document length, or automatic external review.

## Agent roles

The accepted stage owner is:

| Role | Agent | Responsibility |
| --- | --- | --- |
| Implementation planning owner | `kepler-architect` | Investigate implementation context, select the technical solution, write the task graph, and review the plan against upstream contracts. |

The owner must be able to analyze architecture, investigate sources, decompose tasks, design tests, and write technical text.

The requester keeps authority over scope, product obligations, consequential trade-offs, and required approvals. The [orchestrator](../../revision.md#authority-and-escalation) controls revision authorization.

This role assignment does not select a worker model for Planning. [CN22](../../authoring_progress.md#completed-construction-decisions) selects the orchestrator-controlled subagent model only for Implementation. It does not select role profiles or skill implementations for Planning or other phases. The orchestrator schedules execution under the Implementation contract.

## Supporting skills

### Entry skill

[kepler-plan](../../skills.md#kepler-plan) is the accepted entry skill. It investigates context, develops the technical solution and task graph, does self-review, and prepares the handoff.

This contract states version 3 responsibilities. It does not use the current skill implementation or adopt its legacy artifact contracts.

### Supporting responsibilities

| Responsibility | Skill | Use in this stage |
| --- | --- | --- |
| Structured questioning | [kepler-grilling](../../skills.md#kepler-grilling) | Resolve consequential trade-offs, assumptions, and planning ambiguity with the requester. |
| Research | [kepler-research](../../skills.md#kepler-research) | Make sure that uncertain technical capabilities and integration assumptions match source code and primary references. |

Apply the [common skill rules](../../skills.md#common-rules). Supporting skills do not introduce agent roles, authorize revisions, or dispatch implementation workers.

## Review and approval

These stage-specific rules are accepted. They do not add approval gates to other stages.

### Self-review

Self-review belongs in `kepler-plan`, not a separate skill. Do a check of technical consistency, requirement coverage, task definitions, dependencies, prerequisite conditions, verification feasibility, and unresolved consequential decisions.

### External review

External review occurs only when the requester asks for it. Effort, risk, and complexity do not create that gate. Self-review remains required.

### Requester decisions and approval

Resolve consequential trade-offs with the requester before completing the plan. The stage owner can select technical details within its authority that satisfy the agreed requirements and constraints.

Separate whole-plan approval is necessary only when an applicable authority rule or requester instruction makes it necessary. Obtain any required approval before handoff.

When approval is required, identify the selected solution, task plan, assumptions, or decisions that it covers. Record explicit approval through CLI-owned operations under the shared [approval bindings](../../runtime.md#evidence-and-approval-bindings).

Saving or committing a plan, receiving positive review, or completing self-review does not grant requester approval. Completion makes the unit ready for Implementation under that stage's contract. It does not dispatch workers or authorize delivery.

### Reopening questionnaire

Evaluate these questions against the current plan and its relevant inputs. Report findings and the proposed boundary under the shared [revision procedure](../../revision.md#revision-procedure).

1. Is a change to the selected technical solution, a technical contract, or a material implementation assumption necessary?
2. Does it change task outcomes, required outputs, acceptance conditions, or coverage of an upstream obligation?
3. Does it change a dependency, external prerequisite, or coordination constraint on which the plan relies?
4. Does it invalidate the planned verification approach, environment, or ability to run required checks?
5. Does it expose an unresolved consequential decision or invalidate a stage completion condition?

Apply the shared [questionnaire rules](../../revision.md#stage-reopening-questionnaires). Answers give the orchestrator information for its decision. They do not authorize reopening or exempt downstream stages from a cascade.

A planning-only change does not reopen valid upstream stages. Report invalid functional or quality inputs so the orchestrator can identify an earlier boundary.

An authorized unit-wide revision from Planning follows Construction's [shutdown and restart rules](README.md#unit-wide-upstream-revision). End affected execution attempts and keep work and evidence as history. Do not pause them for later continuation.

Satisfy Planning's applicable completion conditions again after reopening. Repeat required reviews and obtain any applicable requester approval for the revised material.

## Completion conditions

Complete the stage when:

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
- Supporting files exist, resolve from their owning sections, and are consistent with the plan.
- Required validation and self-review succeed against the current material under the evidence requirements below.
- Any requested external review is complete and its blocking findings are resolved.
- Required requester decisions and any applicable approval are recorded against the reviewed material through CLI-owned operations.
- The handoff identifies the current plan, inputs, verification obligations, and coordination constraints.

Implementation, passing application checks, task admissions, and integrated task outputs are not completion requirements for Planning.

A question blocks completion when its answer changes the selected solution, task contract, dependency, verification obligation, or consequential trade-off. Local implementation detail can stay with the worker when its choices stay within explicit contracts and authority.

### Evidence coverage

This stage states its required evidence coverage. Requester approval is a separate record and applies only when an authority rule or requester instruction makes it necessary.

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Artifact validation result | Current `plan.md`, `tasks-dag.json`, and relevant linked supporting Markdown documents. | Required Markdown sections and metadata are valid. The graph conforms to the [JSON format](task-graph.md). Actual Markdown links and cross-artifact links resolve within known repository roots. Explicit path operands pass real-path containment checks. Under SH51, task-graph input references remain opaque and unparsed. |
| Task graph validation result | The complete planned task set and dependency structure in `tasks-dag.json`, including task identities and dependency reasons. | Task UUIDs are valid and unique. Predecessor references resolve, and reasons describe required work. No self-dependencies, duplicate edges, or cycles exist. Task outputs and resource-use instructions are explicit in their owning fields. |
| Planning self-review result | Both planning outputs and supporting detail against upstream artifacts, project constraints, and relevant context. | Every planning decision has rationale. Obligations are covered, choices are consistent, and verification is feasible. Assess input meaning, relevance, coverage, and availability against actual material. Prerequisite conditions are explicit. No blocking planning decisions or unsupported material assumptions remain. |
| Requested external review result | Material and scope identified in the request, when external review is requested. | The requested review is complete and its blocking findings are resolved. |
| Applicable requester approval record | The material and consequential decisions covered by a required approval or explicit plan-approval request. | The requester explicitly approves the identified material for the applicable attempt. No approval is inferred from artifact presence or review success. |

Keep results bound to their original scope, unit-scoped attempt, covered material, and relevant inputs under the shared [evidence rules](../../runtime.md#evidence-and-approval-bindings).

Record results through CLI-owned operations and keep supporting output. Identify the checkpoint and reviewed versions of both planning artifacts, together with relevant inputs. Make sure that evidence still applies when either artifact changes. Create the output checkpoint before recording any required approval. Apply the shared applicability and [retention rules](../../runtime.md#checkpoint-retention).

Graph validation does not replace semantic review of dependencies, coverage, or the selected solution. The self-review result must cover those judgments.

No separate evidence document or application test run is required by this stage. Apply the shared [evidence and approval record requirements](../../runtime.md#evidence-and-approval-bindings). Detailed phase-owned payload types, validation commands, and event types remain implementation work.

[SH52](../../authoring_progress.md#completed-shared-decisions) records that each stage and Activity states its own named evidence, covered material, and required results. This section states Planning's coverage. Each later contract states its own obligations.

## Handoff

**Standard workflow next stage:** [Implementation](implementation.md).

Identify the unit directory, `plan.md`, `tasks-dag.json`, current upstream artifacts, supporting files, and the material covered by completion evidence.

Supply the selected solution, task identities, dependencies, required outputs, task acceptance conditions, verification strategy, and coordination constraints. Include external prerequisites and their readiness conditions, nonblocking implementation questions, and any applicable requester approval.

Implementation determines readiness from actual integrated outputs and records task baselines at admission. Planning does not preassign those future checkpoints or create execution attempts for each task.

Keep agreed concurrent ready-task execution and per-unit integration locking. A completed plan does not mean that tasks are complete, the integrated unit is approved, or delivery is authorized.
