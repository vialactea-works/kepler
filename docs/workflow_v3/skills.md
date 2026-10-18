# Workflow version 3: skills

[Workflow phase index](README.md)

## Purpose

Define version 3 skill names and responsibilities. Functional Design and Quality Requirements responsibilities are accepted. Implementation Planning responsibilities remain proposed under its stage draft. Other stages define their skills with their stage contracts.

Stage contracts define required artifacts, completion conditions, and authority. Skills supply procedures under those contracts. Skill names and packaging do not define stage boundaries.

These specifications do not rename skill files or change current implementations.

## Skill names

| Skill | Responsibility |
| --- | --- |
| [kepler-design](#kepler-design) | Perform Functional Design. |
| [kepler-quality](#kepler-quality) | Perform Quality Requirements. |
| [kepler-plan](#kepler-plan) | Proposed entry skill for Implementation Planning; not yet approved. |
| [kepler-grilling](#kepler-grilling) | Support focused requester discussion. |
| [kepler-domain-modelling](#kepler-domain-modelling) | Develop domain language, models, and rules. |
| [kepler-research](#kepler-research) | Investigate uncertain facts and record sourced findings. |

### Name changes

| Previous skill name | Version 3 name |
| --- | --- |
| `kepler-wayfinder-domain-modeling` | `kepler-domain-modelling` |
| `kepler-wayfinder-research` | `kepler-research` |

The previous names identify the source skills. They do not preserve old artifact contracts or select a compatibility policy.

## Common rules

Follow the calling stage's artifact contracts, completion conditions, and authority. Use caller-supplied document paths when a skill supports another stage.

Distinguish existing facts, proposed behavior, and assumptions. Record confirmed answers where the calling artifact contract requires them.

Do not require old map directories, tickets, routes, glossary paths, or their validation commands. Follow the version 3 stage and artifact contracts. Authority and update rules for Project references remain separate decisions.

Supporting skills do not introduce additional agent roles. Use CLI-owned operations for execution records; do not edit journals or projections directly.

## kepler-design

Entry skill for [Functional Design](phase_construction/functional-design.md). It must:

- Investigate relevant context and resolve functional questions with the requester.
- Maintain `unit-of-work.md`, `design.md`, and relevant linked supporting files.
- Apply the shared [depth definition](depth.md).
- Perform self-review against required content and [completion conditions](phase_construction/functional-design.md#completion-conditions).
- Request explicit approval and record it through the `kepler` CLI.
- Use the [reopening questionnaire](phase_construction/functional-design.md#reopening-questionnaire) to report findings and a proposed revision boundary to the orchestrator.
- Hand off known quality concerns and questions to Quality Requirements.

Self-review belongs in this skill, not a separate supporting skill. It checks required content, acceptance criteria, consistency, blocking questions, and concerns passed to later stages.

Technical solution selection remains in Implementation Planning. External review occurs only when the requester asks for it.

## kepler-quality

**Status:** Accepted under the [Quality Requirements contract](phase_construction/quality-requirements.md#supporting-skills).

This entry skill must:

- Investigate relevant context and assess the stage's quality categories.
- Resolve applicable targets, conditions, constraints, and material trade-offs with the requester.
- Maintain `quality.md` and relevant linked supporting files.
- Apply the shared depth definition.
- Perform self-review against required content and the stage completion conditions.
- Record the stage's required validation and review evidence through CLI-owned operations.
- Request explicit quality approval and record it through the `kepler` CLI.
- Report upstream findings and proposed revision boundaries to the orchestrator.
- Hand off current quality requirements and relevant questions to Implementation Planning.

Self-review belongs in this skill. It checks applicability, scope, acceptance conditions, consistency, blocking questions, and handoff completeness.

This skill does not extend `kepler-design`, select a technical solution, or decide inline versus subagent execution.

## kepler-plan

**Status:** Proposed under the [Implementation Planning draft](phase_construction/implementation-planning.md#supporting-skills).

The draft proposes this entry skill to:

- Investigate relevant context, existing patterns, constraints, and uncertain technical capabilities.
- Select the technical solution against current functional and quality requirements.
- Define task outcomes, dependencies, prerequisite conditions, coverage, coordination constraints, and verification obligations.
- Maintain `plan.md`, `tasks-dag.json`, and relevant linked supporting files.
- Use the [Kepler task graph format](phase_construction/task-graph.md), including the agreed UUIDv4 task identifiers.
- Record the technical rationale for every planning decision in `plan.md`.
- Apply the shared depth definition.
- Perform self-review and record the proposed stage's validation and review evidence through CLI-owned operations.
- Resolve consequential choices with the requester and record applicable approval through the CLI.
- Report upstream findings and proposed revision boundaries to the orchestrator.
- Hand off the current plan, inputs, evidence, and constraints to Implementation Execution.

Self-review belongs in this skill. External review remains requester-triggered under the proposal; separate whole-plan approval applies only when required.

These responsibilities do not approve the current skill implementation or decide inline versus subagent execution. Do not import legacy progress files, route bindings, admission commits, or task-state frontmatter. The skill does not dispatch workers or edit execution journals directly.

## kepler-grilling

Support a focused requester discussion with recommendations. Accept the caller's context and exit conditions. Record confirmed answers where the calling artifact contract requires them.

Adapt the structured questioning behavior to version 3. Do not import the source skill's artifact contracts.

## kepler-domain-modelling

Develop domain language, rules, invariants, and boundaries. Use the caller's document paths and distinguish existing application facts from proposed changes.

Use relevant domain concepts. Do not invent model elements to fill a section. Follow the calling stage's rules for domain models and functional contracts.

## kepler-research

Investigate uncertain facts through source code and primary references. Return findings with sources at the caller's supporting-file path.

Use the caller's stage-specific supporting-file path. Functional Design uses `details/functional-design/`. Quality Requirements uses `details/quality-requirements/`. The Implementation Planning draft proposes `details/implementation-planning/`.

Link supporting detail from the relevant required section in the root Unit of Work documents.
