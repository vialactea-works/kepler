---
artifact: requirements-spec
capability: <capability-name>
status: current
updated: <YYYY-MM-DD>
author: <Name <email>>
decision: accepted | rejected | skipped
---

<!--
  SRS (canonical) — the durable spec for one capability
  Lives at: .kepler/specs/<capability>.md
  The living source of truth for this capability. It always states CURRENT behavior.

  Written to READ LIKE DOCUMENTATION A HUMAN WROTE — plain prose and tables, at
  altitude (what the capability guarantees, not the mechanism one commit used).
  It does NOT use the change-side Requirement/SHALL/Scenario form; that stays in the
  change's requirements/<capability>.md deltas.

  Produced two ways:
    - kepler-finish-work folds a change's structured requirement deltas into here.
    - kepler-compose-spec authors it directly (reformat an old spec, or from code).
  Both apply the altitude + skeleton rules in each skill's references/spec-altitude.md.

  Keep all five top-level sections: lint requires them. When a register has no applicable
  facts, keep its section concise and omit optional subsections instead of inventing content.
  Prefer flowing prose, but do not reject an existing lint-valid spec for its presentation.
  Before creating this artifact, read the configured Git identity with `git config user.name`
  and `git config user.email`, then write `author: Name <email>` using both
  configured values. If either configured value is missing, ask the user or stop with a blocker rather
  than inventing an identity. When revising an existing artifact, preserve its recorded author unless
  the user explicitly directs an attribution change. Delete this comment block and inline hints before
  finalizing.
-->

# Capability: <capability-name>

## Overview

<!-- One paragraph, plain prose: the capability's responsibility, represented scope
     (domain, subdomain or bounded context), related contexts and boundary ownership.
     Infrastructure scopes qualify when they own an observable contract, such as an external
     model and translation into domain operations. Use scoped glossary meanings; distinguish
     evidenced boundaries from inferences. Keep scope in prose, preserve existing slugs and
     metadata, and do not force historical reclassification. Cite language and ownership sources;
     surface unresolved meanings before publishing dependent claims. Private wiring and code
     attribution belong in design, not in canonical requirements. Orient a new reader. -->

## Contract

<!-- The concrete interface a consumer touches. Tables can clarify shaped contracts:
     persisted schema, request/response bodies, event payloads, config keys, status
     codes, error taxonomy. This is where a data-model capability shows its field
     names and types, and an endpoint capability shows its routes. Describe public ports, commands
     and events as consumer contracts, with inputs, outcomes and error obligations; avoid private
     interfaces, adapter classes and injection tokens.
     Add domain subheadings (### <event type>, ### <endpoint>) as merge anchors when a
     capability has several distinct contract surfaces. Keep this section even if there
     is no separate consumer-facing interface; state that concisely. -->

| field | type | notes |
|-------|------|-------|
|       |      |       |

## Behavior

<!-- Narrative input->output prose, including edge and error paths. Then a compact,
     greppable Examples block: each bullet an input/trigger -> observable outcome. The
     Examples are this spec's conformance points (the distilled proto-tests) — keep
     only ones that state durable, black-box behavior. Include applicable state transitions, guards
     and translation outcomes, keeping invariant ownership consistent with the named contexts.
     A proposed design is not proof that a behavior is already implemented. -->

**Examples**

- <input / trigger> -> <observable outcome>

## Invariants

<!-- Properties that hold across all states and over time. This is the one section
     where MUST / NEVER earn their keep. Name the context that owns a rule when relevant.
     If none are known, say so briefly. -->

-

## Decisions

<!-- Reusable design rules or deliberate decisions future work must follow ("policy,
     not incident"). State the rule, not the one occurrence. Draw from design.md's
     Decisions, including durable boundary, dependency-direction and translation policy. These
     survive reimplementation; one adapter's wiring or package layout does not. If none are known,
     say so briefly. -->

-
