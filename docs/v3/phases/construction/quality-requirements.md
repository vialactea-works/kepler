# Quality Requirements

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Accepted by the requester under [NF12](../../authoring_progress.md#quality-requirements-decisions).

The requester has accepted this stage specification, including Maintainability, the evidence requirements, and the skill reference.

This acceptance does not approve a particular Unit of Work or establish completed implementation.

## Goal

Define the quality targets and constraints that apply to one Unit of Work. Give Implementation Planning enough information to select and assess a technical solution without guessing material quality decisions.

Describe required outcomes and conditions. Do not select the technical solution that must satisfy them.

## Inputs

- The Unit of Work identity and its current `unit-of-work.md`.
- The accepted functional design in `design.md` and its relevant supporting files.
- Quality concerns and questions passed from Functional Design.
- Requester instructions, known constraints, and relevant Project references.
- Existing quality requirements, source code, operational information, and tests, when available.

Distinguish existing application facts from proposed targets and assumptions. Investigate missing or conflicting context. Do not invent measurements or current guarantees.

Existing application code, production measurements, and an Inception handoff are not required. Greenfield work and walking skeletons use this stage too.

## Entry conditions

Start this stage when:

- Functional Design is complete for the current Unit of Work under its accepted contract.
- The current unit definition and functional design are available with their relevant supporting files.
- The requester can resolve consequential quality targets, constraints, and trade-offs.

A complete `quality.md`, a selected technical solution, and implementation tasks are not entry requirements. This stage produces or refines the quality requirements.

## Scope

### Included

- Assess the agreed quality categories against the unit's functional scope and relevant context.
- Define measurable or observable quality requirements and their acceptance conditions.
- State the operations, data, interactions, or environments that each requirement covers.
- Identify conditions that affect a target, such as workload, failure conditions, or supported environments.
- Record binding constraints, dependencies, assumptions, and material quality trade-offs.
- Identify gaps or conflicts that need a requester decision or an upstream revision.
- Hand off quality requirements and relevant questions to Implementation Planning.

### Excluded

- Changing approved functional behavior, domain rules, or functional contracts without authorized revision.
- Selecting the technical architecture, libraries, storage technology, deployment mechanisms, or implementation tasks.
- Writing production implementation or running application tests.
- Executing deployment or other delivery operations.
- Claiming that an unimplemented target has been achieved.

Record known constraints imposed by existing technologies or environments. Distinguish them from newly selected solutions.

Security-related functional behavior remains in Functional Design. Report a required functional change through the shared revision procedure instead of hiding it in `quality.md`.

## Artifacts

### Paths and organization

All paths are relative to the project repository root. Use the existing Unit of Work directory and shared [unit identity rules](../../unit-of-work.md#identity-and-directory).

| Artifact | Location | Responsibility |
| --- | --- | --- |
| Unit of Work definition | `.kepler/units-of-work/<unit-id>/unit-of-work.md` | Supply the shared purpose, scope, and context. |
| Functional design | `.kepler/units-of-work/<unit-id>/design.md` | Supply accepted behavior, models, and functional contracts. |
| Quality requirements | `.kepler/units-of-work/<unit-id>/quality.md` | Define quality requirements, conditions, constraints, and decisions. |
| Supporting quality files | `.kepler/units-of-work/<unit-id>/details/quality-requirements/` | Supply linked detail for this stage. |

This stage owns `quality.md` and consumes `design.md` without taking ownership of the functional design.

Use the shared [metadata contract](../../metadata.md). The required document keeps `type: non-functional-requirements`. The stage rename does not change this accepted metadata value. Optional supporting Markdown documents use `type: supporting-document`.

Create supporting files only when useful, and explain their purpose in links from the relevant required sections. Keep essential information in the root document. Do not create empty files or unexplained links.

### Required sections

This stage requires three sections in `quality.md`.

| Section | Required content |
| --- | --- |
| Quality requirements | State applicable quality requirements, their scope, relevant conditions, and measurable or observable acceptance conditions. Group by category where useful. |
| Constraints and dependencies | Record binding constraints, external dependencies, existing guarantees, and relevant assumptions. Identify their sources and scope. |
| Decisions and open questions | Record material quality decisions, trade-offs, unresolved questions, and matters passed to Implementation Planning. Explain significant choices. |

Keep acceptance conditions with the requirement they define. Link supporting analysis when its detail would obscure the essential requirement.

Each section can be short. State when no relevant constraint or open question exists. Do not require separate documents, artificial quotas, or empty category headings.

### Quality categories

The original seven categories are agreed under [CN02](README.md#agreed-boundaries). Maintainability is accepted under [NF13](../../authoring_progress.md#quality-requirements-decisions). The examples explain possible concerns; they do not prescribe targets or tools.

| Category | Concerns to assess where applicable |
| --- | --- |
| Performance | Response time, throughput, capacity, and resource use under stated conditions. |
| Availability | Continuity, acceptable interruption, and recovery expectations under relevant failures. |
| Security | Protection of data and systems, including constraints on exposure, storage, and processing. |
| Accessibility | Quality requirements for users with different abilities and relevant assistive technologies. |
| Compatibility | Supported environments and compatibility obligations for existing users, consumers, and dependencies. |
| Operability | Conditions for operation, configuration, maintenance, and support. |
| Observability | Information needed to detect, understand, and diagnose relevant behavior and failures. |
| Maintainability | Modularity, extensibility, decoupling, and the ability to change or replace parts without unrelated changes. |

Assess all eight categories. Add requirements only where they apply to the unit. Briefly explain when a category has no relevant requirement; one concise note can cover several categories.

Reference unchanged requirements precisely instead of copying them. Explain their relevance to the unit. Do not silently reduce existing obligations or turn unknown applicability into an exemption.

### Maintainability

Maintainability covers software design and system architecture qualities that support safe change, extension, and replacement.

**Example:** Message-publishing use cases must remain independent of queue-specific or stream-specific client interfaces. Replacing the messaging technology must not change domain rules or use-case logic.

Implementation Planning chooses the architecture and mechanisms that satisfy these change constraints. The category alone does not require a particular pattern, framework, or queue.

### Requirement content

For each applicable requirement:

- Identify the operation, data, interaction, or environment covered.
- State the target or constraint and the conditions under which it applies.
- State an objective acceptance condition that later work can evaluate.
- Identify relevant assumptions and dependencies when they affect interpretation.

A requirement does not need a numeric target when an observable condition is sufficient. Terms such as fast, secure, or scalable are insufficient without a stated meaning.

Do not invent a target because a category exists. Resolve material target choices with the requester. Technical verification procedures belong to Implementation Planning and later stage contracts.

Record proposed changes to Project references as proposals. Their authority and update rules remain separate decisions.

## Effort

Apply the shared [effort definition](../../effort.md). Use the unit default unless an explicit stage override applies.

| Effort | Quality Requirements guidance |
| --- | --- |
| Minimal | State applicable requirements, acceptance conditions, constraints, and essential rationale concisely. Reference unchanged requirements. |
| Standard | Explain significant quality trade-offs, conditions, dependencies, and risks. Link focused supporting analysis where needed. |
| Comprehensive | Analyze complex operating conditions, interacting requirements, alternatives, and consequences across boundaries. Keep detailed analysis linked to the requirements. |

Effort changes detail, not required information or authority. It does not remove applicable quality obligations, require invented targets, or trigger automatic external review.

## Agent roles

The stage owner is:

| Role | Agent | Responsibility |
| --- | --- | --- |
| Quality requirements owner | `kepler-architect` | Investigate context, resolve quality questions with the requester, maintain `quality.md`, and review its consistency. |

The stage owner needs quality-attribute analysis, requirements discovery, source investigation, and technical writing capabilities. It must distinguish targets from measurements and existing constraints from proposed technical choices.

The requester retains authority over consequential targets, quality trade-offs, and approval. The [orchestrator](../../revision.md#authority-and-escalation) controls reopening and revision boundaries.

The role assignment does not select a worker model for Quality Requirements. [CN22](../../authoring_progress.md#completed-construction-decisions) selects the orchestrator-controlled subagent model only for Implementation. It does not select role profiles or skill implementations for Quality Requirements or other phases.

## Supporting skills

### Entry skill

[kepler-quality](../../skills.md#kepler-quality) is the entry skill. It investigates applicable quality requirements, maintains the stage artifacts, performs self-review, and hands off to Implementation Planning.

These responsibilities do not implement the skill or extend the `kepler-design` contract.

### Supporting responsibilities

| Responsibility | Skill | Use in this stage |
| --- | --- | --- |
| Structured questioning | [kepler-grilling](../../skills.md#kepler-grilling) | Resolve applicability, targets, conditions, and material trade-offs with the requester. |
| Research | [kepler-research](../../skills.md#kepler-research) | Investigate uncertain constraints and existing guarantees through source code and primary references. |

Apply the [common skill rules](../../skills.md#common-rules). Supporting skills neither add agent roles nor authorize upstream revisions.

## Review and approval

These review rules apply to Quality Requirements. They do not add approval gates to other stages.

### Self-review

Self-review belongs in `kepler-quality`, not a separate supporting skill. Check category applicability, requirement scope, acceptance conditions, consistency, unresolved material questions, and handoff completeness.

### External review

External review occurs only when the requester asks for it. Effort, risk, and complexity do not automatically create an external review gate. Self-review remains required.

### Requester approval

The requester must explicitly approve the current quality requirements. Approval covers applicable targets, constraints, material assumptions, and quality trade-offs.

Saving or committing a draft, or receiving a positive review, does not grant requester approval. Stage approval permits progression to Implementation Planning. It does not select a technical solution or authorize implementation or delivery.

Record approval through CLI-owned JSON journal events, not frontmatter. Apply the shared [approval bindings](../../runtime.md#evidence-and-approval-bindings) to the current attempt and reviewed material.

### Reopening questionnaire

Evaluate these questions against the current quality requirements and relevant linked files. Report findings and the proposed boundary under the shared [revision procedure](../../revision.md#revision-procedure).

1. Does the finding change which quality requirements apply to the unit?
2. Does it change a target, constraint, acceptance condition, or the material covered?
3. Does it change relevant operating conditions, supported environments, dependencies, or an existing guarantee?
4. Does it invalidate an assumption or quality trade-off on which the requirements depend?
5. Does it expose a material quality question that remains unresolved or invalidate a completion condition?

Apply the shared [questionnaire rules](../../revision.md#stage-reopening-questionnaires). Answers support the orchestrator's decision; they do not authorize reopening or exempt downstream stages from a cascade.

A required change to functional behavior can move the boundary to Functional Design. Report it to the orchestrator. Do not revise the functional design through this stage's quality document.

After reopening, satisfy the stage's applicable completion conditions again, including self-review and the required requester approval. Preserve unaffected upstream work and historical records under the shared rules.

## Completion conditions

The stage is complete when:

- `quality.md` exists at the unit root and satisfies its required content and the shared metadata contract.
- Applicable quality requirements have explicit scope, relevant conditions, and objective acceptance conditions.
- Category applicability is assessed without inventing requirements or ignoring relevant obligations.
- Requirements and constraints are consistent with the accepted functional design and relevant context.
- No unresolved question leaves a material quality target or trade-off to the implementer.
- Relevant supporting files exist and are linked from their required sections.
- Document validation and self-review succeed against the current material under the evidence requirements below.
- Any requested external review is complete and its blocking findings are resolved.
- Requester approval is recorded through the CLI and binds the reviewed material.
- The handoff identifies requirements, constraints, and questions for Implementation Planning.

A selected technical solution, completed implementation, or runtime proof of compliance is not required at this stage.

A question blocks completion when its answer changes an applicable quality obligation, target, acceptance condition, or binding constraint. A technical choice can pass to Planning while the quality requirement remains clear.

### Evidence coverage

This contract defines required check and review evidence and a separate requester approval record. It does not delegate that definition to another stage or a shared evidence checklist.

| Evidence or approval | Material covered | Required result |
| --- | --- | --- |
| Artifact validation result | Current `quality.md` and relevant linked supporting Markdown documents. | Required sections and shared metadata are valid. Relevant local file links resolve. |
| Quality self-review result | Current quality requirements and supporting detail against the unit definition, accepted functional design, and relevant context. | Applicability, scope, conditions, and acceptance criteria are reviewed. Requirements are consistent and no blocking quality choices remain unresolved. |
| Requested external review result | The material and scope identified in the request, when external review is requested. | The requested review is complete and its blocking findings are resolved. |
| Requester approval record | The reviewed quality requirements and supporting detail, including targets, constraints, and material assumptions. | The requester explicitly approves the identified material for the applicable attempt. |

Keep these results bound to their original scope, attempt, covered material, and relevant inputs under the shared [evidence rules](../../runtime.md#evidence-and-approval-bindings).

Record results through CLI-owned operations and retain necessary supporting output. For repository material, identify the checkpoint and relevant files. Create the output checkpoint before recording approval. Apply the shared rules for evidence applicability and retention.

A separate evidence document is not required. Exact event types, record formats, and command syntax remain implementation work.

These records establish the quality specification's validity and requester approval. They do not prove that an implementation meets the quality targets. No application test run is required by this stage.

[SH52](../../authoring_progress.md#shared-decisions-still-pending) tracks evidence decisions for the remaining stage contracts. This section defines Quality Requirements evidence coverage; other stage contracts define their own obligations.

## Handoff

**Standard workflow next stage:** [Implementation Planning](implementation-planning.md).

Identify the Unit of Work directory, `unit-of-work.md`, accepted `design.md`, current `quality.md`, and relevant linked supporting files.

Include quality targets, their scope and conditions, binding constraints, relevant assumptions, and questions for Planning. Preserve references to existing functional requirements without duplicating their definitions.

Implementation Planning selects the technical solution against both functional and quality requirements before it divides work into tasks.
