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
  PRD: Proposal / "Why"
  Produced by: kepler-propose (step 1)
  Explain why the change is needed and what it delivers, using project language and domain boundaries.
  Target length: 1–2 pages; concise rows are enough for a small change.
  New proposals include Domain Context and Affected Boundaries. Historical lint-valid proposals
  remain valid without these sections; do not rewrite approved history.
  Optional artifact: small changes may start at plan.md.
  Drafts and template defaults do not establish requester approval. Present the exact final candidate bytes,
  including status: approved and decision: accepted, and obtain explicit approval before writing them.
  Commit exactly those bytes. Later intent edits require fresh approval.
  Delete this comment block and all inline hints before finalizing.
  Before creating this artifact, read `git config user.name` and `git config user.email`.
  Use both values in `author: Name <email>`. If either is missing, ask the user or stop;
  never invent an identity. Preserve existing author attribution unless the user directs a change.
-->

# Proposal: <Change Title>

## Why

<!-- The problem or opportunity in 1–3 sentences. What hurts today? Why now?
     Focus on the motivation, not the solution. -->

## Goals & Success Criteria

<!-- Express outcomes in the canonical glossary's context-scoped language. Use established project
     documentation for missing definitions and cite it in Domain Context. Ask the requester to resolve
     conflicts and proposed meanings; do not redefine canonical terms. Make outcomes observable or
     measurable so finish-work and review can verify them. -->

-

## Non-Goals

<!-- List explicit exclusions. Be thorough: this section guards against scope drift. -->

-

## Proposed Change

<!-- Describe what changes and how users experience it. Put implementation details in design.md.
     Mark breaking changes **BREAKING**. -->

## Domain Context

<!-- Identify the project domain and cite its source. Distinguish proposed contexts and definitions
     from established facts. Record material unknowns in Open Questions and resolve them before
     approval. A package, service or transport does not by itself define a bounded context. -->

### Ubiquitous Language

<!-- Cite .kepler/specs/glossary.md entries first, then supplementary project documentation.
     Scope terms to their contexts and explain translations between meanings.
     Reference the glossary rather than replacing it here. -->

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
     For example, rest-api may own an external model and translation boundary while domain contexts
     retain business rules. Context boundaries depend on model ownership, not the use of REST.
     Avoid fragments named after endpoints, files or wiring, and overlapping parent and child contracts.
     Each name maps to requirements/<capability>.md when requirements are needed, then to
     .kepler/specs/<capability>.md. Preserve existing kebab-case slugs and metadata; scope stays
     in prose. Leave a subsection empty if it does not apply. -->

### New

- `<capability-name>`: <scope kind and name>; <responsibility>; <related contexts>.

### Modified

- `<existing-capability>`: <supported scope and related contexts>; <what contract or behavior changes>.

### Removed

- `<capability>`: <scope and related contexts>; <reason and migration path>.

## Impact

<!-- Identify affected code, APIs, dependencies, data and users, including coordination or migration needs. -->

### Affected Boundaries

<!-- Cover responsibility, data ownership, interactions, contracts and trust across contexts.
     State what changes, who retains ownership and any compatibility or coordination obligations.
     If no boundary changes, explain the intact boundaries rather than inventing an impact.
     Detailed classes, ports and adapters belong in design.md. -->

| Boundary | Current responsibility or contract | Proposed impact | Coordination needed |
| --- | --- | --- | --- |
| <boundary between named contexts or external actors> | <current ownership and contract> | <what changes or remains intact> | <compatibility, migration or owner coordination> |

## Open Questions

<!-- List unresolved product decisions that block or shape this change. Remove the section if none remain. -->

-
