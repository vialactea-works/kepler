---
artifact: requirements-spec
capability: <capability-name>
status: current
updated: <YYYY-MM-DD>
author: <Name <email>>
decision: accepted | rejected | skipped
---

<!--
  SRS (canonical): the durable spec for one capability
  Lives at: .kepler/specs/<capability>.md
  This capability's source of truth describes its current behavior.

  Write readable documentation in plain prose and tables. Stay at altitude: describe the capability's guarantees rather than one commit's implementation. Keep the Requirement/SHALL/Scenario form in the change's requirements/<capability>.md deltas.

  Two skills produce this artifact:
    - kepler-finish-work incorporates a change's structured requirement deltas.
    - kepler-compose-spec writes it directly by reformatting an old spec or examining code.
  Both apply the altitude and skeleton rules in their references/spec-altitude.md.

  Keep all five top-level sections; lint requires them. When a section has no applicable facts, keep it concise and omit optional subsections rather than inventing content. Prefer flowing prose, but do not reject an existing lint-valid spec for its presentation.

  Before creating this artifact, read the configured Git identity with `git config user.name` and `git config user.email`, then set `author: Name <email>` using both values. If either is missing, ask the user or stop with a blocker; never invent an identity. When revising an artifact, preserve its recorded author unless the user explicitly directs an attribution change.

  Delete this comment block and inline hints before finalizing.
-->

# Capability: <capability-name>

## Overview

<!-- Orient a new reader in one paragraph: describe the capability's responsibility, represented scope (domain, subdomain or bounded context), related contexts and boundary ownership. Infrastructure scopes qualify when they own an observable contract, such as an external model and its translation into domain operations. Use scoped glossary meanings and distinguish evidenced boundaries from inferences. Keep scope in prose, preserve existing slugs and metadata, and do not force historical reclassification. Cite sources for language and ownership; flag unresolved meanings before publishing claims that depend on them. Keep private wiring and code attribution in design, not canonical requirements. -->

## Contract

<!-- Describe the concrete interface consumers use. Tables can clarify persisted schemas, request/response bodies, event payloads, config keys, status codes and error taxonomies. For a data-model capability, list field names and types; for an endpoint capability, list routes. Describe public ports, commands and events through their inputs, outcomes and error obligations. Avoid private interfaces, adapter classes and injection tokens.

     Add domain subheadings (### <event type>, ### <endpoint>) as merge anchors when a capability has several distinct contract surfaces. If it has no separate consumer-facing interface, retain this section and say so briefly. -->

| field | type | notes |
|-------|------|-------|
|       |      |       |

## Behavior

<!-- Describe input->output behavior, including edge cases and error paths. Follow with a compact, greppable Examples block whose bullets pair each input/trigger with an observable outcome. These examples define conformance checks; include only durable, black-box behavior. Cover applicable state transitions, guards and translation outcomes, keeping invariant ownership consistent with the named contexts. A proposed design does not prove that behavior is implemented. -->

**Examples**

- <input / trigger> -> <observable outcome>

## Invariants

<!-- State properties that hold across all states and over time. Reserve MUST / NEVER for this section. Name the context that owns each rule when relevant. If no invariants are known, say so briefly. -->

-

## Decisions

<!-- State reusable design rules or deliberate decisions that future work must follow. Describe the policy rather than an isolated occurrence. Draw from design.md's Decisions, including boundary, dependency-direction and translation policies that survive reimplementation. Exclude adapter-specific wiring and package layout. If no such rules or decisions are known, say so briefly. -->

-
