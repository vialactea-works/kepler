---
artifact: requirements-spec
capability: glossary
status: current
updated: <YYYY-MM-DD>
author: <Name <email>>
decision: skipped
---

<!--
  Canonical ubiquitous language
  Produced by: kepler-init; maintained through kepler-wayfinder-domain-modeling and the Wayfinder closing act.
  Lives at: .kepler/specs/glossary.md
  Keep requirements-spec metadata and all five required sections for artifact-lint compatibility.
  This is vocabulary support, not a new business capability or an implementation specification.
  Seed only established project definitions, with their bounded-context scope, aliases and source.
  The same word may have different meanings in different contexts. Resolve a conflict with the
  requester; never replace a canonical meaning because a working term is newer.
  Do not infer a bounded context from a directory, service or transport. If scope is unresolved
  and material to the meaning, ask instead of inventing it. Use project-wide scope only when the
  evidence supports a shared meaning. If no project-specific terms are supported, remove the
  sample row and state that explicitly. Keep open questions outside canonical entries.
  Do not include code, implementation details, architecture decisions or unconfirmed definitions.
  Before creating this artifact, read the configured Git identity with `git config user.name`
  and `git config user.email`, then write `author: Name <email>` using both configured values.
  If either configured value is missing, ask the user or stop with a blocker rather than inventing
  an identity. When revising an existing artifact, preserve its recorded author unless the user
  explicitly directs an attribution change. A default decision is not requester confirmation;
  keep decision: skipped unless the requester confirms the language.
  Delete this instruction block and every inline hint before finalizing.
-->

# Capability: glossary

## Overview

The project's canonical, context-scoped ubiquitous language. Project artifacts use these established meanings; the cited sources explain where each definition applies.

## Contract

| Term | Definition | Bounded context | Aliases / terms to avoid | Source |
| --- | --- | --- | --- | --- |
| <term> | <one or two sentences defining the concept> | <named context or evidenced project-wide scope> | <relevant aliases, avoided terms, or none> | <project document or recorded requester resolution> |

## Behavior

Read a term within its named context. Distinct contexts may use the same word for different concepts; cross-context documents identify the meanings and their translation rather than assuming equivalence.

## Invariants

- A canonical entry states an established meaning with its scope and source.
- A conflicting or unresolved proposed definition does not replace established language.

## Decisions

<!-- Confirmed naming choices only, if applicable. Keep architectural and implementation
     decisions in their owning artifacts. If none are recorded, state that concisely. -->
