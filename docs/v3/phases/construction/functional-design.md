# Functional Design

[Construction phase index](README.md) | [Workflow phase index](../../README.md)

**Status:** Accepted by the requester under [FD13](../../authoring_progress.md#functional-design-decisions).

## Goal

Define the purpose, scope, required functional behavior, contracts, and functional model of one Unit of Work. Record the decisions that explain the design.

The result must give later stages enough information to plan, implement, and verify the required behavior.

## Inputs

- The Unit of Work identity and intended outcome.
- Requester instructions and known constraints.
- Relevant Project references.
- Relevant source code and existing tests, when available.
- Inception outputs, when available.

Inception is not a required entry path. Its document structure is outside this stage's scope.

Project references supply shared application context. Investigate missing or outdated information. Do not invent current behavior to fill a gap.

## Entry conditions

Start Functional Design when:

- The request identifies an intended outcome that can reasonably fit within one Unit of Work.
- There is enough initial context to begin investigation and discussion.
- The requester can resolve consequential product and scope questions.

Completed documents, a complete domain model, and an Inception handoff are not required before the stage starts. Functional Design produces or refines its inputs.

## Scope

### Included

- Explain the problem, intended outcome, scope, and exclusions.
- Describe current behavior and distinguish it from required behavior.
- Define functional requirements and observable acceptance criteria.
- Cover normal behavior, failure cases, and relevant boundary conditions.
- Define domain concepts, relationships, business rules, states, and invariants.
- Assign responsibility for rules, data, and interactions.
- Define relevant contracts, including inputs, outputs, errors, and obligations.
- Identify effects on existing users, consumers, and contracts.
- Record functional design decisions, alternatives, and rationale.
- Identify questions and constraints for the next stage.

Security-related behavior, such as access denial, belongs here when it defines a functional obligation.

### Excluded

- Intent-level investigation and division into Units of Work.
- Detailed quality targets and the technical designs that satisfy them.
- Implementation tasks, scheduling, and agent assignment.
- Production implementation and test execution.
- Delivery operations.

Record discovered non-functional concerns for the next stage. Do not ignore those concerns or silently make decisions about them.

## Artifacts

### Paths and organization

All paths are relative to the project repository root. `<unit-id>` is the stable identifier of one Unit of Work.

| Artifact | Location | Responsibility |
| --- | --- | --- |
| Project references | `.kepler/reference/` | Supply shared application context. |
| Unit of Work definition | `.kepler/units-of-work/<unit-id>/unit-of-work.md` | Define the purpose, scope, and context shared by all stages. |
| Functional design | `.kepler/units-of-work/<unit-id>/design.md` | Define domain behavior, the domain model, functional contracts, and design decisions. |
| Supporting Functional Design files | `.kepler/units-of-work/<unit-id>/details/functional-design/` | Supply linked detail for this stage. |

The Unit of Work directory remains unchanged across stages, retries, and design revisions. Do not derive its identity from a branch, worktree, skill, or task number. Use the shared [unit identity and directory rules](../../unit-of-work.md#identity-and-directory): `YYYY-MM-DD-<slug>`. Use the machine-local creation date and the exact ID as the directory name.

These paths are part of the version 3 draft. They do not migrate existing files or change current CLI path rules.

### Required information and supporting detail

This stage requires `unit-of-work.md` and `design.md` directly under the Unit of Work directory. Use the shared [Artifact metadata contract](../../metadata.md) for common frontmatter fields. Shared field and value validation follows that contract. Stage-specific fields require further decisions. Dynamic execution state follows the shared [CLI infrastructure contract](../../runtime.md).

Create the Unit of Work definition when needed. Preserve and refine an existing definition when Inception or earlier work supplies it. Do not create a second definition for the same Unit of Work.

Functional Design establishes the functional behavior, models, and contracts in `design.md`. Quality Requirements records quality targets and constraints in `quality.md` at the Unit of Work root. Implementation Planning selects the technical solution against both documents.

Each required document will have a defined set of required sections. Each section must contain the essential information needed to understand and use its contract.

A required section can link to supporting files for additional detail. It must identify what each linked file explains. Use these files instead of optional inline sections.

Create supporting files only when their content is useful. Do not create empty files or links to files that do not exist. A supporting file is optional to create. An approved requirement remains binding when its detailed definition lives in `details/`.

`kepler-architect` maintains this stage's information with `kepler-design`. Later stages consume the required documents and relevant linked files.

### Unit of Work definition

`unit-of-work.md` has three required sections. Do not require additional subsections.

| Section | Required content |
| --- | --- |
| Purpose | State the problem or need and the intended outcome. Explain why this Unit of Work exists. |
| Scope | State what the work includes and excludes. Identify affected application areas or users when relevant. |
| Context | Describe relevant existing behavior, source instructions, dependencies, and binding constraints. Link to applicable Project references or Inception documents. Distinguish facts from assumptions. |

A reader must be able to understand the purpose, scope, and relevant constraints without searching the conversation. A short explanation can be sufficient.

Keep the purpose and scope explicit in this file. A reference can supply existing context, but the section must explain its relevance to this Unit of Work. If there is no relevant context or there are no exclusions, state that briefly.

Use linked supporting files when an explanation needs substantial detail. Detailed requirements, acceptance criteria, models, and design decisions belong in `design.md`.

### Functional design

Functional Design requires four sections in `design.md`.

| Section | Required content |
| --- | --- |
| Domain behavior | Define required use cases, observable outcomes, and acceptance criteria. Include relevant failures and boundary conditions. State changes to existing behavior. |
| Domain model | Define relevant domain terms, concepts, relationships, business rules, invariants, and responsibilities. Use the application's ubiquitous language. |
| Boundaries and interactions | State ownership of behavior and data. Define relevant interactions within or between bounded contexts and the contracts those interactions must follow. Include inputs, outputs, errors, and compatibility requirements where relevant. |
| Design decisions and open questions | Record significant choices and their reasons, assumptions, unresolved questions, and concerns for the next stage. Link detailed alternatives or analysis. |

Each section is required, but its content can be short. Keep acceptance criteria with their requirements. For an unchanged model or contract, a brief explanation and a precise reference can be sufficient.

Describe entities, value objects, aggregates, domain services, and domain events only when relevant. Do not invent these elements to fill a section. A Unit of Work does not automatically define a bounded context or an aggregate. An interaction boundary does not necessarily separate bounded contexts. A context map is not a required artifact for every Unit of Work.

Keep essential information in these sections. Put substantial supporting detail in linked files under `details/functional-design/`. Reference the purpose and scope in `unit-of-work.md` instead of repeating them.

These sections define the Functional Design contribution. Quality Requirements uses `quality.md`. Implementation Planning selects the technical solution before it divides the work into tasks. It records the technical solution and rationale in `plan.md`, with the task graph in `tasks-dag.json`.

### Content boundaries

Requirements define observable behavior. The model defines the concepts and rules that support that behavior. Contracts define obligations at interaction boundaries. These subjects do not each require a separate document.

Keep essential information in the required documents. Add supporting analysis when the detail would make those documents difficult to read. Refer to unchanged Project references instead of writing their content again.

Keep one authoritative location for each definition. Use summaries and references elsewhere. Keep earlier decisions visible when a later decision replaces them. Identify the replacement and its reason.

Documents must distinguish existing facts, proposed behavior, and assumptions. Record proposed corrections or additions to Project references in the Unit of Work documents. Do not present an unimplemented design as an observed application fact.

The authority, internal file structure, and update rules for Project references remain separate decisions.

## Effort

Apply the shared [Effort definition](../../effort.md). Use the Unit of Work default unless an explicit stage override applies. Effort controls the detail of analysis and documentation. It does not remove required information or weaken verification.

| Effort | Functional Design guidance |
| --- | --- |
| Minimal | State the purpose, required behavior, acceptance criteria, and relevant contracts concisely. Reference existing models. Add supporting detail where needed to resolve material ambiguity. |
| Standard | Explain significant functional decisions, interactions, and risks. Add focused supporting files when the required documents would become difficult to read. |
| Comprehensive | Analyze complex models, alternatives, failure conditions, and interactions across boundaries in detail. Link supporting files from the relevant required sections. |

Effort does not prescribe a file count or page length. Add diagrams, tables, or model descriptions only when they explain relevant information. Do not invent complexity to satisfy a effort level.

## Agent roles

| Role | Agent | Responsibility |
| --- | --- | --- |
| Functional design owner | `kepler-architect` | Investigate context, conduct the discussion, resolve functional questions with the requester, maintain a consistent design, and review its own work. |

`kepler-architect` uses `kepler-design` to perform this stage. Its profile requires domain analysis, requirements discovery, domain-driven design, source investigation, and technical writing capabilities.

The agent can inspect existing source and tests and maintain this stage's documents. It must distinguish existing facts, proposed behavior, and assumptions. It must not make consequential product choices for the requester, change production code in this stage, or select the technical solution assigned to Implementation Planning.

The requester retains authority over product behavior, scope, consequential trade-offs, and approval. No other agent roles are defined for this stage. Requester-triggered external review remains available without selecting a reviewer agent profile here.

The shared [orchestrator role](../../revision.md#authority-and-escalation) controls revision authorization outside this stage. It does not replace the Functional Design owner or requester approval.

## Supporting skills

### Entry skill

[kepler-design](../../skills.md#kepler-design) is the entry skill for Functional Design. The skill reference defines its procedure responsibilities.

Technical solution selection remains in Implementation Planning. Skill names and packaging do not define stage boundaries.

### Supporting responsibilities and inspiration

| Responsibility | Version 3 skill | Adaptation |
| --- | --- | --- |
| Structured questioning | [kepler-grilling](../../skills.md#kepler-grilling) | Keep focused requester discussion, recommendations, and caller-supplied context and exit conditions. Record confirmed answers where the calling artifact contract requires them. |
| Domain modeling | [kepler-domain-modelling](../../skills.md#kepler-domain-modelling) | Develop domain language, rules, invariants, and boundaries. Use caller-supplied paths and distinguish existing application facts from proposed changes. |
| Research | [kepler-research](../../skills.md#kepler-research) | Investigate uncertain facts through source code and primary references. Return findings with sources at the caller's supporting-file path. |

The [skill reference](../../skills.md) defines these responsibilities and records the version 3 name changes. These skills supply behavior to adapt, not old artifact contracts to preserve.

For this stage, required content belongs in the root Unit of Work documents. Supporting detail belongs under `details/functional-design/` and must be linked from the relevant required section. Use caller-supplied paths when a supporting skill serves another stage.

Apply the [common skill rules](../../skills.md#common-rules). Supporting skills do not introduce additional agent roles. This specification does not modify their current implementations.

## Review and approval

### Self-review

Self-review is part of `kepler-design`, not a separate supporting skill. `kepler-architect` must perform it before it asks for approval. The self-review checks required content, acceptance criteria, consistency, blocking questions, and concerns passed to later stages.

### External review

External review by another agent or person occurs only when the requester asks for it. Risk, complexity, and effort do not trigger external review. Self-review remains required whether or not the requester asks for external review.

### Requester approval

The requester must explicitly approve the current functional design. Approval covers:

- Purpose and scope.
- Domain behavior and acceptance criteria.
- The domain model and functional contracts.
- Material decisions, assumptions, and questions passed to later stages.

Saving a draft, committing it, or receiving a positive review does not grant requester approval. Approval permits progression to Quality Requirements. It does not authorize implementation or delivery.

Record approval through CLI-owned JSON journal events, not artifact frontmatter. Derive current approval views from those events. Do not require a separate human-authored approval document. Apply the shared [evidence and approval bindings](../../runtime.md#evidence-and-approval-bindings) to the reviewed material. Exact projection fields, event formats, and material reference formats remain undecided.

### Reopening questionnaire

Evaluate each question against the agreed functional design, including linked supporting files. Report the answers and proposed revision boundary to the orchestrator under the shared [Revision procedure](../../revision.md#revision-procedure).

1. Does the finding require a change to the intended outcome, scope, or exclusions of the Unit of Work?
2. Does it require a change to domain behavior, acceptance criteria, failure behavior, or boundary conditions?
3. Does it require a change to the meaning of domain terms, concepts, relationships, business rules, invariants, states, or responsibilities?
4. Does it require a change to ownership at an interaction boundary or a functional contract, including inputs, outputs, errors, or compatibility obligations?
5. Does it invalidate an assumption or decision that the agreed functional design depends on?
6. Does it expose a required functional decision that remains unresolved, or show that a Functional Design completion condition is no longer met?

Apply the shared [questionnaire rules](../../revision.md#stage-reopening-questionnaires) to interpret the answers. A change confined to a later stage does not reopen Functional Design while its contract and outputs remain valid.

The orchestrator authorizes reopening under the shared [Revision procedure](../../revision.md#revision-procedure). Questionnaire answers do not authorize the stage agent to reopen stages.

A reopened Functional Design stage must repeat self-review. The requester must explicitly approve the revised functional design. Record that approval through CLI-owned JSON journal events. External review remains requester-triggered only.

## Completion conditions

The stage is complete when:

- `unit-of-work.md` and `design.md` exist at the Unit of Work root and contain their required sections. Relevant supporting files are linked and exist under `details/functional-design/`.
- Required behavior has observable acceptance criteria, including relevant failures and boundary conditions.
- Domain rules, responsibilities, and functional contracts are consistent.
- No unresolved question or unsupported assumption leaves a material functional choice to the implementer.
- Known quality concerns and technical questions are explicit and passed to their responsible stages.
- The agent has completed its self-review.
- The requester has explicitly approved the functional design, and the `kepler` CLI has recorded approval in JSON event journals.

`quality.md`, implementation tasks, and a selected technical solution are not required at this point. Completion does not authorize implementation or delivery.

### Blocking rule

A question blocks completion when different answers would change scope, required functional behavior, a domain invariant, or a functional contract.

#### Examples

These examples are not mandatory questions or additional completion conditions. Apply the blocking rule to the actual situation.

| Example question | Illustrative treatment |
| --- | --- |
| Who can cancel an order? | Resolve in Functional Design. |
| What happens when cancellation is refused? | Resolve in Functional Design. |
| What response-time target applies? | Pass to Quality Requirements if functional behavior is already defined. |
| Which storage technology should we use? | Pass to Implementation Planning if the functional contract remains unchanged. |

## Handoff

**Standard workflow next stage:** [Quality Requirements](quality-requirements.md).

The handoff identifies the Unit of Work directory, `unit-of-work.md`, `design.md`, and any linked supporting files. It includes relevant Project references, their paths, known constraints, and questions for the next stage.

In Standard, Quality Requirements records quality targets and constraints in `quality.md` at the Unit of Work root. Include observability among the applicable concerns passed to that stage. Implementation Planning then selects the technical solution against the functional design and quality requirements.
