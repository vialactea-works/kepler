# Workflow version 3: skills

[Workflow phase index](README.md)

## Purpose

This document gives version 3 skill names and responsibilities. The requester accepted the Functional Design and Quality Requirements responsibilities under FD13 and NF12. The requester accepted Planning, Implementation, Review, and Deliver responsibilities under IP12, IE07, UR08, and DL09. The requester accepted Code Generation, Code Validation, and Code Integration responsibilities under IE08, IE09, and IE28. These decisions approve responsibility contracts, not agent profiles or current skill implementations.

Stage and Activity contracts set their own scopes, completion conditions, and authority. Skills give procedures under those contracts. Skill names and packaging do not set stage or Activity boundaries.

These specifications do not rename skill files or change current implementations.

## Skill names

| Skill | Responsibility |
| --- | --- |
| [kepler-design](#kepler-design) | Run Functional Design under its contract. |
| [kepler-quality](#kepler-quality) | Run Quality Requirements under its contract. |
| [kepler-plan](#kepler-plan) | Accepted entry skill for Implementation Planning. |
| [kepler-orchestrate](#kepler-orchestrate) | Accepted procedures for Implementation and the Code Integration Activity. |
| [kepler-code](#kepler-code) | Accepted entry skill for Code Generation. |
| [kepler-code-feedback](#kepler-code-feedback) | Accepted entry skill for Code Validation, including independent feedback. |
| [kepler-review](#kepler-review) | Accepted entry skill for Unit of Work Review. |
| [kepler-finish-work](#kepler-finish-work) | Accepted entry skill for Deliver. |
| [kepler-grilling](#kepler-grilling) | Help with focused requester discussion. |
| [kepler-domain-modelling](#kepler-domain-modelling) | Develop domain language, models, and rules. |
| [kepler-research](#kepler-research) | Investigate uncertain facts and record sourced findings. |

### Name changes

| Previous skill name | Version 3 name |
| --- | --- |
| `kepler-wayfinder-domain-modeling` | `kepler-domain-modelling` |
| `kepler-wayfinder-research` | `kepler-research` |

The previous names identify the source skills. They do not keep old artifact contracts or select a compatibility policy.

## Common rules

Use the calling stage's or Activity's contracts, completion conditions, and authority. Use caller-supplied document paths when a skill applies to another scope.

Distinguish existing facts, proposed behavior, and assumptions. Record the caller's answer to each question that the calling artifact contract makes necessary.

Do not use old map directories, tickets, routes, glossary paths, or their validation commands. Obey the version 3 stage and artifact contracts. Authority and update rules for Project references stay separate decisions.

Supporting skills do not introduce additional agent roles. Use CLI-owned operations for execution records. Do not edit journals or projections directly.

The accepted [resource ownership](installation.md#agent-resource-ownership) assigns skill and native agent installation to the host or skill manager. Setup owns Kepler's bundle resources and default settings. Apply the accepted [MVP test scope](installation.md#intended-mvp-targets) without changing these skill responsibilities.

## kepler-design

Entry skill for [Functional Design](phases/construction/functional-design.md). It must:

- Find relevant context and get answers to functional questions from the requester.
- Keep `unit-of-work.md`, `design.md`, and relevant linked supporting files current.
- Apply the shared [effort definition](effort.md).
- Review authored content against required content and [completion conditions](phases/construction/functional-design.md#completion-conditions).
- Get explicit approval from the requester and record it through the `kepler` CLI.
- Use the [reopening questionnaire](phases/construction/functional-design.md#reopening-questionnaire) to report findings and a proposed revision boundary to the orchestrator.
- Hand off known quality concerns and questions to Quality Requirements.

Self-review belongs in this skill, not a separate supporting skill. It examines required content, acceptance criteria, consistency, blocking questions, and concerns passed to later stages.

Technical solution selection stays in Implementation Planning. External review occurs only when the requester asks for it.

## kepler-quality

**Status:** Accepted under the [Quality Requirements contract](phases/construction/quality-requirements.md#supporting-skills).

This entry skill must:

- Find relevant context and compare the stage's quality categories with the request.
- Get requester decisions on applicable targets, conditions, constraints, and material trade-offs.
- Keep `quality.md` and relevant linked supporting files current.
- Apply the shared effort definition.
- Review authored quality requirements against required content and the stage completion conditions.
- Record the stage's necessary validation and review evidence through CLI-owned operations.
- Request explicit quality approval and record it through the `kepler` CLI.
- Report upstream findings and proposed revision boundaries to the orchestrator.
- Hand off current quality requirements and relevant questions to Implementation Planning.

Self-review belongs in this skill. It reviews applicability, scope, acceptance conditions, consistency, blocking questions, and handoff completeness.

This skill does not extend `kepler-design`, select a technical solution, or select inline or subagent execution.

## kepler-plan

**Status:** Accepted under [IP12](authoring_progress.md#implementation-planning-decisions).

This entry skill must:

- Find relevant context, patterns, constraints, and technical capabilities. Answer material questions about them.
- Select the technical solution against current functional and quality requirements.
- Set task outcomes, dependencies, prerequisite conditions, coverage, coordination constraints, and verification obligations.
- Keep `plan.md`, `tasks-dag.json`, and relevant linked supporting files current.
- Use the [accepted task graph specification](phases/construction/task-graph.md), including its task fields, dependency rules, and prerequisite rules.
- Record the technical rationale for every planning decision in `plan.md`.
- Apply the shared effort definition.
- Review the plan and task graph against applicable obligations and completion conditions. Record the stage's validation and review evidence through CLI-owned operations.
- Get requester decisions on consequential choices and record applicable approval through the CLI.
- Report upstream findings and proposed revision boundaries to the orchestrator.
- Hand off the current plan, inputs, evidence, and constraints to Implementation.

Self-review belongs in this skill. External review occurs only when the requester asks. Separate whole-plan approval applies only when required.

These responsibilities do not approve the current skill implementation or select inline versus subagent execution. Do not import legacy progress files, route bindings, admission commits, or task-state frontmatter. The skill does not dispatch workers or edit execution journals directly.

## kepler-orchestrate

**Status:** Accepted under [IE07](authoring_progress.md#completed-implementation-decisions) for Implementation and [IE28](authoring_progress.md#completed-implementation-decisions) for Code Integration.

For unit-scoped Implementation, this skill must:

- Read the current graph, upstream contracts, prerequisites, and execution records.
- Control ready-task admissions with fixed baselines and complete scoped worker handoffs.
- Send scoped subagents and control each Code Generation, Code Validation, and Code Integration handoff.
- Keep concurrent ready-task work without global Git gates or batch barriers.
- Use worker facts and apply authorized progress, revision, and acceptance decisions through CLI-owned operations.
- Correct routine issues within existing authority and request requester decisions only for [hard blockers](phases/construction/implementation.md#requester-intervention).
- Record blocker decisions and apply authorized revision boundaries.
- Compare task coverage and final integrated evidence with the unit completion conditions. Report whether they hold.
- Use the accepted post-completion return rule. Keep valid original Activity bindings and start reopened Activities under new attempts.
- Review task coverage, final integrated evidence, and handoff against the unit completion conditions. Prepare the Unit of Work Review handoff.

For the [Code Integration Activity](phases/construction/activities/code-integration.md#roles-and-skills), the skill reads the current unit checkpoint after it acquires the lock. It prepares the combined candidate and runs typechecking, the build, and the full suite under the lock. It presents only bytes that pass the checks for authorized acceptance. It records actual Integration inputs separately from admission baselines. It reviews actual inputs, check coverage, acceptance, task-completion conditions, and evidence kept for future reference, then releases the lock before a return to Code Generation.

The skill can prepare source-bound diff packages for Validation, Integration, and whole-unit inspection from their existing recorded material. It keeps original source bindings. Packages are inspection inputs. They do not show check success or lifecycle authority. See [Git diff packages](diff-package.md).

These are separate stage and Activity scopes with distinct attempts. The skill does not make a task-coding attempt, add a worker-topology selector, or grant publication authority.

## kepler-code

**Status:** Accepted under [IE08](authoring_progress.md#completed-implementation-decisions).

This entry skill must:

- Make the changes necessary for the current task, including tests, configuration, and documentation, within its contracts.
- Use the admitted baseline and keep task identity and relevant input bindings.
- Set up planned verification infrastructure and test changed behavior at the lowest suitable level.
- Run typechecking and modification-related tests against identified output material.
- Review the implementation, tests, and required documentation against the task's acceptance conditions and upstream obligations. Correct local defects and record Generation evidence through CLI-owned operations.
- Report upstream findings and hand off checked task material to Code Validation.
- Give the original Generation attempt and output bindings necessary for an optional [Code Validation package](diff-package.md#code-validation).

This procedure does not approve upstream changes, bypass Validation, or complete a task before integration. Package generation is not an additional Generation completion gate.

## kepler-code-feedback

**Status:** Accepted under [IE09](authoring_progress.md#completed-implementation-decisions).

This entry skill must:

- Compare actual task material with its baseline, task contract, functional obligations, and applicable quality requirements.
- Run typechecking, the project build, and the full application test suite.
- Give independent code feedback without authoring the reviewed implementation.
- Identify blocking findings, missing proof, uncertainty, and proposed correction boundaries.
- Review the assessment for correctness and coverage, then record validation evidence through CLI-owned operations.
- Hand off successful Validation to Code Integration without treating it as combined-result acceptance.
- When you use the optional [Code Validation package](diff-package.md#code-validation), review its source-bound task material. Bind check and feedback results to the current Validation attempt.

Independent feedback is required. This responsibility does not import legacy review artifacts or grant authority to reopen stages.

## kepler-review

**Status:** Accepted under [UR08](authoring_progress.md#unit-of-work-review-decisions).

This entry skill must:

- Compare the complete integrated outcome with current unit, functional, quality, and planning obligations.
- Review interactions, failure behavior, known delivery constraints, and evidence applicability.
- Review the complete outcome independently without editing the implementation or replacing mandatory Activity work.
- Report concrete findings and proposed revision boundaries to the orchestrator.
- Compare review coverage with unit obligations and report blocking findings to the orchestrator. Record review evidence through CLI-owned operations.
- Obtain applicable requester acceptance and hand off the reviewed result to Deliver.
- When you use the [Unit of Work Review package](diff-package.md#unit-of-work-review), review its complete integrated range, including relevant unchanged behavior. Bind the assessment to the current Review attempt.

This procedure does not automatically rerun all application checks, create external review requests, or authorize delivery operations.

## kepler-finish-work

**Status:** Accepted under [DL09](authoring_progress.md#deliver-decisions).

This entry skill must:

- Identify the requested outcome, destination, reviewed material, prerequisites, and operation authority.
- Write and update authored `delivery.md` instructions and relevant linked supporting detail.
- Complete a self-review of the delivery instructions before operations. Compare changed conditions with the instructions and prerequisites.
- Control only authorized operations and record actual results through CLI-owned operations.
- Make sure that recipient-facing results match the requested outcome. Keep provenance, partial effects, and recovery information.
- Obtain final approval only when an authority rule or requester instruction makes it necessary. Give the recipient the handoff.

Do not infer push, merge, release, deployment, rollback, or cleanup permission from stage entry or review success. This procedure does not adopt existing release gates or legacy finish artifacts.

## kepler-grilling

Help with a focused requester discussion and give recommendations. Accept the caller's context and exit conditions. Record the caller's answer to each question that the calling artifact contract makes necessary.

Adapt the structured questioning behavior to version 3. Do not import the source skill's artifact contracts.

## kepler-domain-modelling

Set the domain language, rules, invariants, and boundaries. Use the caller's document paths and distinguish existing application facts from proposed changes.

Use relevant domain concepts. Do not invent model elements to fill a section. Follow the calling stage's rules for domain models and functional contracts.

## kepler-research

Find answers to uncertain facts in source code and primary references. Return findings with sources at the caller's supporting-file path.

Use the caller's stage-specific supporting-file path. Functional Design uses `details/functional-design/`. Quality Requirements uses `details/quality-requirements/`. The accepted Implementation Planning contract uses `details/implementation-planning/`. The accepted Implementation, Unit of Work Review, and Deliver contracts use `details/implementation/`, `details/unit-of-work-review/`, and `details/deliver/`, respectively.

Link supporting detail from the relevant required section in the root Unit of Work documents.
