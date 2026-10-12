---
artifact: route
effort: <effort-name>
status: open | shipping | shipped
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
decision: accepted | rejected | skipped
units:
  - id: 1
    name: <unit-name>
    status: pending | in-progress | shipped
    depends_on: []
    backed_by:
      - tickets/NN-slug.md
---

<!--
  Route — the compiled outcome of a cleared Wayfinder map.
  Produced by: kepler-wayfinder
  Lives at: .kepler/maps/<effort>/route.md

  The body explains the destination and the causal path chosen. Tickets hold
  detailed evidence, rejected alternatives, and decision history.

  Unit identity, lifecycle, dependencies, and backing tickets live only in
  frontmatter. Downstream processes update lifecycle metadata without rewriting
  the synthesized body.

  Keep unit IDs unique and in body order. Each frontmatter ID/name must match
  exactly one numbered Units heading at the same position. Dependencies must be
  unique, refer to other existing units, and form an acyclic graph. This
  structural check does not replace the semantic causal-order and destination-
  coverage review. A downstream `in-progress` unit status is visible ownership
  evidence, not a lock; the owner commits its claim with the change scaffolding
  on a named source branch distinct from the delivery target.

  Delete this comment block and every inline hint before finalizing.
-->

# Route — <Effort Name>

## Point of departure

<!--
  Describe in one short paragraph, or a few bullets, what was materially unclear
  when wayfinding began. Include only ambiguity that shaped the destination.
  This is orientation, not a chronological history.
-->

## Destination

### Outcome

<!--
  State what will be true when this destination is eventually built. Describe
  the intended result, not the implementation work or the Wayfinder process.
-->

### Concrete shape

<!--
  Make the destination imaginable to an agent that did not participate in
  wayfinding. Use only the representations that remove meaningful ambiguity:
  a walkthrough, examples, process flow, state model, component view, decision
  table, or another domain-appropriate model.
-->

### Guardrails and boundaries

<!--
  State the invariants, constraints, and explicit exclusions that future
  proposals and implementations must preserve.
-->

-

### Builder latitude

<!--
  Record choices deliberately left to propose, design, or implementation because
  they cannot change the destination. Do not place unresolved product or
  architectural decisions here; those are remaining fog and require tickets.
-->

-

## Path chosen

<!--
  Synthesize the decisions that define the destination. This is a causal path,
  not meeting minutes or ticket chronology.

  Each entry states:
  1. what was chosen or ruled out;
  2. why;
  3. what consequence binds the destination;
  4. where to inspect the full evidence.

  Include rejected branches only when their rejection establishes an important
  boundary. Current truth belongs here; superseded answers remain in tickets.
-->

- **<Decision name>.** Chose <choice> because <reason>. Therefore <binding consequence>. ([<ticket title>](tickets/NN-slug.md))
- **<Boundary name>.** Ruled out <option> because <reason>. Therefore <excluded behavior or scope>. ([<ticket title>](tickets/NN-slug.md))

## Shipping rules

<!--
  Describe how downstream processes execute the units: the actual merge-back
  branch and repository, commit and merge/PR conventions, and shipping-relevant
  operation rules carried from the map. Wayfinder defines these rules but does
  not perform the work. Consumers must compare a named source branch with this
  delivery target by branch identity, not tip SHA.
-->

- Merge-back branch: `<branch from map>`
- <standing shipping rule>

## Units

<!--
  Units are coarse delivery boundaries. Each unit enters the downstream process
  once. They are not implementation tasks and do not prescribe design that
  belongs in propose, design, or plan artifacts.

  The matching frontmatter entry owns the unit's id, stable name, lifecycle
  status, dependencies, and backing ticket paths.
-->

### 1. <Unit name>

**Destination contribution:** <Name the part of the destination this unit makes real.>

<!--
  In one paragraph, explain what this unit delivers, why it forms one coherent
  change, and how it advances the destination. Describe outcome and intent, not
  implementation steps.
-->

**Done when**

- <Observable outcome proving this destination facet exists>
- <Relevant boundary or failure condition that must hold>

**Binding constraints**

<!--
  Restate only the decision consequences that directly constrain this unit.
  Link to tickets for detailed reasoning and alternatives.
-->

- <Constraint and its practical consequence> ([<ticket title>](tickets/NN-slug.md))
