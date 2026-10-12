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
  SRS (change delta) — Requirements / "What"   (ISO/IEC/IEEE 29148-inspired)
  Produced by: kepler-propose (step 1). One file per capability.
  Lives at: .kepler/changes/<change>/requirements/<capability>.md

  This is the DELTA form: it describes how a change alters a capability.
  kepler-finish-work folds these deltas into the canonical
  .kepler/specs/<capability>.md (which uses the requirements-spec.md form).

  Each requirement should be: necessary, unambiguous, verifiable, singular, feasible.
  Scenarios (WHEN/THEN) are proto-conformance tests — write them so a test could be
  derived directly. OPTIONAL artifact — skip when a change needs no formal requirements.
  Delete this comment block and inline hints before finalizing.
  A draft or a template decision default is never requester approval. Show the requester the exact final candidate bytes, including status: approved and decision: accepted, and wait for explicit approval of that revision before writing it. Commit exactly those approved bytes; any later intent edit needs new approval.
  Before creating this artifact, read the configured Git identity with `git config user.name` and
  `git config user.email`, then write `author: Name <email>` using both configured values. If either
  configured value is missing, ask the user or stop with a blocker rather than inventing an identity.
  When revising an existing artifact, preserve its recorded author unless the user explicitly directs
  an attribution change.
-->

# Capability: <capability-name>

<!-- One-line statement of what this capability is responsible for. -->

## ADDED Requirements

### Requirement: <short name>

The system SHALL <one normative statement>.

<!-- Use SHALL / MUST for normative rules. Avoid should/may. One requirement =
     one obligation (singular). Split compound requirements into several. -->

- Priority: must / should / could
- Rationale: <optional — why this exists; helps future readers and sync>

#### Scenario: <name>

- WHEN <trigger or precondition>
- THEN <observable, testable outcome>

<!-- Every requirement needs at least one scenario. Add scenarios for edge cases,
     error paths, and boundaries — each is a candidate test case. -->

## MODIFIED Requirements

<!-- The canonical .kepler/specs/<capability>.md is human-readable prose (Overview /
     Contract / Behavior / Invariants / Decisions), NOT requirement blocks — there is
     nothing to copy verbatim. Read the behavior the spec currently documents for this
     area, then write the WHOLE changed behavior as a requirement block below. Name it
     for the behavior it changes, so finish-work can locate the spec section to update.
     State the entire new behavior, not just the diff. -->

## REMOVED Requirements

### Requirement: <name>

- Reason: <why it is being removed>
- Migration: <what consumers should do instead>

## RENAMED Requirements

- FROM: `<old name>` TO: `<new name>`
