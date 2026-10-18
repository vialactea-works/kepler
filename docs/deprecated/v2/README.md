# Kepler workflow reference: version 2

## Purpose

This folder defines two workflow phases. Inception resolves the destination and its decisions. Construction delivers changes through the SDD framework.

Change the relevant phase reference before you change workflow behavior. Then align skills, CLI operations, templates, tests, and explanatory documents.

The phase names organize the reference. They do not add persisted fields, a workflow engine, or numbered SDD steps.

## Phase index

| Order | Reference | Responsibility | Main output |
| --- | --- | --- | --- |
| 1 | [Inception: Wayfinder](phase_inception/README.md) | Chart uncertainty, resolve authorized decision tickets, and compile a route. | Current answers, confirmed language, and coarse delivery units. |
| 2 | [Construction: SDD framework](phase_construction/README.md) | Define, plan, implement, review, and finish each authorized change. | Verified change results and delivery evidence. |

Start with each phase's Concepts and Workflow map. Then read the operation that you need.

Each reference provides state tables, transition diagrams, operation contracts, separate gate tables, artifact ownership, and recovery rules.

## Phase boundary

A ready project can enter construction directly. An effort needs Wayfinder only when unresolved decisions require work across sessions.

A cleared map supplies a route. Each route unit defines a delivery outcome, not an implementation task or an approved formal change.

The [handoff contract](phase_inception/handoff.md) defines unit selection, ownership, dependencies, source and target branches, and shipment feedback.

The seven construction steps remain `init`, `propose`, `plan`, `code`, `code-feedback`, `review`, and `finish-work`. Wayfinder does not increase that count.

Project initialization can establish standards and language before inception. Its definition remains in [construction preparation](phase_construction/preparation.md#step-0-init).

## Authority and generation

This folder defines the version 2 workflow. [The version 3 reference](../workflow_v3/README.md) is a separate document set.

This reorganization does not migrate active work, change artifact schemas, or authorize execution under another generation.

[Skills](../skills.md) describe execution procedures. [The SDD framework](../sdd-framework.md) explains construction rationale.

Lint proves supported artifact format. It does not prove a decision, authorize a ticket, grant formal approval, or verify shipment.

## Reference maintenance

Use the [inception maintenance procedure](phase_inception/maintenance.md) for Wayfinder contracts. Use the [construction maintenance procedure](phase_construction/maintenance.md) for SDD contracts.

For a phase-boundary change, update both references and their shared handoff. Keep conditions in gate tables, outside diagrams.

Both phases use ASD-STE100 Simplified Technical English writing rules. Commands, paths, schema fields, and stored values retain their exact spelling.

The reference does not claim certified dictionary validation. See the [ASD-STE100 site](https://www.asd-ste100.org/) for the standard.
