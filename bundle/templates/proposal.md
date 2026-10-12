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
  Owns the WHY and the product-level WHAT. Target length: 1–2 pages.
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

<!-- The outcomes that define success. Make them observable or measurable where
     you can, so finish-work and review have something concrete to check against. -->

-

## Non-Goals

<!-- What this change explicitly does NOT do. This is the main scope guard —
     be generous here, it prevents drift. -->

-

## Proposed Change

<!-- Product-level description of what changes and how a user experiences it.
     NOT implementation (that is design.md). Mark breaking changes **BREAKING**. -->

## Capabilities

<!-- The contract into the requirements step. Each capability named here maps to a
     requirements/<capability>.md file IF the requirements step is used.
     Use kebab-case names (e.g. log-command, spec-sync). Leave a section empty if
     it does not apply. -->

### New

- `<capability-name>`: <one line>

### Modified

- `<existing-capability>`: <what requirement-level behavior changes>

### Removed

- `<capability>`: <reason and migration path>

## Impact

<!-- Affected code, APIs, dependencies, data, and users. Call out anything that
     forces coordination or a migration. -->

## Open Questions

<!-- Unresolved product decisions blocking or shaping this change. Remove the
     section if there are none. -->

-
