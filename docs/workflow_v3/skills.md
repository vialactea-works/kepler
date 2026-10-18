# Workflow version 3: skills

[Workflow phase index](README.md)

## Purpose

Define version 3 skill names and responsibilities. This reference contains the responsibilities currently specified for Functional Design. Other stages define their skills with their stage contracts.

Stage contracts define required artifacts, completion conditions, and authority. Skills supply procedures under those contracts. Skill names and packaging do not define stage boundaries.

These specifications do not rename skill files or change current implementations.

## Skill names

| Skill | Responsibility |
| --- | --- |
| [kepler-design](#kepler-design) | Perform Functional Design. |
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
- Hand off known quality concerns and questions to Non-functional Requirements.

Self-review belongs in this skill, not a separate supporting skill. It checks required content, acceptance criteria, consistency, blocking questions, and concerns passed to later stages.

Technical solution selection remains in Implementation Planning. External review occurs only when the requester asks for it.

## kepler-grilling

Support a focused requester discussion with recommendations. Accept the caller's context and exit conditions. Record confirmed answers where the calling artifact contract requires them.

Adapt the structured questioning behavior to version 3. Do not import the source skill's artifact contracts.

## kepler-domain-modelling

Develop domain language, rules, invariants, and boundaries. Use the caller's document paths and distinguish existing application facts from proposed changes.

Use relevant domain concepts. Do not invent model elements to fill a section. Follow the calling stage's rules for domain models and functional contracts.

## kepler-research

Investigate uncertain facts through source code and primary references. Return findings with sources at the caller's supporting-file path.

For Functional Design, supporting detail belongs under `details/functional-design/`. Link it from the relevant required section in the root Unit of Work documents.
