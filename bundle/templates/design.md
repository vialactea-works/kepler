---
artifact: design
change: <YYYY-MM-DD-change-title>
status: draft
created: <YYYY-MM-DD>
author: <Name <email>>
decision: skipped
route_unit: null
---

<!--
  SDD — Design / "How"   (IEEE 1016-inspired, right-sized)
  Produced by: kepler-propose (step 1 of the seven-stage pipeline).
  Owns HOW the change is built. References proposal.md for why, requirements/ for what.
  Focus on architecture and the decisions behind it — NOT line-by-line code
  (that belongs in plan.md).
  OPTIONAL artifact — skip for mechanical changes and start at plan.md.
  Scale each section to its complexity: a sentence when obvious, a few paragraphs
  when nuanced. Delete a section that does not apply.
  A draft or a template decision default is never requester approval. Show the requester the exact final candidate bytes, including status: approved and decision: accepted, and wait for explicit approval of that revision before writing it. Commit exactly those approved bytes; any later intent edit needs new approval.
  Delete this comment block and inline hints before finalizing.
  Before creating this artifact, read the configured Git identity with `git config user.name` and
  `git config user.email`, then write `author: Name <email>` using both configured values. If either
  configured value is missing, ask the user or stop with a blocker rather than inventing an identity.
  When revising an existing artifact, preserve its recorded author unless the user explicitly directs
  an attribution change.
-->

# Design: <Change Title>

## Context

<!-- Current state, constraints, and assumptions relevant to this change. What
     exists today that this builds on or works around? What must stay true? -->

## Goals / Non-Goals

**Goals**

- <what this design achieves>

**Non-Goals**

- <what is explicitly out of scope for the design>

## Decisions

<!-- The heart of the document. One block per significant choice. -->

### Decision: <name>

- Choice: <what we are doing>
- Alternatives considered: <X, Y — and why each was rejected>
- Rationale: <why this option wins; the trade-off you accepted>

## Architecture & Components

<!-- The units involved and how they fit. For each unit state: responsibility,
     public interface, and dependencies. A reader should understand what a unit
     does without reading its internals, and you should be able to change its
     internals without breaking consumers. A table or short sub-sections both work. -->

### Quality Lens

<!-- Record how this design holds up against code-quality.md — evidence, not a checkbox.
     Scale to the change: for a mechanical or single-file change, one line ("trivial — no
     structural risk") is enough. For a non-trivial change, cover:
     - Responsibility: each unit's single reason to change (if it needs "and", split it).
     - Boundaries & dependencies: what each unit hides; where high-level logic depends on an
       abstraction, and the seam a test substitutes for concrete IO/DB/clock.
     - Right-sizing: an abstraction or extension point you deliberately did NOT add.
     - Accepted smells: any structural trade-off taken on purpose, and why (also list it under
       Risks / Trade-offs). This is the gate's blocking record — an unresolved smell that is
       neither fixed nor recorded here fails the self-review. -->

## Data & Flow

<!-- Data model changes and the main control/data flow (the happy path as a
     sequence). Omit if trivial. -->

## Error Handling & Edge Cases

<!-- Failure modes and the expected behavior for each. A "Failure -> Behavior"
     table works well. Include what happens on partial failure and retry. -->

## Testing Strategy

<!-- What will prove this works: unit vs integration boundaries, the key cases to
     cover, and how verification runs. Name the tactical gates, `kepler-code` and
     `kepler-code-feedback`, and the final gates, `kepler-review` and
     `kepler-finish-work`. -->

## Constraints & Boundaries

<!-- Change-specific operating boundaries for the implementing agent, in three tiers.
     Standing project-wide boundaries belong in project standards (AGENTS.md /
     guidelines), not here — list only what is special to THIS change.
     "Ask first" is resolved by the skill asking the user for input; when running
     unattended, the agent auto-reflects — it answers the question itself and records
     the reasoning before proceeding. Omit the section if none. -->

- Always: <actions the agent should take without asking, e.g. run tests before commit>
- Ask first: <actions needing a decision, e.g. changing a public interface>
- Never: <hard stops, e.g. touch the auth module, delete a failing test>

## Risks / Trade-offs

<!-- Known risks and limitations. Format: [Risk] -> Mitigation. -->

## Migration / Rollout

<!-- Deploy steps, backward compatibility, and rollback strategy. Omit if not
     applicable. -->

## Open Questions

<!-- Outstanding unknowns to resolve before or during implementation. Remove if none. -->

-
