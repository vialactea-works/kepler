---
id: "{{artifact-uuid-v4}}"
type: implementation-plan
schema_version: 3
unit_id: "{{unit-id}}"
author: "{{original Name <email>}}"
---
# Implementation plan: {{unit-title}}

## Technical solution

Describe the selected approach, affected components, interfaces, data, and integration mechanisms. Explain each decision against the functional design and quality requirements. Record the rationale for every planning decision.

## Task graph context

The task graph is [`tasks-dag.json`](tasks-dag.json). Explain the decomposition, dependency decisions, and how planned work covers the unit's obligations without duplicating task definitions or edges.

## Verification strategy

State task and unit checks, repository-qualified commands, required environments, expected results, and missing verification infrastructure. Keep typechecking, the project build, and the full application test suite as separate duties where required.

## Decisions and open questions

Record rationale, material assumptions, risks, resolved trade-offs, and nonblocking matters passed to execution or later stages. Identify requester decisions that remain necessary. Link useful detail under `details/implementation-planning/` and explain each link.
