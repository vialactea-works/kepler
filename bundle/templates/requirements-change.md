---
artifact: requirements-change
capability: <capability-name>
change: <YYYY-MM-DD-change-title>
status: draft
created: <YYYY-MM-DD>
author: <Name <email>>
decision: skipped
---

<!--
  SRS (change delta): Requirements / "What" (ISO/IEC/IEEE 29148-inspired)
  Produced by: kepler-propose (step 1). One file per capability.
  Lives at: .kepler/changes/<change>/requirements/<capability>.md

  This delta describes how a change alters a capability. kepler-finish-work folds it into the canonical .kepler/specs/<capability>.md, which uses requirements-spec.md.

  Each requirement should be necessary, unambiguous, verifiable, singular and feasible. Write WHEN/THEN scenarios from which tests can be derived directly. This artifact is optional; skip it when a change needs no formal requirements.

  A draft or template decision default does not grant requester approval. Show the requester the exact final candidate bytes, including status: approved and decision: accepted. Wait for explicit approval of that revision before writing it, then commit exactly those bytes. Later intent edits require new approval.

  Before creating this artifact, read the configured Git identity with `git config user.name` and `git config user.email`, then set `author: Name <email>` using both values. If either is missing, ask the user or stop with a blocker; never invent an identity. When revising an artifact, preserve its recorded author unless the user explicitly directs an attribution change.

  Delete this comment block and inline hints before finalizing.
-->

# Capability: <capability-name>

<!-- Describe the capability's responsibility, represented scope (domain, subdomain or bounded context) and relevant context boundary in prose. Infrastructure scopes qualify when they own a durable contract; a transport or endpoint alone does not establish a context. Use canonical glossary meanings and sourced project language. Preserve capability slugs and the delta-to-spec mapping; do not add mandatory scope metadata. -->

## ADDED Requirements

### Requirement: <short name>

The system SHALL <one normative statement>.

<!-- Use SHALL / MUST for normative rules; avoid should/may. Give each requirement one obligation. Split compound requirements. -->

- Priority: must / should / could
- Rationale: <optional: why this requirement exists; helps future readers and spec synchronization>

#### Scenario: <name>

- WHEN <trigger or precondition>
- THEN <observable, testable outcome>

<!-- Give every requirement at least one scenario. Cover edge cases, error paths and boundaries; each scenario is a candidate test case. -->

## MODIFIED Requirements

<!-- The canonical .kepler/specs/<capability>.md uses prose sections (Overview / Contract / Behavior / Invariants / Decisions), not requirement blocks to copy verbatim. Read the relevant current behavior, then write the complete new behavior as a requirement block below, not just the diff. Name the requirement for the behavior it changes so finish-work can locate the spec section to update. -->

## REMOVED Requirements

### Requirement: <name>

- Reason: <why this requirement is being removed>
- Migration: <what consumers should do instead>

## RENAMED Requirements

- FROM: `<old name>` TO: `<new name>`
