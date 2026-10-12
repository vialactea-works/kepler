---
artifact: proposal
change: <YYYY-MM-DD-change-title>
status: draft
decision: skipped
author: <Name <email>>
created: <YYYY-MM-DD>
route_unit: <.kepler/maps/<effort>/route.md — unit N, or null>
---

<!--
  PRD — Proposal / "Why"
  Produced by: kepler-propose (step 1)
  Owns the WHY and the product-level WHAT, grounded in project language and domain boundaries.
  Target length: 1–2 pages; concise rows are enough for a small change.
  New full-path proposals include Domain Context and Affected Boundaries. Existing lint-valid
  historical proposals remain valid without these sections; do not rewrite approved history.
  OPTIONAL artifact — skip for small changes and start at plan.md.
  A draft or a template default is never requester approval. Show the requester the exact final candidate bytes, including status: approved and decision: accepted, and wait for explicit approval of that revision before writing it. Commit exactly those approved bytes; any later intent edit needs new approval.
  Delete this comment block and every inline <!-- ... --> hint before finalizing.
  Before creating this artifact, read the configured Git identity with `git config user.name` and
  `git config user.email`, then write `author: Name <email>` using both configured values. If either
  configured value is missing, ask the user or stop with a blocker rather than inventing an identity.
  When revising an existing artifact, preserve its recorded author unless the user explicitly directs
  an attribution change.
-->

# Proposal: <Change Title>

## Why

<!-- The problem or opportunity in 1–3 sentences. What hurts today? Why now?
     Focus on the motivation, not the solution. -->

## Goals & Success Criteria

<!-- Express outcomes in the canonical glossary's context-scoped language. Supplement missing
     definitions from established project docs and cite them in Domain Context. Surface conflicts
     and proposed meanings for requester resolution; do not silently redefine canonical terms.
     Make outcomes observable or measurable so finish-work and review can check them. -->

-

## Non-Goals

<!-- What this change explicitly does NOT do. This is the main scope guard —
     be generous here, it prevents drift. -->

-

## Proposed Change

<!-- Product-level description of what changes and how a user experiences it.
     NOT implementation (that is design.md). Mark breaking changes **BREAKING**. -->

## Domain Context

<!-- Identify the project domain and its source. Mark proposed contexts or definitions as
     proposed, not existing facts. Name material unknowns in Open Questions; resolve them before
     approval. A package, service or transport is not automatically a bounded context. -->

### Ubiquitous Language

<!-- Cite .kepler/specs/glossary.md entries first, then supplementary project documentation.
     The same word may have different meanings in different contexts; scope each use and identify
     translations. Do not turn this section into an independent replacement glossary. -->

| Term | Meaning in this change | Bounded context | Source |
| --- | --- | --- | --- |
| <term> | <meaning consistent with its source> | <named context> | <glossary entry or project document> |

### Subdomains and Bounded Contexts

<!-- List each involved subdomain and context, its responsibility and why the change touches it.
     Include affected contexts that do not become separate capability files. Do not force a
     one-to-one mapping between subdomains, contexts and capabilities. -->

| Subdomain | Bounded context | Responsibility | Involvement in the change |
| --- | --- | --- | --- |
| <subdomain> | <bounded context> | <what it owns> | <why it is involved> |

## Capabilities

<!-- A capability is a cohesive, durable responsibility with a clear boundary and observable
     contract. It may represent a domain, subdomain or bounded context, including infrastructure.
     Identify scope kind and name, responsibility and relation to Domain Context for each entry.
     For example, rest-api may own an external model and translation into domain operations;
     domain contexts retain business rules. REST alone does not establish a bounded context.
     Avoid endpoint/file/wiring fragments and overlapping parent/child contracts.
     Each name maps to requirements/<capability>.md IF requirements are needed, then to
     .kepler/specs/<capability>.md. Preserve existing kebab-case slugs and metadata; scope stays
     in prose. Leave a subsection empty if it does not apply. -->

### New

- `<capability-name>`: <scope kind and name>; <responsibility>; <related contexts>.

### Modified

- `<existing-capability>`: <supported scope and related contexts>; <what contract or behavior changes>.

### Removed

- `<capability>`: <scope and related contexts>; <reason and migration path>.

## Impact

<!-- Affected code, APIs, dependencies, data, and users. Call out coordination or migration. -->

### Affected Boundaries

<!-- Cover responsibility, data ownership, interactions, contracts and trust across contexts.
     State what changes, who retains ownership and any compatibility or coordination obligations.
     If no boundary changes, explain the intact boundaries rather than inventing an impact.
     Detailed classes, ports and adapters belong in design.md. -->

| Boundary | Current responsibility or contract | Proposed impact | Coordination needed |
| --- | --- | --- | --- |
| <boundary between named contexts or external actors> | <current ownership and contract> | <what changes or remains intact> | <compatibility, migration or owner coordination> |

## Open Questions

<!-- Unresolved product decisions blocking or shaping this change. Remove the
     section if there are none. -->

-
