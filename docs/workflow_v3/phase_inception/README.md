# Inception phase: Wayfinder

[Workflow phase index](../README.md) | [Construction phase](../phase_construction/README.md)

## Purpose

This folder defines the Wayfinder workflow. It gives the inception phase the same state, transition, gate, and artifact contracts as construction.

Wayfinder resolves decisions before delivery work starts. It charts a map, works explicitly authorized tickets, and compiles one route when the decisions agree.

This phase does not add to the seven SDD steps. It can supply several separate construction changes through its route units.

## Reading order

| Order | Document | Question |
| --- | --- | --- |
| 1 | [Concepts](concepts.md) | What do the terms and stored values mean? |
| 2 | [Workflow map](lifecycle.md) | How do charting, ticket work, route closure, and delivery connect? |
| 3 | [Charting](charting.md) | How does a goal become a map and ticket frontier? |
| 4 | [Ticket cycle](ticket-cycle.md) | Which tickets can start, and how do answers become durable decisions? |
| 5 | [Investigations](investigations.md) | How do research, prototype, grilling, and task tickets produce evidence? |
| 6 | [Domain modeling](domain-modeling.md) | How do working terms become confirmed project language? |
| 7 | [Route compilation](route.md) | How does the map close with a self-contained route? |
| 8 | [Construction handoff](handoff.md) | How do units enter construction and receive shipment evidence? |
| 9 | [Gates](gates.md) | Which conditions permit each operation to complete? |
| 10 | [Artifacts](artifacts.md) | Which actor writes each record and field? |
| 11 | [Reference maintenance](maintenance.md) | Which sources support this contract, and which gaps remain? |

For a first reading, read Concepts and Workflow map. Then read the operation that you need.

Diagrams contain states and operation names. Transition tables identify actors, inputs, outputs, and gate references. Gate tables contain conditions and failure actions.

## Scope and authority

The requester owns decisions. The Wayfinder owner coordinates the map, ticket work, consistency checks, and closure.

Specialists supply bounded findings or disposable artifacts. They do not acquire authority to select more tickets or approve construction intent.

Loading a map is orientation. An explicit request must authorize ticket work before a ticket starts.

Route closure is the final act of authorized decision work. It does not authorize a route unit, production implementation, push, merge, or destructive cleanup.

This reference defines workflow meaning. The [source map](maintenance.md#source-map) locates skills, templates, CLI contracts, and tests.

## Writing and state conventions

This reference uses ASD-STE100 Simplified Technical English writing rules. [Concepts](concepts.md) defines technical terms.

State IDs and transition IDs are document labels. They do not create new artifact fields or CLI states.

Exact identifiers retain their spelling. This reference does not claim certified ASD-STE100 dictionary validation or graphical diagram validation.
